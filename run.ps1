#!/usr/bin/env pwsh
<#
  Starts the full Messenger App stack:
    - Docker Desktop (Postgres + Redis containers)
    - Backend dev server (http://localhost:4000)
    - Frontend dev server (http://localhost:5173)

  Usage: ./run.ps1
#>

$root = $PSScriptRoot

# 1. Make sure Docker is running
Write-Host "Checking Docker..." -ForegroundColor Cyan
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker is not running. Launching Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

    Write-Host "Waiting for Docker to be ready (this can take a minute)..." -ForegroundColor Yellow
    do {
        Start-Sleep -Seconds 5
        docker info > $null 2>&1
    } while ($LASTEXITCODE -ne 0)
}
Write-Host "Docker is ready." -ForegroundColor Green

# 2. Start Postgres + Redis containers
Write-Host "Starting Postgres + Redis containers..." -ForegroundColor Cyan
Push-Location "$root\backend"
docker compose up -d
Pop-Location

# 3. Start backend dev server in its own window
Write-Host "Starting backend dev server (http://localhost:4000)..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$root\backend'; npm run dev"
)

# 4. Start frontend dev server in its own window
Write-Host "Starting frontend dev server (http://localhost:5173)..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Backend:  http://localhost:4000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "(Each dev server is running in its own PowerShell window. Close those windows to stop them.)"
