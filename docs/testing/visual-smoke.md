# Visual Smoke Checks

These checks are lightweight static guards for critical UI surfaces that recently regressed under theme changes. They do not replace manual screenshots or browser-driven visual regression, but they are cheap enough to run before every release.

Run:

```powershell
npm run test:visual:auth
npm run test:visual:settings
npm run test:visual:modals
```

Coverage:
- auth login, registration, QR login, email verification, and the background video element;
- account, voice/video, profile, and appearance settings in light and purple themes;
- create server, stream settings, device popovers, attach menu, upload sheet, user context menu, profile modal, and invite modal theme coverage.

For final release QA, still open the app and visually check the same screens in `dark`, `light`, and `purple` themes.
