# Deploy Layout

Target state:

- Frontend releases live under `/var/www/tend-app/releases/<run-id>`.
- Backend releases live under `/opt/nodiscord/.deploy/releases/<run-id>`.
- `current` is a symlink to the active release.
- Shared storage remains under `/opt/nodiscord/.deploy/storage`.
- `.env` remains outside release directories or is copied with `0600` permissions.

Rollback means repointing `current` to the previous release and restarting the backend.

## Required Workflow Work

- Upload frontend/backend into release directories.
- Validate release contents before switching symlink.
- Switch symlink only after validation succeeds.
- Keep the last 5 releases.
- On failed health check, switch back to previous release and restart backend.
