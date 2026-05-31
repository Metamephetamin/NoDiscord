const normalizeCategoryId = (categoryId) => String(categoryId || "");

export const removeChannelCategoryWithChannels = (server, categoryId) => {
  const normalizedCategoryId = normalizeCategoryId(categoryId);
  const removedTextChannelIds = new Set();
  const removedVoiceChannelIds = new Set();

  const nextTextChannels = (server?.textChannels || []).filter((channel) => {
    const shouldRemove = normalizeCategoryId(channel?.categoryId) === normalizedCategoryId;
    if (shouldRemove) {
      removedTextChannelIds.add(String(channel?.id || ""));
    }
    return !shouldRemove;
  });
  const nextVoiceChannels = (server?.voiceChannels || []).filter((channel) => {
    const shouldRemove = normalizeCategoryId(channel?.categoryId) === normalizedCategoryId;
    if (shouldRemove) {
      removedVoiceChannelIds.add(String(channel?.id || ""));
    }
    return !shouldRemove;
  });

  return {
    nextServer: {
      ...server,
      channelCategories: (server?.channelCategories || []).filter(
        (category) => normalizeCategoryId(category?.id) !== normalizedCategoryId
      ),
      textChannels: nextTextChannels,
      voiceChannels: nextVoiceChannels,
    },
    removedTextChannelIds,
    removedVoiceChannelIds,
  };
};
