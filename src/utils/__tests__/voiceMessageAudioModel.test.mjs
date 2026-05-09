import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const textChatModelSource = readFileSync(resolve(__dirname, "../textChatModel.js"), "utf8");

function readExportedNumber(name) {
  const match = textChatModelSource.match(new RegExp(`export const ${name} = (-?[0-9.]+);`));
  assert.ok(match, `${name} export should exist`);
  return Number(match[1]);
}

test("voice message audio defaults favor clean mono speech without extra gain after limiting", () => {
  assert.equal(readExportedNumber("VOICE_RECORDING_SAMPLE_RATE"), 48000);
  assert.equal(readExportedNumber("VOICE_RECORDING_AUDIO_BITS_PER_SECOND"), 128000);
  assert.equal(readExportedNumber("VOICE_HIGH_PASS_FREQUENCY_HZ"), 85);
  assert.equal(readExportedNumber("VOICE_LOW_SHELF_GAIN_DB"), -2.2);
  assert.equal(readExportedNumber("VOICE_LOW_PASS_FREQUENCY_HZ"), 13000);
  assert.equal(readExportedNumber("VOICE_PRESENCE_GAIN_DB"), 1.6);
  assert.equal(readExportedNumber("VOICE_HIGH_SHELF_GAIN_DB"), 0.8);
  assert.equal(readExportedNumber("VOICE_OUTPUT_GAIN"), 1.12);
});
