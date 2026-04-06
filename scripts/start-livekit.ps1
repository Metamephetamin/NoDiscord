$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$keysFile = Join-Path $projectRoot "src\livekit\livekit-keys.txt"
$bundledBinary = Join-Path $projectRoot "src\livekit\livekit-server.exe"
$envFile = Join-Path $projectRoot ".env"
$configFile = Join-Path $projectRoot "src\livekit\config.local.yaml"

function Stop-DockerLiveKitIfRunning {
    $dockerCommand = Get-Command "docker" -ErrorAction SilentlyContinue
    if (-not $dockerCommand) {
        return
    }

    try {
        $runningContainerNames = & $dockerCommand.Source "ps" "--format" "{{.Names}}"
        if ($LASTEXITCODE -ne 0) {
            return
        }

        $normalizedNames = @($runningContainerNames) | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        if ($normalizedNames -notcontains "livekit") {
            return
        }

        Write-Host "Stopping Docker LiveKit container before native startup. This avoids ICE failures on local Windows dev."
        & $dockerCommand.Source "stop" "livekit" | Out-Null
        if ($LASTEXITCODE -eq 0) {
            & $dockerCommand.Source "rm" "livekit" | Out-Null
        }
    } catch {
        Write-Warning "Failed to stop Docker LiveKit container automatically: $($_.Exception.Message)"
    }
}

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
Stop-DockerLiveKitIfRunning

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
