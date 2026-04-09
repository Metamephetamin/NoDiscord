const root = document.documentElement;
const backgroundVideo = document.querySelector(".background-video");
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const slowConnectionTypes = new Set(["slow-2g", "2g", "3g"]);
let prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let isLiteMode = false;

const particleField = document.getElementById("particleField");
const cursorGlow = document.getElementById("cursorGlow");
const scrollBar = document.getElementById("scrollBar");
const brainLogo = document.getElementById("brainLogo");
const siteHeader = document.querySelector(".site-header");
const recolorTargets = Array.from(document.querySelectorAll(".logo-recolor-target"));
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const revealItems = Array.from(document.querySelectorAll(".reveal"));
const counters = Array.from(document.querySelectorAll(".counter"));
const parallaxNodes = Array.from(document.querySelectorAll("[data-parallax]"));
let lastScrollY = window.scrollY;

function detectLiteMode() {
  const usesCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const compactViewport = window.matchMedia("(max-width: 900px)").matches;
  const saveData = Boolean(connection?.saveData);
  const slowConnection = slowConnectionTypes.has(connection?.effectiveType || "");
  const lowCpu = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
  const lowMemory = Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4;

  return prefersReducedMotion || usesCoarsePointer || compactViewport || saveData || slowConnection || lowCpu || lowMemory;
}

function syncPerformanceMode() {
  prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  isLiteMode = detectLiteMode();
  root.classList.toggle("lite-motion", isLiteMode);
}

function createParticles() {
  if (!particleField) return;

  particleField.replaceChildren();
  if (prefersReducedMotion || isLiteMode) return;

  const total = window.innerWidth < 768 ? 18 : 32;

  for (let index = 0; index < total; index += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.bottom = `${-10 - Math.random() * 20}%`;
    particle.style.setProperty("--size", `${2 + Math.random() * 5}px`);
    particle.style.setProperty("--duration", `${16 + Math.random() * 18}s`);
    particle.style.setProperty("--delay", `${Math.random() * -20}s`);
    particle.style.setProperty("--x-shift", `${-80 + Math.random() * 160}px`);
    particleField.appendChild(particle);
  }
}

function updateScrollProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable <= 0 ? 0 : (window.scrollY / scrollable) * 100;
  scrollBar.style.width = `${progress}%`;
}

function updateHeaderVisibility() {
  if (!siteHeader) return;

  const currentScrollY = window.scrollY;
  const delta = currentScrollY - lastScrollY;

  if (currentScrollY <= 32) {
    siteHeader.classList.remove("is-hidden");
    lastScrollY = currentScrollY;
    return;
  }

  if (Math.abs(delta) < 6) {
    return;
  }

  siteHeader.classList.toggle("is-hidden", delta > 0);
  lastScrollY = currentScrollY;
}

function revealOnScroll() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function animateCounters() {
  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const node = entry.target;
        const targetValue = Number(node.dataset.target);
        const duration = 1600;
        const start = performance.now();
        const hasDecimal = String(node.dataset.target).includes(".");
        function tick(timestamp) {
          const elapsed = Math.min((timestamp - start) / duration, 1);
          const eased = 1 - Math.pow(1 - elapsed, 3);
          const current = targetValue * eased;
          const value = hasDecimal ? current.toFixed(2) : Math.round(current);

          node.textContent = `${value}`;

          if (elapsed < 1) {
            requestAnimationFrame(tick);
            return;
          }

          node.textContent = `${hasDecimal ? targetValue.toFixed(2) : targetValue}`;
        }

        requestAnimationFrame(tick);
        counterObserver.unobserve(node);
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((counter) => counterObserver.observe(counter));
}

function updateActiveSection() {
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.getAttribute("href") === id);
        });
      });
    },
    {
      threshold: 0.45,
      rootMargin: "-10% 0px -40% 0px",
    }
  );

  sections.forEach((section) => sectionObserver.observe(section));
}

function applyParallax() {
  if (prefersReducedMotion || isLiteMode) return;

  let latestScroll = 0;
  let ticking = false;

  const render = () => {
    parallaxNodes.forEach((node) => {
      const depth = Number(node.dataset.parallax || 0.1);
      const offset = latestScroll * depth;
      node.style.transform = `translate3d(0, ${offset * -0.16}px, 0)`;
    });
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      latestScroll = window.scrollY;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(render);
    },
    { passive: true }
  );
}

function trackPointer() {
  if (!cursorGlow || prefersReducedMotion || isLiteMode) return;

  window.addEventListener(
    "pointermove",
    (event) => {
      cursorGlow.style.left = `${event.clientX}px`;
      cursorGlow.style.top = `${event.clientY}px`;
    },
    { passive: true }
  );
}

function recolorLogoImage(imageNode) {
  if (!imageNode || imageNode.dataset.recolorReady === "true") return;
  if (isLiteMode) {
    imageNode.dataset.recolorReady = "true";
    if (imageNode === brainLogo) {
      brainLogo.classList.add("is-visible");
    }
    return;
  }

  const source = new Image();
  source.src = imageNode.src;

  source.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        if (alpha < 12) continue;

        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const brightness = red + green + blue;

        if (brightness < 90) continue;

        const px = ((index / 4) % canvas.width) / canvas.width;
        const violet = {
          r: 131 + Math.round(px * 42),
          g: 77 + Math.round(px * 22),
          b: 255,
        };
        const luminance = Math.max(0.72, Math.min(1.08, brightness / 590));

        pixels[index] = Math.min(255, violet.r * luminance);
        pixels[index + 1] = Math.min(255, violet.g * luminance);
        pixels[index + 2] = Math.min(255, violet.b * luminance);
      }

      context.putImageData(imageData, 0, 0);
      imageNode.src = canvas.toDataURL("image/png");
      imageNode.dataset.recolorReady = "true";
    } catch (error) {
      console.warn("Logo recolor skipped:", error);
    } finally {
      if (imageNode === brainLogo) {
        window.setTimeout(() => brainLogo.classList.add("is-visible"), 220);
      }
    }
  };

  source.onerror = () => {
    if (imageNode === brainLogo) {
      brainLogo.classList.add("is-visible");
    }
  };
}

function syncBackgroundVideoPlayback() {
  if (!backgroundVideo) return;

  if (document.hidden) {
    backgroundVideo.pause();
    return;
  }

  const playPromise = backgroundVideo.play();
  if (typeof playPromise?.catch === "function") {
    playPromise.catch(() => {});
  }
}

syncPerformanceMode();
createParticles();
revealOnScroll();
animateCounters();
updateActiveSection();
applyParallax();
trackPointer();
recolorTargets.forEach(recolorLogoImage);
updateScrollProgress();
updateHeaderVisibility();
syncBackgroundVideoPlayback();

window.addEventListener(
  "scroll",
  () => {
    updateScrollProgress();
    updateHeaderVisibility();
  },
  { passive: true }
);
window.addEventListener("resize", () => {
  syncPerformanceMode();
  updateScrollProgress();
  createParticles();
});
connection?.addEventListener?.("change", () => {
  syncPerformanceMode();
  createParticles();
});
document.addEventListener("visibilitychange", syncBackgroundVideoPlayback);
