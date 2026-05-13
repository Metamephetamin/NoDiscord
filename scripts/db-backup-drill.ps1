param(
  [switch]$Execute,
  [switch]$RequireConfigured
)

$required = @(
  "DB_BACKUP_CONNECTION_STRING",
  "DB_RESTORE_CONNECTION_STRING",
  "DB_BACKUP_PATH"
)

$missing = @()
foreach ($name in $required) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    $missing += $name
  }
}

$backupPath = [Environment]::GetEnvironmentVariable("DB_BACKUP_PATH")
if ([string]::IsNullOrWhiteSpace($backupPath)) {
  $backupPath = ".\tmp\production-backup.dump"
}

Write-Host "PostgreSQL backup/restore drill"
Write-Host "Mode: $(if ($Execute) { 'execute' } elseif ($RequireConfigured) { 'configuration-check' } else { 'dry-run' })"
Write-Host ""
Write-Host "Required environment variables:"
foreach ($name in $required) {
  $state = if ($missing -contains $name) { "missing" } else { "set" }
  Write-Host "- ${name}: ${state}"
}

Write-Host ""
Write-Host "Commands:"
Write-Host 'pg_dump --format=custom --no-owner --no-acl --file "$env:DB_BACKUP_PATH" "$env:DB_BACKUP_CONNECTION_STRING"'
Write-Host 'pg_restore --clean --if-exists --no-owner --no-acl --dbname "$env:DB_RESTORE_CONNECTION_STRING" "$env:DB_BACKUP_PATH"'

if ($RequireConfigured -and $missing.Count -gt 0) {
  Write-Error "Missing required environment variables: $($missing -join ', ')"
  exit 1
}

if (-not $Execute) {
  Write-Host ""
  Write-Host "Dry-run only. Add -Execute to run pg_dump and pg_restore against the configured non-production restore database."
  exit 0
}

if ($missing.Count -gt 0) {
  Write-Error "Missing required environment variables: $($missing -join ', ')"
  exit 1
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump was not found in PATH."
  exit 1
}

if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
  Write-Error "pg_restore was not found in PATH."
  exit 1
}

pg_dump --format=custom --no-owner --no-acl --file "$backupPath" "$env:DB_BACKUP_CONNECTION_STRING"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

pg_restore --clean --if-exists --no-owner --no-acl --dbname "$env:DB_RESTORE_CONNECTION_STRING" "$backupPath"
exit $LASTEXITCODE
