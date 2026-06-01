import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const animatedMediaSource = readFileSync("src/components/AnimatedMedia.jsx", "utf8");

test("animated media ref callback avoids duplicate state updates during commit", () => {
  assert.match(
    animatedMediaSource,
    /const nodeRef = useRef\(null\);/,
    "AnimatedMedia should keep the current DOM node in a ref",
  );
  assert.match(
    animatedMediaSource,
    /if \(nodeRef\.current === nextNode\) \{\s*return;\s*\}/s,
    "AnimatedMedia should not call setNode when React reports the same DOM node again",
  );
  assert.doesNotMatch(
    animatedMediaSource,
    /const attachNodeRef = useCallback\(\(nextNode\) => \{\s*setNode\(nextNode\);/s,
    "direct setState from the ref callback can trigger React maximum update depth errors",
  );
});

test("animated media element key does not depend on optimized URLs derived from measured bounds", () => {
  assert.doesNotMatch(
    animatedMediaSource,
    /key=\{optimizedImageSrc \|\| resolvedFallback\}/,
    "image keys must not change when ResizeObserver updates optimized dimensions",
  );
  assert.doesNotMatch(
    animatedMediaSource,
    /key=\{resolvedSrc \|\| resolvedFallback\}/,
    "video keys should not force a remount from the same ref/state feedback path",
  );
});
