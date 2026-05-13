import assert from "node:assert/strict";
import test from "node:test";
import { USER_AGREEMENT_TEXT } from "../../legal/userAgreementText.js";

test("user agreement text covers required honest data policy topics", () => {
  const text = USER_AGREEMENT_TEXT.toLowerCase();

  [
    "регистрационные данные",
    "сообщения",
    "вложения",
    "метаданные звонков",
    "устройства",
    "диагностические",
    "данные используются",
    "не продаем",
    "не используем личные сообщения для личных целей",
    "пользователь отвечает",
    "данные хранятся",
    "хэширование паролей",
    "абсолютную безопасность",
    "ответственность оператора ограничивается",
    "не отвечает за утечки",
    "support@lanaya.space",
  ].forEach((requiredText) => {
    assert.ok(text.includes(requiredText), `Missing required agreement text: ${requiredText}`);
  });
});
