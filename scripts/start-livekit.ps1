$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$keysFile = Join-Path $projectRoot "src\livekit\livekit-keys.txt"
$bundledBinary = Join-Path $projectRoot "src\livekit\livekit-server.exe"
$envFile = Join-Path $projectRoot ".env"
$configFile = Join-Path $projectRoot "src\livekit\config.local.yaml"

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

$livekitCommand = Get-Command "livekit-server" -ErrorAction SilentlyContinue

if ($livekitCommand) {
    $livekitExecutable = $livekitCommand.Source
} elseif (Test-Path $bundledBinary) {
    $livekitExecutable = $bundledBinary
} else {
    Write-Error "livekit-server not found. Install it into PATH or place livekit-server.exe in src\\livekit\\."
}

if (-not $env:LIVEKIT_KEYS) {
    if (Test-Path $keysFile) {
        $keyPair = (Get-Content $keysFile | Select-Object -First 1).Trim()
        $env:LIVEKIT_KEYS = ($keyPair -replace ":\s+", ": ")
    } else {
        Write-Error "LIVEKIT_KEYS is missing. Set it in .env or in the process environment."
    }
}

if (-not (Test-Path $configFile)) {
    Write-Error "LiveKit config file not found: $configFile"
}

Write-Host "Starting LiveKit with config $configFile on ws://127.0.0.1:7880"
& $livekitExecutable "--config" "$configFile"
