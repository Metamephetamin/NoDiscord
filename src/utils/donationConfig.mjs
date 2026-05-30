const TRUSTED_DONATION_HOSTS = new Set([
  "yookassa.ru",
  "yoomoney.ru",
]);

const DONATION_AMOUNT_OPTIONS = Object.freeze([
  Object.freeze({ value: 100, label: "100 ₽" }),
  Object.freeze({ value: 300, label: "300 ₽" }),
  Object.freeze({ value: 500, label: "500 ₽" }),
  Object.freeze({ value: 1000, label: "1000 ₽" }),
]);

const DONATION_AMOUNT_VALUES = new Set(DONATION_AMOUNT_OPTIONS.map((option) => option.value));

function isTrustedDonationHost(hostname) {
  const normalizedHostname = String(hostname || "").trim().toLowerCase();
  return Array.from(TRUSTED_DONATION_HOSTS).some((host) =>
    normalizedHostname === host || normalizedHostname.endsWith(`.${host}`)
  );
}

function normalizeDonationAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || !DONATION_AMOUNT_VALUES.has(amount)) {
    return 0;
  }

  return amount;
}

export function normalizeDonationUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const parsedUrl = new globalThis.URL(rawValue);
    if (parsedUrl.protocol !== "https:" || !isTrustedDonationHost(parsedUrl.hostname)) {
      return "";
    }

    return parsedUrl.toString();
  } catch {
    return "";
  }
}

export function buildDonationConfig(url) {
  const normalizedUrl = normalizeDonationUrl(url);
  return {
    available: Boolean(normalizedUrl),
    url: normalizedUrl,
  };
}

export function buildDonationUrlForAmount(url, amount) {
  const normalizedUrl = normalizeDonationUrl(url);
  const normalizedAmount = normalizeDonationAmount(amount);
  if (!normalizedUrl || !normalizedAmount) {
    return "";
  }

  const parsedUrl = new globalThis.URL(normalizedUrl);
  parsedUrl.searchParams.set("sum", normalizedAmount.toFixed(2));
  return parsedUrl.toString();
}

export function getDonationAmountOptions() {
  return DONATION_AMOUNT_OPTIONS.map((option) => ({ ...option }));
}
