$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$bundleRoot = Join-Path $projectRoot "out\hosting\Tend-hosting"
$appRoot = Join-Path $bundleRoot "app"
$bundleLiveKitRoot = Join-Path $bundleRoot "livekit"
$publishWebRoot = Join-Path $appRoot "wwwroot"
$avatarsRoot = Join-Path $publishWebRoot "avatars"
$chatFilesRoot = Join-Path $publishWebRoot "chat-files"
$distRoot = Join-Path $projectRoot "dist"
$backendProject = Join-Path $projectRoot "BackNoDiscord\BackNoDiscord\BackNoDiscord.csproj"
$runtimeEnvExample = Join-Path $projectRoot ".env.example"
$productionSettingsExample = Join-Path $projectRoot "BackNoDiscord\BackNoDiscord\appsettings.Production.json.example"
$liveKitComposeSource = Join-Path $projectRoot "src\livekit\docker-compose.yml"
$liveKitConfigSource = Join-Path $projectRoot "src\livekit\config.local.yaml"
$serverReadyEnvPath = Join-Path $bundleRoot ".env.server-85.198.68.187"
$appEnvPath = Join-Path $appRoot ".env"

Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location $projectRoot
try {
    npm run build:frontend
}
finally {
    Pop-Location
}

if (!(Test-Path $distRoot)) {
    throw "Frontend dist folder was not produced: $distRoot"
}

if (Test-Path $bundleRoot) {
    Remove-Item -LiteralPath $bundleRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $bundleRoot | Out-Null

Write-Host "Publishing backend..." -ForegroundColor Cyan
dotnet publish $backendProject --configuration Release --output $appRoot -p:UseAppHost=false

New-Item -ItemType Directory -Path $publishWebRoot -Force | Out-Null

if (Test-Path $avatarsRoot) {
    Remove-Item -LiteralPath $avatarsRoot -Recurse -Force
}

if (Test-Path $chatFilesRoot) {
    Remove-Item -LiteralPath $chatFilesRoot -Recurse -Force
}

Get-ChildItem -LiteralPath $publishWebRoot -Force | ForEach-Object {
    if ($_.Name -notin @("avatars", "chat-files")) {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

Copy-Item -Path (Join-Path $distRoot "*") -Destination $publishWebRoot -Recurse -Force
New-Item -ItemType Directory -Path $avatarsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $chatFilesRoot -Force | Out-Null

Copy-Item -LiteralPath $runtimeEnvExample -Destination (Join-Path $bundleRoot ".env.example") -Force
Copy-Item -LiteralPath $productionSettingsExample -Destination (Join-Path $bundleRoot "appsettings.Production.json.example") -Force

New-Item -ItemType Directory -Path $bundleLiveKitRoot -Force | Out-Null
Copy-Item -LiteralPath $liveKitComposeSource -Destination (Join-Path $bundleLiveKitRoot "docker-compose.yml") -Force
Copy-Item -LiteralPath $liveKitConfigSource -Destination (Join-Path $bundleLiveKitRoot "config.local.yaml") -Force

$liveKitConfigPath = Join-Path $bundleLiveKitRoot "config.local.yaml"
$liveKitConfigContent = Get-Content -LiteralPath $liveKitConfigPath -Raw
$liveKitConfigContent = $liveKitConfigContent -replace 'use_external_ip:\s*false', 'use_external_ip: true'
Set-Content -LiteralPath $liveKitConfigPath -Value $liveKitConfigContent -Encoding UTF8

$serverReadyEnvContent = @'
ConnectionStrings__DefaultConnection=Host=localhost;Port=5432;Database=voiceapp;Username=postgres;Password=CHANGE_ME
Jwt__Key=REPLACE_WITH_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
Jwt__Issuer=BackNoDiscord
Jwt__Audience=BackNoDiscordUsers
Jwt__AccessTokenMinutes=10080
Jwt__RefreshTokenDays=14
Crypto__Key=REPLACE_WITH_A_SEPARATE_LONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
Email__Mode=smtp
Email__FromAddress=no-reply@example.com
Email__FromName=Tend
Email__Smtp__Host=smtp.example.com
Email__Smtp__Port=465
Email__Smtp__Username=YOUR_SMTP_LOGIN
Email__Smtp__Password=YOUR_SMTP_PASSWORD
Email__Smtp__EnableSsl=true
ND_API_URL=https://api.85.198.68.187.sslip.io
ND_PUBLIC_APP_URL=https://api.85.198.68.187.sslip.io
ND_ALLOWED_ORIGINS=https://api.85.198.68.187.sslip.io
ND_LIVEKIT_URL=wss://live.85.198.68.187.sslip.io
ND_ICE_TRANSPORT_POLICY=all
LiveKit__Url=wss://live.85.198.68.187.sslip.io
LIVEKIT_KEYS=devkey: REPLACE_WITH_YOUR_OWN_LIVEKIT_SECRET
ClientUpdates__LatestVersion=1.0.0
ClientUpdates__MinimumVersion=1.0.0
ClientUpdates__AutoInstallOnQuit=true
# ClientUpdates__Windows__X64__DownloadUrl=https://downloads.example.com/Tend%20Setup%201.0.0.exe
# ClientUpdates__Windows__X64__Sha256=REPLACE_WITH_INSTALLER_SHA256
'@

Set-Content -LiteralPath $serverReadyEnvPath -Value $serverReadyEnvContent -Encoding UTF8
Set-Content -LiteralPath $appEnvPath -Value $serverReadyEnvContent -Encoding UTF8

$startScriptPath = Join-Path $bundleRoot "start-backend.sh"
@'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/app"
exec dotnet BackNoDiscord.dll
'@ | Set-Content -Path $startScriptPath -Encoding UTF8

$readmePath = Join-Path $bundleRoot "README.txt"
@'
Tend hosting bundle

Structure:
- app/       published ASP.NET backend + web frontend in wwwroot
- livekit/   docker-compose and config for LiveKit
- .env.example
- appsettings.Production.json.example

What to upload:
- upload the whole Tend-hosting folder to the server

How to run backend:
1. create app/.env from ../.env.example or set environment variables
2. make sure PostgreSQL is available
3. run: dotnet BackNoDiscord.dll

Important:
- this bundle already serves the web frontend from the backend root
- voice/screen share still require LiveKit
- avatars and chat-files folders are created empty on purpose
- app/.env is already prefilled for 85.198.68.187.sslip.io
'@ | Set-Content -Path $readmePath -Encoding UTF8

Write-Host ""
Write-Host "Hosting bundle is ready:" -ForegroundColor Green
Write-Host $bundleRoot
