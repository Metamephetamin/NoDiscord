$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$dotnetHome = Join-Path $projectRoot ".dotnet"
$projectPath = Join-Path $projectRoot "BackNoDiscord\BackNoDiscord\BackNoDiscord.csproj"

if (-not (Test-Path $dotnetHome)) {
    New-Item -ItemType Directory -Path $dotnetHome | Out-Null
}

$env:DOTNET_CLI_HOME = $dotnetHome
$env:HOME = $dotnetHome
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = "1"
$env:DOTNET_NOLOGO = "1"
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ASPNETCORE_URLS = "http://localhost:7031"

Write-Host "Starting backend on http://localhost:7031"
dotnet run --project $projectPath --no-launch-profile
