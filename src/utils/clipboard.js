export async function copyTextToClipboard(value) {
  const text = String(value ?? "");
  if (!text) {
    return false;
  }

  try {
    if (window?.electronClipboard?.writeText) {
      const copied = await window.electronClipboard.writeText(text);
      if (copied) {
        return true;
      }
    }
  } catch {
    // continue to browser fallbacks
  }

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // continue to DOM fallback
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    try {
      const copied = document.execCommand("copy");
      if (copied) {
        return true;
      }
    } finally {
      textarea.remove();
    }
  }

  throw new Error("Не удалось скопировать в буфер обмена.");
}
