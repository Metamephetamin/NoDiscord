import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menuMainSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const textChatSource = readFileSync("src/features/text-chat/TextChatController.jsx", "utf8");
const voiceClientSource = readFileSync("src/webrtc/livekitVoiceRoomClient.js", "utf8");
const chatConnectSource = readFileSync("src/SignalR/ChatConnect.jsx", "utf8");
const voiceHubSource = readFileSync("BackNoDiscord/BackNoDiscord/VoiceHub.cs", "utf8");
const chatHubSource = readFileSync("BackNoDiscord/BackNoDiscord/ChatHub.cs", "utf8");
const backendEventsSource = readFileSync("BackNoDiscord/BackNoDiscord/Realtime/RealtimeEvents.cs", "utf8");
const frontendEventsSource = readFileSync("src/realtime/realtimeEvents.js", "utf8");
const friendsWorkspaceSource = readFileSync("src/components/FriendsWorkspace.jsx", "utf8");
const friendsStateSource = readFileSync("src/hooks/useFriendsWorkspaceState.js", "utf8");

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

assert(
  voiceClientSource.includes("connection.on(\"voice:channel-update\""),
  "Voice clients must apply channel-level participant updates without requiring a full voice snapshot."
);

assert(
  voiceHubSource.includes("Clients.All.SendAsync(\"voice:channel-update\"") &&
    !voiceHubSource.includes("Clients.All.SendAsync(\"voice:update\""),
  "VoiceHub mutating paths must broadcast channel deltas instead of full voice snapshots to every client."
);

assert(
  backendEventsSource.includes("FriendLocationUpdated") &&
    backendEventsSource.includes("FriendPresenceUpdated") &&
    chatHubSource.includes("RealtimeEvents.FriendLocationUpdated") &&
    chatHubSource.includes("RealtimeEvents.FriendPresenceUpdated"),
  "Backend friend location/presence events must use RealtimeEvents constants."
);

assert(
  frontendEventsSource.includes("friendLocationUpdated") &&
    frontendEventsSource.includes("friendPresenceUpdated") &&
    friendsWorkspaceSource.includes("REALTIME_EVENTS.friendLocationUpdated") &&
    friendsStateSource.includes("REALTIME_EVENTS.friendPresenceUpdated"),
  "Frontend friend location/presence subscriptions must use realtime event constants."
);

assert(
  !chatHubSource.includes('SendAsync("FriendLocationUpdated"') &&
    !chatHubSource.includes('SendAsync("FriendPresenceUpdated"') &&
    !friendsWorkspaceSource.includes('chatConnection.on("FriendLocationUpdated"') &&
    !friendsStateSource.includes('chatConnection.on("FriendPresenceUpdated"'),
  "Friend location/presence raw event strings must stay inside constants."
);

assert(
  chatConnectSource.includes("onChatReconnected") &&
    chatConnectSource.includes("chatReconnectedCallbacks") &&
    friendsStateSource.includes("onChatReconnected") &&
    /onChatReconnected\([\s\S]*?loadFriends\(\)/.test(friendsStateSource),
  "Friends state must refresh friends after chat SignalR reconnect to recover missed presence/location events."
);

console.log("Realtime smoke checks passed.");
