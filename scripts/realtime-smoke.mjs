import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menuMainSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const textChatSource = readFileSync("src/features/text-chat/TextChatController.jsx", "utf8");
const voiceClientSource = readFileSync("src/webrtc/livekitVoiceRoomClient.js", "utf8");

assert(
  /for \(const channelId of Array\.from\(desiredChannelIds\)\) \{\s*if \(joinedChannels\.has\(channelId\)\)/s.test(menuMainSource),
  "Server notification subscriptions must skip channels already joined on the current SignalR connection."
);

assert(
  textChatSource.includes("messageEditStateRef"),
  "Text chat realtime handlers must read edit state from a ref instead of rebinding SignalR on edit changes."
);

assert(
  !/\}, \[currentUserId, isDirectChat, messageEditState\?\.messageId, revokeLocalEchoObjectUrls, scopedChannelId\]\);/.test(textChatSource),
  "Text chat SignalR subscription effect must not depend on messageEditState changes."
);

assert(
  /connection\.onreconnected\(async \(\) => \{[\s\S]*?try \{[\s\S]*?signal:reconnected-recovery-failed/.test(voiceClientSource),
  "Voice SignalR reconnect recovery must catch register/rejoin failures instead of leaking unhandled async errors."
);

console.log("Realtime smoke checks passed.");
