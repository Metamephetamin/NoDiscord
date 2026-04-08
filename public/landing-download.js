(() => {
  const NOTE_CLASS = "landing-beta-note";
  const HERO_CLASS = "landing-hero-shell";
  const WINDOWS_DOWNLOAD_URL = "./Tend%20Setup.exe";
  const MACOS_DOWNLOAD_URL = "";

  const ensureHeroShellWidth = (actionContainer) => {
    const heroShell =
      actionContainer?.parentElement?.parentElement?.parentElement
      || actionContainer?.parentElement?.parentElement
      || actionContainer?.parentElement;

    if (!heroShell || heroShell.classList.contains(HERO_CLASS)) {
      return;
    }

    heroShell.classList.add(HERO_CLASS);
  };

  const startDownload = (url) => {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = normalizedUrl;
    link.download = "";
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  };

  const wireDownloadButtons = (actionButtons) => {
    actionButtons.forEach((button) => {
      const text = String(button.textContent || "").toLowerCase();
      const isWindowsButton = text.includes("windows");
      const isMacButton = text.includes("macos");
      if (!isWindowsButton && !isMacButton) {
        return;
      }

      const targetUrl = isWindowsButton ? WINDOWS_DOWNLOAD_URL : MACOS_DOWNLOAD_URL;

      if (button.tagName === "A") {
        if (targetUrl) {
          button.setAttribute("href", targetUrl);
          button.setAttribute("download", "");
        } else {
          button.setAttribute("href", "#");
        }
      }

      if (button.dataset.downloadWired === "true") {
        return;
      }

      button.dataset.downloadWired = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startDownload(targetUrl);
      });
    });
  };

  const installBetaNote = () => {
    const actionButtons = Array.from(document.querySelectorAll("a, button")).filter((element) => {
      const text = String(element.textContent || "").toLowerCase();
      return text.includes("windows") || text.includes("macos");
    });

    if (actionButtons.length < 2) {
      return false;
    }

    const actionContainer = actionButtons[0].parentElement;
    if (!actionContainer || actionButtons[1].parentElement !== actionContainer) {
      return false;
    }

    ensureHeroShellWidth(actionContainer);
    wireDownloadButtons(actionButtons);

    if (document.querySelector(`.${NOTE_CLASS}`)) {
      return true;
    }

    const note = document.createElement("div");
    note.className = NOTE_CLASS;
    note.textContent = "Beta 0.1";
    actionContainer.insertAdjacentElement("afterend", note);
    return true;
  };

  if (installBetaNote()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (installBetaNote()) {
      observer.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("beforeunload", () => observer.disconnect(), { once: true });
})();
