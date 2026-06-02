import assert from "node:assert/strict";
import test from "node:test";
import { readRepoFile } from "./readRepoFile.mjs";

test("avatar editor exposes horizontal movement and keeps actions visible", () => {
  const editorSource = readRepoFile("src/components/MediaFrameEditorModal.jsx");
  const editorCss = readRepoFile("src/css/MediaFrameEditorModal.css");

  assert.match(editorSource, /const handleHorizontalPositionChange = \(event\) => \{/);
  assert.match(editorSource, /ariaLabel="Положение аватара влево и вправо"/);
  assert.match(editorSource, /value=\{normalizedDraftFrame\.x\}/);
  assert.match(editorSource, /getMediaFramePositionBounds\(normalizedDraftFrame\.zoom, \{ axis: "x"/);
  assert.match(editorCss, /\.media-frame-editor__avatar-actions \{[\s\S]*?position: sticky;/);
  assert.match(editorCss, /\.media-frame-editor__dialog--avatar \{[\s\S]*?max-height: calc\(100dvh - 48px\);/);
});

test("avatar crop stage does not render a second background panel", () => {
  const editorCss = readRepoFile("src/css/MediaFrameEditorModal.css");
  const stageBlock = editorCss.match(/\.media-frame-editor__avatar-stage \{(?<body>[\s\S]*?)\n\}/)?.groups?.body || "";

  assert.match(stageBlock, /background: transparent;/);
});
