$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$dotnetHome = Join-Path $projectRoot ".dotnet"
$projectPath = Join-Path $projectRoot "BackNoDiscord\BackNoDiscord\BackNoDiscord.csproj"
$envFile = Join-Path $projectRoot ".env"

function Import-DotEnv {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()

        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            return
        }

        $parts = $line.Split("=", 2)
        if ($parts.Count -ne 2) {
            return
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"')

        if (-not [string]::IsNullOrWhiteSpace($name)) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

Import-DotEnv -Path $envFile

if (-not (Test-Path $dotnetHome)) {
    New-Item -ItemType Directory -Path $dotnetHome | Out-Null
}

$env:DOTNET_CLI_HOME = $dotnetHome
$env:HOME = $dotnetHome
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = "1"
$env:DOTNET_NOLOGO = "1"
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ASPNETCORE_URLS = "http://localhost:7031"

if ($env:ND_USE_SMTP_IN_DEV -ne "1") {
    $env:Email__Mode = "mock"
}

Write-Host "Starting backend on http://localhost:7031"
dotnet run --project $projectPath --no-launch-profile
