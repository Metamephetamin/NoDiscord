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
