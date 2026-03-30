$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found in PATH. Install Node.js and npm first.'
}

Write-Host 'Installing dependencies...'
npm install
if ($LASTEXITCODE -ne 0) {
    throw 'npm install failed.'
}

Write-Host 'Starting Electron app...'
npm start
if ($LASTEXITCODE -ne 0) {
    throw 'npm start failed.'
}