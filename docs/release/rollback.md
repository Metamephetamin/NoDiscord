# Production Rollback

Use this when the `master` deploy is unhealthy after release smoke or manual checks.

## GitHub Actions Rollback

1. Open GitHub Actions for `Metamephetamin/NoDiscord`.
2. Open the latest successful `Deploy` workflow run before the bad deploy.
3. Copy the commit SHA from that run.
4. Locally create a rollback commit on `master`:

```powershell
git fetch origin
git switch master
git pull --ff-only origin master
git revert --no-edit <bad_commit_sha>
git push origin master
```

5. Wait for the `Deploy` workflow from `master` to finish.
6. Verify:

```powershell
Invoke-RestMethod https://lanaya.space/api/ping
node ./scripts/release-smoke.mjs
npm run smoke:release
```

## Manual Server Rollback

Use this only if GitHub Actions cannot deploy.

1. SSH to the production server.
2. Check the service and current files:

```bash
systemctl status nodiscord-backend.service --no-pager
ls -lah /opt/nodiscord/.deploy/backend
ls -lah /var/www/tend-app/current
```

3. Restore the previous backend/frontend snapshot from the server backup location or hosting provider snapshot.
4. Restart services:

```bash
systemctl restart nodiscord-backend.service
nginx -t
systemctl reload nginx
```

5. Verify production health:

```bash
curl --fail --silent --show-error https://lanaya.space/api/ping
curl --silent --show-error --request POST --output /dev/null --write-out '%{http_code}\n' 'https://lanaya.space/chatHub/negotiate?negotiateVersion=1'
curl --silent --show-error --request POST --output /dev/null --write-out '%{http_code}\n' 'https://lanaya.space/voiceHub/negotiate?negotiateVersion=1'
```

## Data Safety

- Do not run `git reset --hard` on the production server.
- Do not delete `/opt/nodiscord/.deploy/storage`.
- Do not overwrite `.env` unless the replacement is the current production secret file.
- If rollback involves database schema changes, restore from the latest verified PostgreSQL backup before restarting the backend.
