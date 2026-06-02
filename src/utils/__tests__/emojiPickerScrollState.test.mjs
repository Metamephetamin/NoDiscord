import assert from "node:assert/strict";
import test from "node:test";

let emojiPickerScrollStateModule = null;
let emojiPickerScrollStateLoadError = null;

try {
  emojiPickerScrollStateModule = await import("../emojiPickerScrollState.js");
} catch (error) {
  emojiPickerScrollStateLoadError = error;
}

test("emoji picker search hides on downward scroll and returns at the top", () => {
  assert.ifError(emojiPickerScrollStateLoadError);

  const { getNextEmojiPickerSearchVisibility } = emojiPickerScrollStateModule;
  assert.equal(typeof getNextEmojiPickerSearchVisibility, "function");

  assert.equal(
    getNextEmojiPickerSearchVisibility({ previousScrollTop: 0, currentScrollTop: 24, searchHidden: false }),
    false,
  );
  assert.equal(
    getNextEmojiPickerSearchVisibility({ previousScrollTop: 24, currentScrollTop: 48, searchHidden: false }),
    true,
  );
  assert.equal(
    getNextEmojiPickerSearchVisibility({ previousScrollTop: 48, currentScrollTop: 49, searchHidden: true }),
    true,
  );
  assert.equal(
    getNextEmojiPickerSearchVisibility({ previousScrollTop: 24, currentScrollTop: 18, searchHidden: true }),
    true,
  );
  assert.equal(
    getNextEmojiPickerSearchVisibility({ previousScrollTop: 18, currentScrollTop: 0, searchHidden: true }),
    false,
  );
});
