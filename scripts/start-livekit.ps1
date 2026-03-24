$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$keysFile = Join-Path $projectRoot "src\livekit\livekit-keys.txt"
$bundledBinary = Join-Path $projectRoot "src\livekit\livekit-server.exe"

$livekitCommand = Get-Command "livekit-server" -ErrorAction SilentlyContinue

if ($livekitCommand) {
    $livekitExecutable = $livekitCommand.Source
} elseif (Test-Path $bundledBinary) {
    $livekitExecutable = $bundledBinary
} else {
    Write-Error "livekit-server не найден. Установите его в PATH или положите livekit-server.exe в src\livekit\."
}

if (-not (Test-Path $keysFile)) {
    Write-Error "Не найден файл с ключами: $keysFile"
}

$keyPair = (Get-Content $keysFile | Select-Object -First 1).Trim()
$env:LIVEKIT_KEYS = ($keyPair -replace ":\s+", ":")

Write-Host "Starting LiveKit without Docker on ws://127.0.0.1:7880"
& $livekitExecutable "--dev" "--bind" "0.0.0.0"
