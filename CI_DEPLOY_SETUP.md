# CI and Deploy Quick Setup

## What is already configured

- CI workflow: `.github/workflows/ci.yml`
  - frontend build
  - backend build
  - backend tests (auto-skip if no `*Tests*.csproj`)
- Deploy workflow: `.github/workflows/deploy.yml`

## One-command deploy secrets setup

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-github-deploy.ps1
```

The script will:

1. Detect the GitHub repo automatically.
2. Download portable `gh` CLI if not installed.
3. Ask you to login to GitHub.
4. Set required secrets:
   - `DEPLOY_HOST`
   - `DEPLOY_USER`
   - `DEPLOY_PATH`
   - `DEPLOY_SSH_KEY`
   - optional `DEPLOY_PORT`

After that, run Deploy workflow from GitHub Actions.
