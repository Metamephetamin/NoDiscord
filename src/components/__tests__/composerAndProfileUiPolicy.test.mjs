import assert from "node:assert/strict";
import test from "node:test";
import { readRepoFile } from "./readRepoFile.mjs";

test("composer emoji picker stays above the composer with bottom breathing room", () => {
  const composerPopoversCss = readRepoFile("src/css/TextChatComposerPopovers.css");
  const pickerRule = composerPopoversCss.match(/\.composer-emoji-picker \{[\s\S]*?\n\}/)?.[0] || "";
  const mobilePickerRule = composerPopoversCss.match(/@media \(max-width: 900px\) \{[\s\S]*?\.composer-emoji-picker \{[\s\S]*?\n {2}\}/)?.[0] || "";

  assert.match(pickerRule, /bottom: calc\(100% \+ 30px\);/);
  assert.match(pickerRule, /max-height: min\(334px, calc\(100vh - 176px\)\);/);
  assert.match(pickerRule, /padding-bottom: 16px;/);
  assert.match(mobilePickerRule, /bottom: calc\(100% \+ 28px\);/);
  assert.match(mobilePickerRule, /max-height: min\(334px, calc\(100vh - 170px\)\);/);
});

test("bottom profile mini controls stay compact and inherit one icon color", () => {
  const profileVoiceCss = readRepoFile("src/css/MenuMainProfileVoice.css");
  const mobileCss = readRepoFile("src/css/MenuMainMobile.css");
  const miniIconRule = profileVoiceCss.match(/\.profile__mini-icon \{[\s\S]*?\n\}/)?.[0] || "";
  const miniArrowRule = profileVoiceCss.match(/\.profile__mini-arrow \{[\s\S]*?\n\}/)?.[0] || "";
  const chevronRule = profileVoiceCss.match(/\.profile__mini-chevron \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(miniIconRule, /height: 30px;/);
  assert.match(miniIconRule, /min-height: 30px;/);
  assert.match(miniArrowRule, /height: 30px;/);
  assert.match(miniArrowRule, /min-height: 30px;/);
  assert.match(miniArrowRule, /color: currentColor;/);
  assert.match(chevronRule, /background-color: currentColor;/);
  assert.match(mobileCss, /\.profile__mini-icon,\n\.profile__mini-arrow \{\n {2}min-height: 30px;\n\}/);
});

test("empty avatars render a shared VK-like silhouette placeholder", () => {
  const animatedAvatarSource = readRepoFile("src/components/AnimatedAvatar.jsx");
  const animatedMediaSource = readRepoFile("src/components/AnimatedMedia.jsx");
  const shellCss = readRepoFile("src/css/MenuMainShell.css");
  const emptyAvatarRule = shellCss.match(/\.animated-avatar--empty \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(animatedAvatarSource, /fallback = DEFAULT_AVATAR/);
  assert.match(animatedMediaSource, /className=\{\["animated-avatar--empty", className\]/);
  assert.match(emptyAvatarRule, /position: relative;/);
  assert.match(emptyAvatarRule, /overflow: hidden;/);
  assert.match(shellCss, /\.animated-avatar--empty::before/);
  assert.match(shellCss, /\.animated-avatar--empty::after/);
  assert.match(shellCss, /border-radius: 999px;/);
});
