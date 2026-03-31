const attachedScrollCleanups = new WeakMap();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function canAnimateElement(element) {
  if (!element || typeof window === "undefined") {
    return false;
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    return false;
  }

  return element.scrollHeight > element.clientHeight + 1;
}

function isPrecisionScroll(event) {
  if (event.deltaMode !== 0) {
    return false;
  }

  const delta = Math.abs(event.deltaY);
  return delta > 0 && delta < 24;
}

export function attachSoftScroll(element) {
  if (!element || attachedScrollCleanups.has(element)) {
    return attachedScrollCleanups.get(element) || (() => {});
  }

  let rafId = 0;
  let currentScrollTop = element.scrollTop;
  let targetScrollTop = element.scrollTop;
  let velocity = 0;
  let lastFrameTime = 0;
  let isProgrammaticScroll = false;

  const stopAnimation = () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    velocity = 0;
    lastFrameTime = 0;
  };

  const animate = (timestamp) => {
    rafId = 0;

    if (!element.isConnected) {
      stopAnimation();
      return;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    targetScrollTop = clamp(targetScrollTop, 0, maxScrollTop);
    currentScrollTop = clamp(currentScrollTop, 0, maxScrollTop);

    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }

    const deltaTime = Math.min(32, Math.max(8, timestamp - lastFrameTime));
    const frameFactor = deltaTime / 16.6667;
    lastFrameTime = timestamp;

    const delta = targetScrollTop - currentScrollTop;
    const attraction = 0.22 * frameFactor;
    velocity += delta * attraction;
    velocity *= Math.pow(0.74, frameFactor);

    if (Math.abs(delta) < 0.2 && Math.abs(velocity) < 0.12) {
      currentScrollTop = targetScrollTop;
      isProgrammaticScroll = true;
      element.scrollTop = targetScrollTop;
      isProgrammaticScroll = false;
      stopAnimation();
      return;
    }

    currentScrollTop = clamp(currentScrollTop + velocity, 0, maxScrollTop);
    isProgrammaticScroll = true;
    element.scrollTop = currentScrollTop;
    isProgrammaticScroll = false;
    rafId = window.requestAnimationFrame(animate);
  };

  const ensureAnimation = () => {
    if (!rafId) {
      currentScrollTop = element.scrollTop;
      lastFrameTime = 0;
      rafId = window.requestAnimationFrame(animate);
    }
  };

  const handleWheel = (event) => {
    if (!canAnimateElement(element) || event.defaultPrevented || event.ctrlKey) {
      return;
    }

    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || isPrecisionScroll(event)) {
      return;
    }

    const interactiveTarget = event.target instanceof Element
      ? event.target.closest("input, textarea, select, option, video, [contenteditable='true']")
      : null;

    if (interactiveTarget) {
      return;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (maxScrollTop <= 0) {
      return;
    }

    const scale =
      event.deltaMode === 1
        ? 42
        : event.deltaMode === 2
          ? element.clientHeight
          : 1;

    const normalizedDelta = event.deltaY * scale;
    const nextTarget = clamp(targetScrollTop + normalizedDelta * 1.08, 0, maxScrollTop);

    if (nextTarget === targetScrollTop && (nextTarget === 0 || nextTarget === maxScrollTop)) {
      return;
    }

    event.preventDefault();
    targetScrollTop = nextTarget;
    velocity += normalizedDelta * 0.08;
    ensureAnimation();
  };

  const handleScroll = () => {
    if (isProgrammaticScroll) {
      return;
    }

    currentScrollTop = element.scrollTop;
    targetScrollTop = element.scrollTop;
    velocity = 0;
  };

  element.addEventListener("wheel", handleWheel, { passive: false });
  element.addEventListener("scroll", handleScroll, { passive: true });

  const cleanup = () => {
    stopAnimation();
    element.removeEventListener("wheel", handleWheel);
    element.removeEventListener("scroll", handleScroll);
    attachedScrollCleanups.delete(element);
  };

  attachedScrollCleanups.set(element, cleanup);
  return cleanup;
}

export function observeSoftScrollContainers(selectors, root = document.body) {
  if (typeof document === "undefined" || !root) {
    return () => {};
  }

  const selectorText = Array.isArray(selectors) ? selectors.join(", ") : String(selectors || "");
  if (!selectorText.trim()) {
    return () => {};
  }

  const cleanups = new Map();

  const sync = () => {
    root.querySelectorAll(selectorText).forEach((element) => {
      if (!cleanups.has(element)) {
        cleanups.set(element, attachSoftScroll(element));
      }
    });

    Array.from(cleanups.keys()).forEach((element) => {
      if (!element.isConnected || !root.contains(element)) {
        cleanups.get(element)?.();
        cleanups.delete(element);
      }
    });
  };

  sync();

  const observer = new MutationObserver(() => {
    sync();
  });

  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    cleanups.forEach((cleanup) => cleanup?.());
    cleanups.clear();
  };
}
