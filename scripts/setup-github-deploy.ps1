param(
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Convert-RemoteToRepoSlug {
  param([string]$RemoteUrl)

  if ([string]::IsNullOrWhiteSpace($RemoteUrl)) {
    return ""
  }

  $trimmed = $RemoteUrl.Trim()
  if ($trimmed -match "^https://github\.com/([^/]+/[^/]+?)(\.git)?$") {
    return $Matches[1]
  }
  if ($trimmed -match "^git@github\.com:([^/]+/[^/]+?)(\.git)?$") {
    return $Matches[1]
  }

  return ""
}

function Ensure-GitHubCli {
  $ghCommand = Get-Command gh -ErrorAction SilentlyContinue
  if ($ghCommand) {
    return $ghCommand.Source
  }

  $repoRoot = Resolve-RepoRoot
  $portableExe = Join-Path $repoRoot ".tools\gh\bin\gh.exe"
  if (Test-Path $portableExe) {
    return $portableExe
  }

  Write-Host "GitHub CLI is not installed. Downloading portable gh..." -ForegroundColor Yellow

  $toolsDir = Join-Path $repoRoot ".tools"
  $zipPath = Join-Path $toolsDir "gh.zip"
  $extractPath = Join-Path $toolsDir "gh"

  New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/cli/cli/releases/latest"
  $asset = $release.assets | Where-Object { $_.name -like "*windows_amd64.zip" } | Select-Object -First 1
  if (-not $asset) {
    throw "Unable to find a portable GitHub CLI asset for Windows."
  }

  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
  if (Test-Path $extractPath) {
    Remove-Item -LiteralPath $extractPath -Recurse -Force
  }
  Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

  $downloadedExe = Get-ChildItem -Path $extractPath -Recurse -Filter gh.exe | Select-Object -First 1 -ExpandProperty FullName
  if (-not $downloadedExe) {
    throw "GitHub CLI downloaded, but gh.exe was not found."
  }

  Write-Host "Portable gh installed: $downloadedExe" -ForegroundColor Green
  return $downloadedExe
}

function Ensure-GhAuth {
  param([string]$GhExe)

  try {
    & $GhExe auth status | Out-Null
    return
  } catch {
    Write-Host "GitHub authorization required. Opening login flow..." -ForegroundColor Yellow
    & $GhExe auth login --hostname github.com --git-protocol https --web
  }
}

function Ask-Required {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )

  while ($true) {
    if ([string]::IsNullOrWhiteSpace($Default)) {
      $value = Read-Host $Prompt
    } else {
      $value = Read-Host "$Prompt [$Default]"
      if ([string]::IsNullOrWhiteSpace($value)) {
        $value = $Default
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($Repo)) {
  $originUrl = (git remote get-url origin 2>$null)
  $Repo = Convert-RemoteToRepoSlug -RemoteUrl $originUrl
}

if ([string]::IsNullOrWhiteSpace($Repo)) {
  $Repo = Ask-Required -Prompt "Enter GitHub repo (owner/repo)"
}

$gh = Ensure-GitHubCli
Ensure-GhAuth -GhExe $gh

Write-Host ""
Write-Host "Configuring deploy secrets for $Repo" -ForegroundColor Cyan
Write-Host ""

$hostValue = Ask-Required -Prompt "DEPLOY_HOST (server host/ip)"
$userValue = Ask-Required -Prompt "DEPLOY_USER (ssh user)"
$portValue = Read-Host "DEPLOY_PORT (optional, default 22)"
$backendEnvPath = Read-Host "Path to backend .env file (optional, recommended)"

$defaultKeyPath = "$HOME\.ssh\github_actions_tendsec_deploy"
$keyPath = Ask-Required -Prompt "Path to private SSH key" -Default $defaultKeyPath
if (-not (Test-Path $keyPath)) {
  throw "SSH key file not found: $keyPath"
}
$sshKeyValue = Get-Content -Path $keyPath -Raw

& $gh secret set DEPLOY_HOST --repo $Repo --body $hostValue
& $gh secret set DEPLOY_USER --repo $Repo --body $userValue
& $gh secret set DEPLOY_SSH_KEY --repo $Repo --body $sshKeyValue

if (-not [string]::IsNullOrWhiteSpace($backendEnvPath)) {
  if (-not (Test-Path $backendEnvPath)) {
    throw "Backend .env file not found: $backendEnvPath"
  }

  $backendEnvValue = Get-Content -Path $backendEnvPath -Raw
  & $gh secret set BACKEND_ENV_FILE --repo $Repo --body $backendEnvValue
}

if (-not [string]::IsNullOrWhiteSpace($portValue)) {
  & $gh secret set DEPLOY_PORT --repo $Repo --body $portValue
}

Write-Host ""
Write-Host "Secrets configured successfully for $Repo" -ForegroundColor Green
Write-Host ""
Write-Host "The deploy workflow uses these default server paths:" -ForegroundColor Cyan
Write-Host "  frontend: /var/www/tend-app/current"
Write-Host "  backend:  /opt/nodiscord/.deploy/backend"
Write-Host "  service:  nodiscord-backend.service"
Write-Host ""
Write-Host "You can override them in GitHub Repository Variables if needed:" -ForegroundColor Cyan
Write-Host "  FRONTEND_DEPLOY_PATH"
Write-Host "  BACKEND_DEPLOY_PATH"
Write-Host "  BACKEND_SERVICE_NAME"
Write-Host "  FRONTEND_DEPLOY_OWNER"
Write-Host "  BACKEND_DEPLOY_OWNER"
Write-Host "  HEALTHCHECK_URL"
Write-Host "  LANDING_DEPLOY_PATH"
Write-Host "  LANDING_DEPLOY_OWNER"
Write-Host "  LANDING_HEALTHCHECK_URL"
Write-Host "You can now run the Deploy workflow in GitHub Actions." -ForegroundColor Green
