export function canLoadVideoPreviewUrl(value) {
  const url = String(value || "").trim();
  if (!url) {
    return false;
  }

  return /^(?:blob:|data:|file:|https?:\/\/|\/(?!\/))/i.test(url);
}
