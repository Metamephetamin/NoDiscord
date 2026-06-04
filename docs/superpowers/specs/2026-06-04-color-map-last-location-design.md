# Color Map Last Location Design

## Goal

Make the people map look like a normal colorful map and keep user markers at their last shared location when users go offline.

## Scope

- Replace the dark Lanaya world map base tiles with a colorful street-map tile source.
- Keep map markers visible for users who have location sharing enabled and a saved last location.
- Mark users as `online`, `offline`, or `self` from existing presence data.
- Do not attempt to bypass VPNs or discover a hidden real IP. Location should come from explicit client geolocation sharing and the server's last saved location only.

## Data Flow

The frontend polls `/api/user/locations`. The backend returns users with `location_sharing_enabled = true` and a non-null last location. The frontend already merges this list with live SignalR location updates and derives marker style from `kind`.

## Privacy

Turning location sharing off or clearing location still removes the saved location. Offline display only uses a last location the user already shared through the app.

## Validation

- Backend test for offline users with saved locations.
- Frontend source-policy test for colorful tiles and no dark tile filtering.
- Existing frontend lint, encoding check, frontend build, and targeted backend tests.
