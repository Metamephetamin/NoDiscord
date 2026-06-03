# Lanaya Landing

Premium WebGL landing page for Lanaya, built with Next.js, TypeScript, Tailwind CSS, Framer Motion, Three.js, React Three Fiber, and Drei.

## Commands

```bash
npm install
npm run dev
npm run build
npm run start
npm run test:smoke
```

## Structure

- `app/page.tsx` composes the landing sections.
- `components/Navbar.tsx` contains the sticky glass navigation.
- `components/Hero.tsx` renders the hero copy and mounts the 3D scene.
- `components/CosmicScene.tsx` contains the Three.js / React Three Fiber cosmic visual.
- `components/FeatureCards.tsx` renders the glass feature cards.
- `components/VoiceSection.tsx` contains the animated voice wave section.
- `components/AppMockup.tsx` draws the app interface mockup with HTML and CSS.
- `components/CTASection.tsx` renders the final call to action.
- `scripts/landing-smoke.mjs` checks the required page structure and copy.
