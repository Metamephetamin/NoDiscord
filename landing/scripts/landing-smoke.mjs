import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "components/Navbar.tsx",
  "components/Hero.tsx",
  "components/CosmicScene.tsx",
  "components/FeatureCards.tsx",
  "components/VoiceSection.tsx",
  "components/AppMockup.tsx",
  "components/CTASection.tsx",
  "package.json",
  "README.md",
];

for (const file of requiredFiles) {
  const path = join(root, file);
  if (!existsSync(path)) {
    throw new Error(`Missing required landing file: ${file}`);
  }
}

const page = readFileSync(join(root, "app/page.tsx"), "utf8");
const hero = readFileSync(join(root, "components/Hero.tsx"), "utf8");
const cosmicScene = readFileSync(join(root, "components/CosmicScene.tsx"), "utf8");
const features = readFileSync(join(root, "components/FeatureCards.tsx"), "utf8");
const mockup = readFileSync(join(root, "components/AppMockup.tsx"), "utf8");
const cta = readFileSync(join(root, "components/CTASection.tsx"), "utf8");
const styles = readFileSync(join(root, "app/globals.css"), "utf8");

const requiredText = [
  "Lanaya — voice space for your people",
  "Создавай голосовые комнаты, общайся с друзьями и оставайся на связи без шума.",
  "Ready to enter Lanaya?",
  "Voice Rooms",
  "Crystal Clear Audio",
  "Private Spaces",
  "Low Latency",
];

for (const text of requiredText) {
  const haystack = `${page}\n${hero}\n${features}\n${cta}`;
  if (!haystack.includes(text)) {
    throw new Error(`Missing required landing copy: ${text}`);
  }
}

if (!cosmicScene.includes("@react-three/fiber") || !cosmicScene.includes("@react-three/drei")) {
  throw new Error("CosmicScene must use React Three Fiber and Drei.");
}

if (!cosmicScene.includes("Points") || !cosmicScene.includes("Torus") || !cosmicScene.includes("Sphere")) {
  throw new Error("CosmicScene must render particles, a ring, and a sphere.");
}

const premiumSceneTokens = [
  "premium-scene-shell",
  "orbital-dust",
  "neural-orbit",
  "cosmic-lens-flare",
  "MeshDistortMaterial",
  "ContactShadows",
];

for (const token of premiumSceneTokens) {
  if (!`${cosmicScene}\n${styles}`.includes(token)) {
    throw new Error(`Missing premium scene treatment: ${token}`);
  }
}

const premiumInteractionTokens = ["premium-card", "magnetic-action", "ambient-sheen", "depth-panel"];

for (const token of premiumInteractionTokens) {
  if (!`${hero}\n${features}\n${mockup}\n${cta}\n${styles}`.includes(token)) {
    throw new Error(`Missing premium interaction treatment: ${token}`);
  }
}

if (!mockup.includes("voice-room") || !mockup.includes("server-orbit")) {
  throw new Error("AppMockup must draw the interface in HTML/CSS.");
}

if (/(<img|\.png|\.jpg|\.jpeg|\.webp|\.gif|\.mp4)/i.test(`${page}\n${hero}\n${features}\n${mockup}\n${cta}\n${styles}`)) {
  throw new Error("Landing implementation must not use ready-made images or videos.");
}

console.log("Landing smoke checks passed.");
