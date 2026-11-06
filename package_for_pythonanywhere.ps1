param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'ChemStorePro-pythonanywhere.zip')
)

$ErrorActionPreference = 'Stop'
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ('chemstore-pa-' + [guid]::NewGuid().ToString('N'))

New-Item -ItemType Directory -Path $stagingDir | Out-Null
try {
    foreach ($name in @('app.py', 'flask_app.py', 'wsgi.py', 'requirements.txt')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stagingDir
    }

    $database = Join-Path $PSScriptRoot 'warehouse.db'
    if (Test-Path -LiteralPath $database) {
        Copy-Item -LiteralPath $database -Destination $stagingDir
    }

    foreach ($directory in @('templates', 'static')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $directory) -Destination $stagingDir -Recurse
    }

    Get-ChildItem -LiteralPath $stagingDir -Recurse -Directory -Filter '__pycache__' |
        Remove-Item -Recurse -Force

    if (Test-Path -LiteralPath $OutputPath) {
        Remove-Item -LiteralPath $OutputPath -Force
    }

    Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $OutputPath -CompressionLevel Optimal
    $size = [math]::Round((Get-Item -LiteralPath $OutputPath).Length / 1MB, 2)
    Write-Host "Created $OutputPath ($size MB)"
}
finally {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
}
