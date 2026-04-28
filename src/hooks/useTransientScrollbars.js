import { useEffect } from "react";

const ACTIVE_SCROLL_CLASS = "is-scroll-active";

function isScrollableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const canScrollY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
  const canScrollX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
  return canScrollY || canScrollX;
}

export default function useTransientScrollbars() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const timers = new Map();

    const clearActiveState = (element) => {
      window.clearTimeout(timers.get(element));
      timers.delete(element);
      element.classList.remove(ACTIVE_SCROLL_CLASS);
    };

    const handleScroll = (event) => {
      const target = event.target;
      if (!isScrollableElement(target)) {
        return;
      }

      target.classList.add(ACTIVE_SCROLL_CLASS);

      const previousTimer = timers.get(target);
      if (previousTimer) {
        window.clearTimeout(previousTimer);
      }

      timers.set(target, window.setTimeout(() => clearActiveState(target), 760));
    };

    document.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      timers.forEach((timer, element) => {
        window.clearTimeout(timer);
        element.classList.remove(ACTIVE_SCROLL_CLASS);
      });
      timers.clear();
    };
  }, []);
}
