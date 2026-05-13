import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PRIVACY_VERSION,
  USER_AGREEMENT_TEXT,
  USER_AGREEMENT_VERSION,
} from "../src/legal/userAgreementText.js";

const projectRoot = resolve(import.meta.dirname, "..");
const authControllerSource = readFileSync(resolve(projectRoot, "BackNoDiscord/BackNoDiscord/AuthController.cs"), "utf8");

assert.equal(USER_AGREEMENT_VERSION, PRIVACY_VERSION, "Terms and privacy versions must match.");
assert.ok(
  authControllerSource.includes(`CurrentTermsVersion = "${USER_AGREEMENT_VERSION}"`),
  "Backend terms version must match frontend agreement version."
);
assert.ok(
  authControllerSource.includes(`CurrentPrivacyVersion = "${PRIVACY_VERSION}"`),
  "Backend privacy version must match frontend privacy version."
);

[
  "физическое лицо",
  "согласие на обработку персональных данных",
  "не продает персональные данные",
  "резервных копий",
  "ограничение ответственности",
  "контакт владельца сервиса",
].forEach((requiredText) => {
  assert.ok(
    USER_AGREEMENT_TEXT.toLowerCase().includes(requiredText),
    `Agreement text must include: ${requiredText}`
  );
});

console.log(`Legal consent smoke passed for version ${USER_AGREEMENT_VERSION}.`);
