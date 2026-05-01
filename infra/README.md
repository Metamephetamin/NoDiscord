# Production Infrastructure Templates

This directory contains the production deployment templates for `lanaya.space`.

Included templates:

- `nginx/lanaya.space.conf`
  - main web app host
  - serves frontend from `/var/www/tend-app/current`
  - proxies backend routes to `127.0.0.1:7031`
- `nginx/land.lanaya.space.conf`
  - landing host
  - serves static landing from `/var/www/tend-land/current`
- `systemd/nodiscord-backend.service`
  - backend service template
  - runs published ASP.NET backend from `/opt/nodiscord/.deploy/backend`

Notes:

- The main app Nginx host is installed by the production deploy workflow if it is missing on the server.
- Landing Nginx is still a server-side template unless the landing deploy workflow is extended to manage it.
- Real TLS certificates are still issued on the server via `certbot`.
- Secrets must stay out of git and continue living in:
  - GitHub Actions Secrets
  - server environment files
  - systemd environment overrides

Current production paths used by CI/CD:

- frontend app: `/var/www/tend-app/current`
- landing: `/var/www/tend-land/current`
- backend publish: `/opt/nodiscord/.deploy/backend`
- backend service: `nodiscord-backend.service`

## Fast diagnostics for 502 errors

If the frontend opens but `/api/*`, `/chatHub`, or `/voiceHub` return `502 Bad Gateway`, run:

```bash
sudo systemctl status nodiscord-backend.service --no-pager -l
sudo journalctl -u nodiscord-backend.service -n 200 --no-pager
curl -i http://127.0.0.1:7031/api/ping
curl -i -X POST "http://127.0.0.1:7031/chatHub/negotiate?negotiateVersion=1"
curl -i -X POST "http://127.0.0.1:7031/voiceHub/negotiate?negotiateVersion=1"
sudo nginx -t
sudo systemctl reload nginx
```

Expected behavior:

- `/api/ping` should return `200`.
- SignalR negotiate endpoints should return a non-5xx status (`200`/`401`/`405` are acceptable depending on auth setup).
- `nginx -t` must report valid configuration.
