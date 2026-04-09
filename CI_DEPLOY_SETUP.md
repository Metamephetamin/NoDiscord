# CI and Deploy Quick Setup

## What is already configured

- CI workflow: `.github/workflows/ci.yml`
  - frontend build
  - backend build
  - backend tests (auto-skip if no `*Tests*.csproj`)
- Deploy workflow: `.github/workflows/deploy.yml`
- Landing deploy workflow: `.github/workflows/deploy-landing.yml`
- Production infra templates:
  - `infra/nginx/tendsec.ru.conf`
  - `infra/nginx/land.tendsec.ru.conf`
  - `infra/systemd/nodiscord-backend.service`

## How deploy works now

On every push to `master` or `main`, GitHub Actions will:

1. install frontend dependencies
2. lint frontend and check encoding
3. build the frontend
4. restore, build, test, and publish the backend
5. upload artifacts to the production server
6. sync frontend to `/var/www/tend-app/current`
7. sync backend to `/opt/nodiscord/.deploy/backend`
8. restart `nodiscord-backend.service`
9. reload `nginx`
10. run a healthcheck against `https://tendsec.ru`

Important:

- This workflow deploys the main app and backend.
- The landing is deployed separately by `.github/workflows/deploy-landing.yml`.

## How landing deploy works now

The landing source now lives in:

- `landing/index.html`
- `landing/styles.css`
- `landing/script.js`
- `landing/assets/*`

On every push that changes `landing/**`, GitHub Actions will:

1. sync `landing/` to `/var/www/tend-land/current`
2. keep the existing `Tend Setup.exe` file on the server
3. reload `nginx`
4. run a healthcheck against `https://land.tendsec.ru`

## GitHub Secrets required

Set these repository secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- optional `DEPLOY_PORT`

Recommended values for the current production server:

- `DEPLOY_HOST=85.198.68.187`
- `DEPLOY_USER=root`
- `DEPLOY_PORT=22`

`DEPLOY_SSH_KEY` must be the private key content for a key that is already allowed on the server in `~/.ssh/authorized_keys`.

## Optional GitHub Variables

Only needed if you want to override the defaults:

- `FRONTEND_DEPLOY_PATH` default `/var/www/tend-app/current`
- `BACKEND_DEPLOY_PATH` default `/opt/nodiscord/.deploy/backend`
- `BACKEND_SERVICE_NAME` default `nodiscord-backend.service`
- `FRONTEND_DEPLOY_OWNER` default `www-data:www-data`
- `BACKEND_DEPLOY_OWNER` default `nodiscord:nodiscord`
- `HEALTHCHECK_URL` default `https://tendsec.ru`
- `LANDING_DEPLOY_PATH` default `/var/www/tend-land/current`
- `LANDING_DEPLOY_OWNER` default `www-data:www-data`
- `LANDING_HEALTHCHECK_URL` default `https://land.tendsec.ru`

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
   - `DEPLOY_SSH_KEY`
   - optional `DEPLOY_PORT`

After that, push to `master` and the deploy workflow will run automatically.

## Server-side SSH setup

If GitHub Actions still cannot connect, create a dedicated deploy key locally:

```powershell
ssh-keygen -t ed25519 -C "github-actions-deploy" -f $HOME\.ssh\github_actions_deploy
```

Then append the public key to the server:

```powershell
type $HOME\.ssh\github_actions_deploy.pub
```

Copy that public key into:

```text
/root/.ssh/authorized_keys
```

And use the matching private key content as `DEPLOY_SSH_KEY`.
