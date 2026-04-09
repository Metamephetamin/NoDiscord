# Production Infrastructure Templates

This directory contains the production deployment templates that are not applied by GitHub Actions automatically, but are part of the real server setup for `tendsec.ru`.

Included templates:

- `nginx/tendsec.ru.conf`
  - main web app host
  - serves frontend from `/var/www/tend-app/current`
  - proxies backend routes to `127.0.0.1:7031`
- `nginx/land.tendsec.ru.conf`
  - landing host
  - serves static landing from `/var/www/tend-land/current`
- `systemd/nodiscord-backend.service`
  - backend service template
  - runs published ASP.NET backend from `/opt/nodiscord/.deploy/backend`

Notes:

- These files are templates for the current production topology.
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
