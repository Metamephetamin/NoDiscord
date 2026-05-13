import assert from "node:assert/strict";
import test from "node:test";
import { USER_AGREEMENT_TEXT } from "../../legal/userAgreementText.js";

test("user agreement text covers required honest data policy topics", () => {
  const text = USER_AGREEMENT_TEXT.toLowerCase();

  [
    "физическое лицо",
    "оператор",
    "регистрационные данные",
    "сообщения",
    "вложения",
    "метаданные звонков",
    "ip-адресе",
    "диагностических событиях",
    "данные используются",
    "согласие на обработку персональных данных",
    "не продает персональные данные",
    "не использует личные сообщения для личных целей",
    "пользователь самостоятельно отвечает",
    "резервных копий",
    "хэш пароля",
    "не может гарантировать абсолютную безопасность",
    "ограничение ответственности",
    "не отвечает за косвенные убытки",
    "контакт владельца сервиса",
  ].forEach((requiredText) => {
    assert.ok(text.includes(requiredText), `Missing required agreement text: ${requiredText}`);
  });
});
