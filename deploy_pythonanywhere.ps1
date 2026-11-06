param(
    [Parameter(Mandatory = $true)]
    [string]$Username,
    [string]$TokenFile = '',
    [string]$HostName = 'www.pythonanywhere.com',
    [switch]$PreserveDatabase,
    [switch]$RemoveTokenFile,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
if (-not $TokenFile) {
    $TokenFile = Join-Path $projectDir 'pa_token.txt'
}
$user = $Username.ToLower()
$domain = "$user.pythonanywhere.com"
$baseUrl = "https://$HostName"
$remoteDir = "/home/$user/mysite"
$token = ''

if (-not $DryRun) {
    if (-not (Test-Path -LiteralPath $TokenFile)) {
        throw "Token file not found: $TokenFile"
    }
    $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
    if (-not $token) {
        throw "Token file is empty: $TokenFile"
    }
}

$files = @()
foreach ($name in @('app.py', 'flask_app.py', 'wsgi.py', 'requirements.txt')) {
    $path = Join-Path $projectDir $name
    if (Test-Path -LiteralPath $path) {
        $files += Get-Item -LiteralPath $path
    }
}
if (-not $PreserveDatabase) {
    $database = Join-Path $projectDir 'warehouse.db'
    if (Test-Path -LiteralPath $database) {
        $files += Get-Item -LiteralPath $database
    }
}
foreach ($directory in @('templates', 'static')) {
    $path = Join-Path $projectDir $directory
    if (Test-Path -LiteralPath $path) {
        $files += Get-ChildItem -LiteralPath $path -Recurse -File
    }
}
$files = $files | Where-Object { $_.FullName -notmatch '__pycache__' }

if (-not $DryRun) {
    $headers = @{ Authorization = "Token $token" }
    $webappUrl = "$baseUrl/api/v0/user/$user/webapps/$domain/"
    try {
        $webapp = Invoke-RestMethod -Uri $webappUrl -Headers $headers -Method Get
        if ($webapp.source_directory) {
            $remoteDir = $webapp.source_directory
        }
    }
    catch {
        throw "Could not read the web app config. Check the username, token, and that the Flask app exists. $($_.Exception.Message)"
    }
}

Write-Host "Domain:      https://$domain"
Write-Host "Remote dir:  $remoteDir"
Write-Host "Files:       $($files.Count)"

foreach ($file in $files) {
    $relative = $file.FullName.Substring($projectDir.Length).TrimStart('\', '/') -replace '\\', '/'
    $remotePath = "$remoteDir/$relative"
    if ($DryRun) {
        Write-Host "  $relative -> $remotePath"
    }
    else {
        $uploadUrl = "$baseUrl/api/v0/user/$user/files/path$remotePath"
        $status = & curl.exe -s -o NUL -w "%{http_code}" -H "Authorization: Token $token" -F "content=@$($file.FullName)" $uploadUrl
        if ($LASTEXITCODE -ne 0 -or $status -notin @('200', '201')) {
            throw "Upload failed for $relative (HTTP $status)."
        }
        Write-Host "  Uploaded $relative"
    }
}

if ($DryRun) {
    Write-Host 'Dry run complete. No files were uploaded.'
}
else {
    $reloadUrl = "$baseUrl/api/v0/user/$user/webapps/$domain/reload/"
    $status = & curl.exe -s -o NUL -w "%{http_code}" -X POST -H "Authorization: Token $token" $reloadUrl
    if ($LASTEXITCODE -ne 0 -or $status -ne '200') {
        throw "Web app reload failed (HTTP $status)."
    }

    Start-Sleep -Seconds 4
    try {
        $response = Invoke-WebRequest -UseBasicParsing "https://$domain/" -TimeoutSec 20
        if ($response.Content -match 'ChemStore Pro') {
            Write-Host "Deployed successfully: https://$domain"
        }
        else {
            Write-Warning "The site is online but is not showing ChemStore Pro yet. Check the web app WSGI configuration."
        }
    }
    catch {
        Write-Warning "Deployment uploaded, but the live check failed: $($_.Exception.Message)"
    }

    if ($RemoveTokenFile) {
        Remove-Item -LiteralPath $TokenFile -Force -ErrorAction SilentlyContinue
    }
}
