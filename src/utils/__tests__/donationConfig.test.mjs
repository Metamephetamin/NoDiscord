import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDonationUrlForAmount,
  buildDonationConfig,
  getDonationAmountOptions,
  normalizeDonationUrl,
} from "../donationConfig.mjs";

test("normalizeDonationUrl accepts trusted yookassa payment links", () => {
  assert.equal(
    normalizeDonationUrl(" https://yookassa.ru/my/i/example-invoice "),
    "https://yookassa.ru/my/i/example-invoice"
  );
});

test("normalizeDonationUrl rejects unsupported protocols and hosts", () => {
  assert.equal(normalizeDonationUrl("javascript:alert(1)"), "");
  assert.equal(normalizeDonationUrl("https://example.com/pay"), "");
});

test("buildDonationConfig marks donations unavailable without a link", () => {
  assert.deepEqual(buildDonationConfig(""), {
    available: false,
    url: "",
  });
});

test("buildDonationConfig exposes normalized donation url", () => {
  assert.deepEqual(buildDonationConfig("https://yoomoney.ru/quickpay/fundraise/button?billNumber=abc"), {
    available: true,
    url: "https://yoomoney.ru/quickpay/fundraise/button?billNumber=abc",
  });
});

test("getDonationAmountOptions keeps compact ruble presets", () => {
  assert.deepEqual(getDonationAmountOptions().map((option) => option.label), ["100 ₽", "300 ₽", "500 ₽", "1000 ₽"]);
});

test("buildDonationUrlForAmount appends trusted ruble preset as YooKassa sum", () => {
  assert.equal(
    buildDonationUrlForAmount("https://yookassa.ru/my/i/example-invoice?source=app", 300),
    "https://yookassa.ru/my/i/example-invoice?source=app&sum=300.00"
  );
});

test("buildDonationUrlForAmount rejects unsupported amount values", () => {
  assert.equal(buildDonationUrlForAmount("https://yookassa.ru/my/i/example-invoice", 250), "");
});
