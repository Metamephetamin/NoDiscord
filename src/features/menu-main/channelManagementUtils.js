const normalizeCategoryId = (categoryId) => String(categoryId || "");
const normalizeChannelType = (type) => (String(type || "text") === "voice" ? "voice" : "text");
export const DEFAULT_TEXT_CHANNEL_CATEGORY_ID = "__default_text_channels";
export const DEFAULT_VOICE_CHANNEL_CATEGORY_ID = "__default_voice_channels";

const getDefaultCategoryIdForType = (type) =>
  normalizeChannelType(type) === "voice" ? DEFAULT_VOICE_CHANNEL_CATEGORY_ID : DEFAULT_TEXT_CHANNEL_CATEGORY_ID;

const getDisplayCategoryId = (type, channel) => {
  const categoryId = normalizeCategoryId(channel?.categoryId);
  return categoryId || getDefaultCategoryIdForType(type);
};

const materializeCategoryIdForType = (type, categoryId) => {
  const normalizedCategoryId = normalizeCategoryId(categoryId);
  if (normalizedCategoryId === getDefaultCategoryIdForType(type)) {
    return "";
  }

  return normalizedCategoryId;
};

const getChannelOrder = (channel, fallbackIndex) => {
  const order = Number(channel?.order);
  return Number.isFinite(order) ? order : fallbackIndex;
};

export const getOrderedServerChannelItems = (textChannels = [], voiceChannels = [], categoryId = "") => {
  const normalizedCategoryId = normalizeCategoryId(categoryId) || DEFAULT_TEXT_CHANNEL_CATEGORY_ID;
  return [
    ...(textChannels || []).map((channel, index) => ({ type: "text", channel, sourceIndex: index })),
    ...(voiceChannels || []).map((channel, index) => ({ type: "voice", channel, sourceIndex: index })),
  ]
    .filter((item) => getDisplayCategoryId(item.type, item.channel) === normalizedCategoryId)
    .sort((first, second) => {
      const firstOrder = getChannelOrder(first.channel, first.sourceIndex);
      const secondOrder = getChannelOrder(second.channel, second.sourceIndex);

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      if (first.type !== second.type) {
        return first.type === "text" ? -1 : 1;
      }

      return first.sourceIndex - second.sourceIndex;
    })
    .map(({ type, channel }) => ({ type, channel }));
};

const getServerChannelCategoryIds = (server) => {
  const categoryIds = new Set([DEFAULT_TEXT_CHANNEL_CATEGORY_ID, DEFAULT_VOICE_CHANNEL_CATEGORY_ID]);
  (server?.channelCategories || []).forEach((category) => {
    categoryIds.add(normalizeCategoryId(category?.id));
  });
  (server?.textChannels || []).forEach((channel) => {
    categoryIds.add(getDisplayCategoryId("text", channel));
  });
  (server?.voiceChannels || []).forEach((channel) => {
    categoryIds.add(getDisplayCategoryId("voice", channel));
  });
  return [...categoryIds];
};

export const moveServerChannelAcrossLists = (
  server,
  { type = "text", channelId = "", targetType = type, targetChannelId = "", targetCategoryId = "", placement = "before" } = {}
) => {
  const sourceType = normalizeChannelType(type);
  const normalizedChannelId = String(channelId || "");
  const normalizedTargetType = normalizeChannelType(targetType);
  const normalizedTargetChannelId = String(targetChannelId || "");
  const normalizedTargetCategoryId = normalizeCategoryId(targetCategoryId);
  const shouldInsertAfterTarget = String(placement || "before") === "after";
  if (!server || !normalizedChannelId) {
    return server;
  }

  if (
    normalizedChannelId === normalizedTargetChannelId &&
    sourceType === normalizedTargetType
  ) {
    return server;
  }

  const textChannels = server.textChannels || [];
  const voiceChannels = server.voiceChannels || [];
  const mixedChannels = getServerChannelCategoryIds(server).flatMap((categoryId) =>
    getOrderedServerChannelItems(textChannels, voiceChannels, categoryId)
  );
  const sourceIndex = mixedChannels.findIndex(
    (item) => item.type === sourceType && String(item.channel?.id || "") === normalizedChannelId
  );
  if (sourceIndex === -1) {
    return server;
  }

  const nextMixedChannels = [...mixedChannels];
  const [sourceItem] = nextMixedChannels.splice(sourceIndex, 1);
  const movedItem = {
    ...sourceItem,
    channel: {
      ...sourceItem.channel,
      categoryId: materializeCategoryIdForType(sourceItem.type, normalizedTargetCategoryId),
    },
  };
  let insertIndex = -1;

  if (normalizedTargetChannelId) {
    insertIndex = nextMixedChannels.findIndex(
      (item) => item.type === normalizedTargetType && String(item.channel?.id || "") === normalizedTargetChannelId
    );
    if (insertIndex !== -1 && shouldInsertAfterTarget) {
      insertIndex += 1;
    }
  }

  if (insertIndex === -1) {
    insertIndex = nextMixedChannels.length;
    for (let index = nextMixedChannels.length - 1; index >= 0; index -= 1) {
      if (getDisplayCategoryId(nextMixedChannels[index]?.type, nextMixedChannels[index]?.channel) === normalizedTargetCategoryId) {
        insertIndex = index + 1;
        break;
      }
    }
  }

  nextMixedChannels.splice(insertIndex, 0, movedItem);

  const categoryOrder = new Map();
  const orderedTextChannels = [];
  const orderedVoiceChannels = [];
  nextMixedChannels.forEach((item) => {
    const categoryKey = getDisplayCategoryId(item.type, item.channel);
    const order = categoryOrder.get(categoryKey) || 0;
    categoryOrder.set(categoryKey, order + 1);
    const channel = { ...item.channel, categoryId: materializeCategoryIdForType(item.type, categoryKey), order };
    if (item.type === "voice") {
      orderedVoiceChannels.push(channel);
      return;
    }

    orderedTextChannels.push(channel);
  });

  return {
    ...server,
    textChannels: orderedTextChannels,
    voiceChannels: orderedVoiceChannels,
  };
};

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
