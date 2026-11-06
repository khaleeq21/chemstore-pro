param(
    [string]$Python = (Join-Path $PSScriptRoot '.venv\Scripts\python.exe'),
    [string]$Iscc = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Python)) {
    $Python = 'python'
}

Push-Location $PSScriptRoot
try {
    Write-Host "Building executable with $Python ..."
    & $Python -m PyInstaller --noconfirm --clean app.spec
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller build failed.' }

    # Never ship runtime data or the per-install secret key.
    Remove-Item -LiteralPath 'dist\app\.secret_key' -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath 'dist\app\warehouse.db' -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath 'dist\app\static\uploads') {
        Get-ChildItem -LiteralPath 'dist\app\static\uploads' -Force | Remove-Item -Force -Recurse
    }

    if (-not $Iscc) {
        $candidates = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
            (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
        )
        $Iscc = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    }

    if (-not $Iscc) {
        throw 'Inno Setup (ISCC.exe) was not found. Install it from https://jrsoftware.org/isdl.php or pass -Iscc.'
    }

    Write-Host "Compiling installer with $Iscc ..."
    & $Iscc 'installer.iss'
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }

    $installer = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'installer') -Filter 'ChemStorePro-Setup-*.exe' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    Write-Host "`nBuilding portable single-file executable ..."
    $templatesPath = Join-Path $PSScriptRoot 'templates'
    $staticPath = Join-Path $PSScriptRoot 'static'
    $iconPath = Join-Path $PSScriptRoot 'app.ico'
    $entryPath = Join-Path $PSScriptRoot 'app.py'
    & $Python -m PyInstaller --noconfirm --clean --onefile --console --name ChemStorePro --icon $iconPath `
        --add-data "$templatesPath;templates" --add-data "$staticPath;static" `
        --distpath 'portable' --workpath 'build\portable' --specpath 'build\portable' $entryPath
    if ($LASTEXITCODE -ne 0) { throw 'Portable build failed.' }

    Remove-Item -LiteralPath 'portable\.secret_key' -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath 'portable\warehouse.db' -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath 'portable\static\uploads') {
        Get-ChildItem -LiteralPath 'portable\static\uploads' -Force | Remove-Item -Force -Recurse
    }

    $portable = Join-Path $PSScriptRoot 'portable\ChemStorePro.exe'
    Write-Host "`nInstaller: $($installer.FullName)"
    Write-Host "Portable:  $portable"
}
finally {
    Pop-Location
}
