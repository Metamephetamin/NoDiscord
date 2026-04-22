import test from "node:test";
import assert from "node:assert/strict";

import { findEncodingIssuesInText, fixEncodingInText } from "../lib/encoding-tools.mjs";

test("fixEncodingInText repairs classic CP1251/UTF-8 mojibake", () => {
  const broken = 'const label = "РџСЂРёРІРµС‚, РјРёСЂ";';
  const repaired = fixEncodingInText(broken);

  assert.equal(repaired.changed, true);
  assert.equal(repaired.text, 'const label = "Привет, мир";');
  assert.deepEqual(findEncodingIssuesInText(repaired.text), []);
});

test("fixEncodingInText repairs mojibake symbols and emoji", () => {
  const broken = 'const glyphs = ["вњ“", "рџ“ћ", "вЂє"];';
  const repaired = fixEncodingInText(broken);

  assert.equal(repaired.changed, true);
  assert.equal(repaired.text, 'const glyphs = ["✓", "📞", "›"];');
  assert.deepEqual(findEncodingIssuesInText(repaired.text), []);
});

test("fixEncodingInText repairs mojibake fragments inside mixed tokens", () => {
  const broken = 'const label = "Рщем и Рзменить";';
  const repaired = fixEncodingInText(broken);

  assert.equal(repaired.changed, true);
  assert.equal(repaired.text, 'const label = "Ищем и Изменить";');
  assert.deepEqual(findEncodingIssuesInText(repaired.text), []);
});

test("fixEncodingInText leaves valid UTF-8 Russian text unchanged", () => {
  const valid = 'const title = "Настройки беседы";';
  const repaired = fixEncodingInText(valid);

  assert.equal(repaired.changed, false);
  assert.equal(repaired.text, valid);
  assert.deepEqual(findEncodingIssuesInText(valid), []);
});
