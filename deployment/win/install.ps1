# install.ps1 - provisions everything needed to run Canvas Reader on Windows.
# 1. Downloads a portable Node.js (if none is available) into .\node
# 2. Installs the project dependencies via `npm ci` into .\node_modules
#
# Usage:  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$NodeVer = "v20.18.0"
$NodeUrl = "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-x64.zip"
$NodeZip = "node-$NodeVer-win-x64.zip"

# ---- 1. Portable Node ----
$haveSystemNode = $false
try { $v = & node --version 2>$null; if ($LASTEXITCODE -eq 0 -and $v) { $haveSystemNode = $true } } catch { $haveSystemNode = $false }

if (-not (Test-Path "node\node.exe") -and -not $haveSystemNode) {
    Write-Host "[Canvas Reader] Downloading portable Node.js $NodeVer ..."
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
    Write-Host "[Canvas Reader] Extracting ..."
    Expand-Archive -Path $NodeZip -DestinationPath "." -Force
    Move-Item -Path "node-$NodeVer-win-x64" -Destination "node" -Force
    Remove-Item $NodeZip -Force
} else {
    Write-Host "[Canvas Reader] Node.js available (system: $haveSystemNode, bundled: $(Test-Path 'node\node.exe')). Skipping download."
}

# ---- 2. Dependencies ----
if (-not (Test-Path "node_modules")) {
    Write-Host "[Canvas Reader] Installing dependencies (npm ci) ..."
    $nodeExe = "node\node.exe"
    if (Test-Path $nodeExe) { $npm = "node\node_modules\npm\bin\npm-cli.js" } else { $npm = $null }
    if ($npm -and (Test-Path $npm)) {
        & ".\node\node.exe" $npm ci
    } else {
        npm ci
    }
} else {
    Write-Host "[Canvas Reader] node_modules already present. Skipping install."
}

Write-Host ""
Write-Host "[Canvas Reader] Ready. Convert a canvas with:"
Write-Host "   run.bat path\to\your.canvas.tsx"
Write-Host "   run.bat testcases\example.canvas.tsx out\preview.html"
