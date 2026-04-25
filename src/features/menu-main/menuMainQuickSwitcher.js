import { getPinnedStorageKey, readPinnedMessages } from "../../utils/textChatHelpers";

export function buildMenuMainQuickSwitcherItems({
  activeTextNavigationChannelId = "",
  currentUserId = "",
  currentVoiceParticipants = [],
  directConversationTargets = [],
  getChannelDisplayName,
  getDisplayName,
  query = "",
  servers = [],
  textChatNavigationIndex = null,
}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const currentPinnedMessages = activeTextNavigationChannelId
    ? readPinnedMessages(getPinnedStorageKey(currentUserId, activeTextNavigationChannelId))
    : [];

  const baseItems = [
    ...(textChatNavigationIndex?.firstUnreadMessageId ? [{
      id: "chat:first-unread",
      kind: "chatAction",
      kindLabel: "Chat",
      shortLabel: "U",
      title: "Первое непрочитанное",
      subtitle: "Перейти к первой новой точке в текущем чате",
      action: "firstUnread",
      channelId: activeTextNavigationChannelId,
    }] : []),
    ...(textChatNavigationIndex?.canReturnToJumpPoint ? [{
      id: "chat:jump-back",
      kind: "chatAction",
      kindLabel: "Chat",
      shortLabel: "B",
      title: "Вернуться назад",
      subtitle: "Назад после перехода к сообщению",
      action: "jumpBack",
      channelId: activeTextNavigationChannelId,
    }] : []),
    ...servers.map((server) => ({
      id: `server:${server.id}`,
      kind: "server",
      kindLabel: "Server",
      shortLabel: "S",
      title: server.name || "Server",
      subtitle: `${(server.textChannels || []).length} текстовых • ${(server.voiceChannels || []).length} голосовых`,
      serverId: server.id,
    })),
    ...servers.flatMap((server) => (server.textChannels || []).map((channel) => ({
      id: `text:${server.id}:${channel.id}`,
      kind: "channel",
      kindLabel: "Text",
      shortLabel: "#",
      title: `${server.name || "Server"} / ${getChannelDisplayName(channel.name, "text")}`,
      subtitle: "Текстовый канал",
      serverId: server.id,
      channelId: channel.id,
    }))),
    ...servers.flatMap((server) => (server.voiceChannels || []).map((channel) => ({
      id: `voice:${server.id}:${channel.id}`,
      kind: "voice",
      kindLabel: "Voice",
      shortLabel: "V",
      title: `${server.name || "Server"} / ${getChannelDisplayName(channel.name, "voice")}`,
      subtitle: "Голосовой канал",
      serverId: server.id,
      channelId: channel.id,
    }))),
    ...directConversationTargets.map((friend) => ({
      id: `dm:${friend.id}`,
      kind: "dm",
      kindLabel: "DM",
      shortLabel: "@",
      title: getDisplayName(friend),
      subtitle: friend.isSelf ? "Личные заметки" : "Личный чат",
      friendId: friend.id,
    })),
    ...currentPinnedMessages.map((messageItem) => ({
      id: `pin:${messageItem.id}`,
      kind: "pin",
      kindLabel: "Pin",
      shortLabel: "P",
      title: messageItem.username || "User",
      subtitle: messageItem.preview || "Закреплённое сообщение",
      channelId: activeTextNavigationChannelId,
      messageId: messageItem.id,
    })),
    ...((textChatNavigationIndex?.searchResults || []).slice(0, 10).map((messageItem) => ({
      id: `search:${messageItem.id}`,
      kind: "message",
      kindLabel: "Find",
      shortLabel: "F",
      title: messageItem.username || "User",
      subtitle: messageItem.preview || "Найденное сообщение",
      channelId: activeTextNavigationChannelId,
      messageId: messageItem.id,
    }))),
    ...((textChatNavigationIndex?.mentionMessages || []).slice(-6).reverse().map((messageItem) => ({
      id: `mention:${messageItem.id}`,
      kind: "mention",
      kindLabel: "Mention",
      shortLabel: "@",
      title: messageItem.username || "User",
      subtitle: messageItem.message || "Упоминание",
      channelId: activeTextNavigationChannelId,
      messageId: messageItem.id,
    }))),
    ...((textChatNavigationIndex?.replyMessages || []).slice(-6).reverse().map((messageItem) => ({
      id: `reply:${messageItem.id}`,
      kind: "reply",
      kindLabel: "Reply",
      shortLabel: "R",
      title: messageItem.username || "User",
      subtitle: messageItem.replyPreview || messageItem.message || "Ответ",
      channelId: activeTextNavigationChannelId,
      messageId: messageItem.id,
    }))),
    ...(currentVoiceParticipants || []).map((participant) => ({
      id: `focus:${participant.userId}`,
      kind: "focus",
      kindLabel: "Stage",
      shortLabel: "L",
      title: participant.name || "Участник",
      subtitle: participant.isLive ? "Фокус на эфире" : participant.isSpeaking ? "Фокус на говорящем" : "Фокус на участнике",
      userId: participant.userId,
    })),
  ];

  if (!normalizedQuery) {
    return baseItems.slice(0, 24);
  }

  return baseItems
    .filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(normalizedQuery))
    .slice(0, 28);
}
