import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatThemeSource = readFileSync("src/utils/chatTheme.mjs", "utf8");
const textChatCss = readFileSync("src/css/TextChat.css", "utf8");

test("custom chat backgrounds are scoped away from inherited root variables", () => {
  assert.match(chatThemeSource, /CHAT_CUSTOM_BACKGROUND_STYLE_ID/);
  assert.doesNotMatch(
    chatThemeSource,
    /node\.style\.setProperty\("--chat-custom-background-image",\s*toCssUrl\(customBackgroundData\)\)/,
    "large data-url backgrounds must not be inherited by the whole app tree"
  );
});

test("message scroll layer avoids forced GPU compositing with custom backgrounds", () => {
  const messagesListRule = textChatCss.match(/\.messages-list\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(messagesListRule, /translateZ\(0\)/);
  assert.doesNotMatch(messagesListRule, /will-change:\s*scroll-position/);
});

test("custom backgrounds disable blur-heavy message bubbles", () => {
  assert.match(
    textChatCss,
    /\[data-chat-custom-background="true"\][\s\S]*?\.msg-content--dm[\s\S]*?backdrop-filter:\s*none[\s\S]*?-webkit-backdrop-filter:\s*none/
  );
  assert.match(
    textChatCss,
    /\[data-chat-custom-background="true"\][\s\S]*?\.msg-content--dm:not[\s\S]*?--message-bubble-bg:\s*rgba\(17,\s*21,\s*31,\s*0\.96\)[\s\S]*?box-shadow:\s*0 6px 16px/
  );
});
