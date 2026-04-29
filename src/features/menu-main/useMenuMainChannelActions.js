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
    const nextChannels = activeServer.textChannels.filter((channel) => channel.id !== channelId);
    updateServer((server) => ({ ...server, textChannels: nextChannels }));
    if (currentTextChannelId === channelId) setCurrentTextChannelId(nextChannels[0]?.id || "");
    setChannelSettingsState((previous) => (previous?.type === "text" && previous.channelId === channelId ? null : previous));
  };

  const handleDeleteVoiceChannel = async (channelId) => {
    if (!canManageChannels) return;
    if (!activeServer) return;
    if (currentVoiceChannel === getScopedVoiceChannelId(activeServer.id, channelId)) await leaveVoiceChannel();
    updateServer((server) => ({ ...server, voiceChannels: server.voiceChannels.filter((channel) => channel.id !== channelId) }));
    setChannelSettingsState((previous) => (previous?.type === "voice" && previous.channelId === channelId ? null : previous));
  };

  const addTextChannel = () => {
    if (!canManageChannels || !activeServer) return;
    const channel = { id: createId("text"), name: "новый-канал" };
    updateServer((server) => ({ ...server, textChannels: [...server.textChannels, channel] }));
    setCurrentTextChannelId(channel.id);
    setDesktopServerPane("text");
    setChannelRenameState({
      type: "text",
      channelId: channel.id,
      value: channel.name,
    });
  };

  const addVoiceChannel = () => {
    if (!canManageChannels || !activeServer) return;
    const channel = { id: createId("voice"), name: "голосовой-канал" };
    updateServer((server) => ({ ...server, voiceChannels: [...server.voiceChannels, channel] }));
    setChannelRenameState({
      type: "voice",
      channelId: channel.id,
      value: channel.name,
    });
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

  const deleteChannelCategory = (categoryId) => {
    if (!canManageChannels || !activeServer || !categoryId) return;
    const normalizedCategoryId = String(categoryId || "");

    updateServer((server) => ({
      ...server,
      channelCategories: (server.channelCategories || []).filter((category) => String(category.id || "") !== normalizedCategoryId),
      textChannels: (server.textChannels || []).map((channel) =>
        String(channel.categoryId || "") === normalizedCategoryId ? { ...channel, categoryId: "" } : channel
      ),
      voiceChannels: (server.voiceChannels || []).map((channel) =>
        String(channel.categoryId || "") === normalizedCategoryId ? { ...channel, categoryId: "" } : channel
      ),
    }));
  };

  const reorderChannelCategories = (sourceCategoryId, targetCategoryId) => {
    if (!canManageChannels || !activeServer || !sourceCategoryId || !targetCategoryId) return;

    updateServer((server) => ({
      ...server,
      channelCategories: reorderById(server.channelCategories || [], sourceCategoryId, targetCategoryId),
    }));
  };

  const moveServerChannel = ({ type = "text", channelId = "", targetChannelId = "", targetCategoryId = "", placement = "before" } = {}) => {
    if (!canManageChannels || !activeServer || !channelId) return;

    if (String(type || "text") === "voice") {
      updateServer((server) => ({
        ...server,
        voiceChannels: moveChannelInList(server.voiceChannels || [], { channelId, targetChannelId, targetCategoryId, placement }),
      }));
      return;
    }

    updateServer((server) => ({
      ...server,
      textChannels: moveChannelInList(server.textChannels || [], { channelId, targetChannelId, targetCategoryId, placement }),
    }));
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
      setChannelRenameState({
        type: "voice",
        channelId: channel.id,
        value: channel.name,
      });
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
    setChannelRenameState({
      type: "text",
      channelId: channel.id,
      value: channel.name,
    });
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
    reorderChannelCategories,
    moveServerChannel,
    createServerChannel,
    createForumPost,
    addForumReply,
    updateTextChannelName,
    updateVoiceChannelName,
  };
}
