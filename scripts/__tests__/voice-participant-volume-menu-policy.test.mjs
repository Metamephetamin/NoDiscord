import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

test("voice participants expose a right-click volume menu", () => {
  const source = readRepoFile("src/components/VoiceChannelList.jsx");
  const styles = readRepoFile("src/css/ListChannels.css");

  assert.match(source, /const openParticipantVolumeMenu = \(event, participant\) => \{/);
  assert.match(source, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(source, /onContextMenu=\{\(event\) => openParticipantVolumeMenu\(event, participant\)\}/);
  assert.match(source, /className="voice-participant-volume-menu"/);
  assert.match(source, /onParticipantVolumeChange\?\.\(activeParticipantVolumeMenu\.userId, Number\(event\.target\.value\)\)/);
  assert.match(source, /setActiveParticipantVolumeMenu\(null\)/);
  assert.match(styles, /\.voice-participant-volume-menu \{/);
  assert.match(styles, /\.voice-participant-volume-menu__slider \{/);
});
