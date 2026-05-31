import {
  createId,
  getDisplayName,
  getScopedVoiceChannelId,
  getUserAvatar,
  normalizeTextChannelName,
} from "../../utils/menuMainModel";
import {
  getServerSyncFingerprint,
  moveChannelInList,
  reorderById,
} from "./menuMainControllerUtils";
import { removeChannelCategoryWithChannels } from "./channelManagementUtils";

const FORUM_CHILD_PARENT_KEYS = [
  "parentForumId",
  "forumId",
  "forumChannelId",
  "sourceForumId",
  "parentChannelId",
  "threadParentId",
  "threadOfChannelId",
];

const isForumChannel = (channel) => String(channel?.kind || channel?.type || "text") === "forum";

const getLinkedForumDeletionIds = (channels = [], channelId = "") => {
  const normalizedChannelId = String(channelId || "");
  const targetChannel = channels.find((channel) => String(channel?.id || "") === normalizedChannelId);
  if (!targetChannel) {
    return new Set();
  }

  const deletionIds = new Set([normalizedChannelId]);
  if (!isForumChannel(targetChannel)) {
    return deletionIds;
  }

  channels.forEach((channel) => {
    const linkedToTargetForum = FORUM_CHILD_PARENT_KEYS.some((key) => String(channel?.[key] || "") === normalizedChannelId);
    if (linkedToTargetForum) {
      deletionIds.add(String(channel?.id || ""));
    }
  });

  return deletionIds;
};

export default function useMenuMainChannelActions({
  user,
  activeServer,
  canManageChannels,
  currentTextChannelId,
  setCurrentTextChannelId,
  currentVoiceChannel,
  leaveVoiceChannel,
  updateServer,
  syncServerSnapshot,
  lastServerSyncFingerprintRef,
  setDesktopServerPane,
  channelRenameState,
  setChannelRenameState,
  setChannelSettingsState,
}) {
  const syncSharedServer = (nextServer) => {
    if (!nextServer?.isShared) {
      return;
    }

    lastServerSyncFingerprintRef.current = getServerSyncFingerprint(nextServer);
    void syncServerSnapshot(nextServer, { applyResponse: false });
  };

  const openChannelSettings = (type, channel) => {
    if (!canManageChannels || !channel?.id) return;

    setChannelSettingsState({
      type,
      channelId: channel.id,
    });
    setChannelRenameState(null);
  };

  const closeChannelSettings = () => {
    setChannelSettingsState(null);
  };

  const updateChannelSettings = (type, channelId, patch) => {
    if (!canManageChannels || !channelId || !patch) return;

    if (type === "voice") {
      updateServer((server) => ({
        ...server,
        voiceChannels: server.voiceChannels.map((channel) =>
          channel.id === channelId
            ? { ...channel, ...patch, name: patch.name !== undefined ? String(patch.name ?? "") : channel.name }
            : channel
        ),
      }));
      return;
    }

    updateServer((server) => ({
      ...server,
      textChannels: server.textChannels.map((channel) =>
        channel.id === channelId
          ? { ...channel, ...patch, name: patch.name !== undefined ? String(patch.name ?? "") : channel.name }
          : channel
      ),
    }));
  };

  const cancelChannelRename = () => setChannelRenameState(null);

  const updateChannelRenameValue = (value) => {
    setChannelRenameState((previous) => (previous ? { ...previous, value } : previous));
  };

  const updateTextChannelName = (channelId, value) => {
    if (!canManageChannels) return;
    updateServer((server) => ({
      ...server,
      textChannels: server.textChannels.map((channel) =>
        channel.id === channelId ? { ...channel, name: normalizeTextChannelName(value) } : channel
      ),
    }));
  };

  const updateVoiceChannelName = (channelId, value) => {
    if (!canManageChannels) return;
    updateServer((server) => ({
      ...server,
      voiceChannels: server.voiceChannels.map((channel) =>
        channel.id === channelId ? { ...channel, name: value } : channel
      ),
    }));
  };

  const submitChannelRename = () => {
    if (!channelRenameState?.channelId) return;

    const nextName = channelRenameState.value.trim();
    if (!nextName) {
      cancelChannelRename();
      return;
    }

    if (channelRenameState.type === "voice") {
      updateVoiceChannelName(channelRenameState.channelId, nextName);
    } else {
      updateTextChannelName(channelRenameState.channelId, nextName);
    }

    cancelChannelRename();
  };

  const handleDeleteTextChannel = (channelId) => {
    if (!canManageChannels) return;
    if (!activeServer) return;
    const deletionIds = getLinkedForumDeletionIds(activeServer.textChannels || [], channelId);
    if (!deletionIds.size) return;

    const nextChannels = (activeServer.textChannels || []).filter((channel) => !deletionIds.has(String(channel.id || "")));
    const nextServer = { ...activeServer, textChannels: nextChannels };
    updateServer(() => nextServer);
    syncSharedServer(nextServer);

    if (deletionIds.has(String(currentTextChannelId || ""))) setCurrentTextChannelId(nextChannels[0]?.id || "");
    setChannelSettingsState((previous) => (
      previous?.type === "text" && deletionIds.has(String(previous.channelId || "")) ? null : previous
    ));
  };

  const handleDeleteVoiceChannel = async (channelId) => {
    if (!canManageChannels) return;
    if (!activeServer) return;
    if (currentVoiceChannel === getScopedVoiceChannelId(activeServer.id, channelId)) await leaveVoiceChannel();
    const nextServer = {
      ...activeServer,
      voiceChannels: (activeServer.voiceChannels || []).filter((channel) => String(channel.id || "") !== String(channelId || "")),
    };
    updateServer(() => nextServer);
    syncSharedServer(nextServer);
    setChannelSettingsState((previous) => (previous?.type === "voice" && previous.channelId === channelId ? null : previous));
  };

  const addTextChannel = () => {
    if (!canManageChannels || !activeServer) return;
    const channel = { id: createId("text"), name: "новый-канал" };
    const nextServer = { ...activeServer, textChannels: [...(activeServer.textChannels || []), channel] };
    updateServer(() => nextServer);
    syncSharedServer(nextServer);
    setCurrentTextChannelId(channel.id);
    setDesktopServerPane("text");
    setChannelRenameState(null);
  };

  const addVoiceChannel = () => {
    if (!canManageChannels || !activeServer) return;
    const channel = { id: createId("voice"), name: "голосовой-канал" };
    const nextServer = { ...activeServer, voiceChannels: [...(activeServer.voiceChannels || []), channel] };
    updateServer(() => nextServer);
    syncSharedServer(nextServer);
    setChannelRenameState(null);
  };

  const createChannelCategory = ({ name, privateCategory = false } = {}) => {
    if (!canManageChannels || !activeServer) return;
    const category = {
      id: createId("category"),
      name: String(name || "Новая категория").trim() || "Новая категория",
      privateCategory: Boolean(privateCategory),
      collapsed: false,
      order: activeServer.channelCategories?.length || 0,
    };

    updateServer((server) => ({
      ...server,
      channelCategories: [...(server.channelCategories || []), category],
    }));
  };

  const toggleChannelCategory = (categoryId) => {
    if (!activeServer || !categoryId) return;

    updateServer((server) => ({
      ...server,
      channelCategories: (server.channelCategories || []).map((category) =>
        category.id === categoryId
          ? { ...category, collapsed: !category.collapsed }
          : category
      ),
    }));
  };

  const deleteChannelCategory = async (categoryId) => {
    if (!canManageChannels || !activeServer || !categoryId) return;
    if (!(activeServer.channelCategories || []).some((category) => String(category?.id || "") === String(categoryId || ""))) {
      return;
    }

    const { nextServer, removedTextChannelIds, removedVoiceChannelIds } = removeChannelCategoryWithChannels(activeServer, categoryId);

    const currentVoiceChannelId = String(currentVoiceChannel || "");
    const shouldLeaveVoice = [...removedVoiceChannelIds].some((channelId) =>
      currentVoiceChannelId === channelId || currentVoiceChannelId === getScopedVoiceChannelId(activeServer.id, channelId)
    );
    if (shouldLeaveVoice) {
      await leaveVoiceChannel();
    }

    updateServer(() => nextServer);
    syncSharedServer(nextServer);

    if (removedTextChannelIds.has(String(currentTextChannelId || ""))) {
      setCurrentTextChannelId(nextServer.textChannels?.[0]?.id || "");
    }
    setChannelSettingsState((previous) => {
      if (previous?.type === "text" && removedTextChannelIds.has(String(previous.channelId || ""))) {
        return null;
      }
      if (previous?.type === "voice" && removedVoiceChannelIds.has(String(previous.channelId || ""))) {
        return null;
      }
      return previous;
    });
  };

  const deleteDefaultChannelCategory = async (type) => {
    if (!canManageChannels || !activeServer) return;
    const normalizedType = String(type || "");

    if (normalizedType === "voice") {
      const removedChannels = (activeServer.voiceChannels || []).filter((channel) => !String(channel.categoryId || ""));
      if (!removedChannels.length) return;

      const shouldLeaveVoice = removedChannels.some((channel) => {
        const channelId = String(channel.id || "");
        return currentVoiceChannel === channelId || currentVoiceChannel === getScopedVoiceChannelId(activeServer.id, channelId);
      });

      if (shouldLeaveVoice) {
        await leaveVoiceChannel();
      }

      const nextServer = {
        ...activeServer,
        voiceChannels: (activeServer.voiceChannels || []).filter((channel) => String(channel.categoryId || "")),
      };
      updateServer(() => nextServer);
      syncSharedServer(nextServer);
      setChannelSettingsState((previous) =>
        previous?.type === "voice" && removedChannels.some((channel) => String(channel.id || "") === String(previous.channelId || ""))
          ? null
          : previous
      );
      return;
    }

    if (normalizedType !== "text") return;

    const removedChannelIds = new Set(
      (activeServer.textChannels || [])
        .filter((channel) => !String(channel.categoryId || ""))
        .map((channel) => String(channel.id || ""))
    );
    if (!removedChannelIds.size) return;

    const nextChannels = (activeServer.textChannels || []).filter((channel) => String(channel.categoryId || ""));
    const nextServer = {
      ...activeServer,
      textChannels: nextChannels,
    };
    updateServer(() => nextServer);
    syncSharedServer(nextServer);

    if (removedChannelIds.has(String(currentTextChannelId || ""))) {
      setCurrentTextChannelId(nextChannels[0]?.id || "");
    }
    setChannelSettingsState((previous) =>
      previous?.type === "text" && removedChannelIds.has(String(previous.channelId || ""))
        ? null
        : previous
    );
  };

  const reorderChannelCategories = (sourceCategoryId, targetCategoryId) => {
    if (!canManageChannels || !activeServer || !sourceCategoryId || !targetCategoryId) return;

    const nextServer = {
      ...activeServer,
      channelCategories: reorderById(activeServer.channelCategories || [], sourceCategoryId, targetCategoryId),
    };
    updateServer(() => nextServer);
    syncSharedServer(nextServer);
  };

  const moveServerChannel = ({ type = "text", channelId = "", targetChannelId = "", targetCategoryId = "", placement = "before" } = {}) => {
    if (!canManageChannels || !activeServer || !channelId) return;

    if (String(type || "text") === "voice") {
      const nextServer = {
        ...activeServer,
        voiceChannels: moveChannelInList(activeServer.voiceChannels || [], { channelId, targetChannelId, targetCategoryId, placement }),
      };
      updateServer(() => nextServer);
      syncSharedServer(nextServer);
      return;
    }

    const nextServer = {
      ...activeServer,
      textChannels: moveChannelInList(activeServer.textChannels || [], { channelId, targetChannelId, targetCategoryId, placement }),
    };
    updateServer(() => nextServer);
    syncSharedServer(nextServer);
  };

  const createServerChannel = ({ type = "text", name = "", categoryId = "" } = {}) => {
    if (!canManageChannels || !activeServer) return null;

    const normalizedType = String(type || "text");
    const normalizedCategoryId = String(categoryId || "");
    const category = (activeServer.channelCategories || []).find((item) => item.id === normalizedCategoryId);
    const inheritedPrivateChannel = Boolean(category?.privateCategory);
    const fallbackName =
      normalizedType === "voice"
        ? "голосовой-канал"
        : normalizedType === "forum"
          ? "форум"
          : "новый-канал";
    const channelName = String(name || fallbackName).trim() || fallbackName;

    if (normalizedType === "voice") {
      const channel = {
        id: createId("voice"),
        name: channelName,
        categoryId: normalizedCategoryId,
        privateChannel: inheritedPrivateChannel,
      };
      const nextServer = { ...activeServer, voiceChannels: [...activeServer.voiceChannels, channel] };
      updateServer(() => nextServer);
      if (nextServer.isShared) {
        lastServerSyncFingerprintRef.current = getServerSyncFingerprint(nextServer);
        void syncServerSnapshot(nextServer, { applyResponse: false });
      }
      setChannelRenameState(null);
      return channel;
    }

    const channel = {
      id: createId(normalizedType === "forum" ? "forum" : "text"),
      name: normalizeTextChannelName(channelName, fallbackName),
      categoryId: normalizedCategoryId,
      kind: normalizedType === "forum" ? "forum" : "text",
      privateChannel: inheritedPrivateChannel,
      forumPosts: normalizedType === "forum" ? [] : undefined,
    };
    const nextServer = { ...activeServer, textChannels: [...activeServer.textChannels, channel] };
    updateServer(() => nextServer);
    if (nextServer.isShared) {
      lastServerSyncFingerprintRef.current = getServerSyncFingerprint(nextServer);
      void syncServerSnapshot(nextServer, { applyResponse: false });
    }
    setCurrentTextChannelId(channel.id);
    setDesktopServerPane("text");
    setChannelRenameState(null);
    return channel;
  };

  const createForumPost = (channelId, post) => {
    if (!activeServer || !channelId || !post?.title) return null;

    const createdPost = {
      id: createId("forum-post"),
      title: String(post.title || "").trim(),
      content: String(post.content || "").trim(),
      authorName: getDisplayName(user),
      authorAvatar: getUserAvatar(user),
      createdAt: new Date().toISOString(),
      reactions: 0,
      replies: [],
    };

    updateServer((server) => ({
      ...server,
      textChannels: server.textChannels.map((channel) =>
        channel.id === channelId
          ? { ...channel, forumPosts: [...(channel.forumPosts || []), createdPost] }
          : channel
      ),
    }));

    return createdPost;
  };

  const addForumReply = (channelId, postId, text) => {
    if (!activeServer || !channelId || !postId || !String(text || "").trim()) return;

    const reply = {
      id: createId("forum-reply"),
      text: String(text || "").trim(),
      authorName: getDisplayName(user),
      authorAvatar: getUserAvatar(user),
      createdAt: new Date().toISOString(),
    };

    updateServer((server) => ({
      ...server,
      textChannels: server.textChannels.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              forumPosts: (channel.forumPosts || []).map((post) =>
                post.id === postId
                  ? { ...post, replies: [...(post.replies || []), reply] }
                  : post
              ),
            }
          : channel
      ),
    }));
  };

  return {
    openChannelSettings,
    closeChannelSettings,
    updateChannelSettings,
    cancelChannelRename,
    updateChannelRenameValue,
    submitChannelRename,
    handleDeleteTextChannel,
    handleDeleteVoiceChannel,
    addTextChannel,
    addVoiceChannel,
    createChannelCategory,
    toggleChannelCategory,
    deleteChannelCategory,
    deleteDefaultChannelCategory,
    reorderChannelCategories,
    moveServerChannel,
    createServerChannel,
    createForumPost,
    addForumReply,
    updateTextChannelName,
    updateVoiceChannelName,
  };
}
