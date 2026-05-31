const normalizeCategoryId = (categoryId) => String(categoryId || "");
const normalizeChannelType = (type) => (String(type || "text") === "voice" ? "voice" : "text");
const getChannelOrder = (channel, fallbackIndex) => {
  const order = Number(channel?.order);
  return Number.isFinite(order) ? order : fallbackIndex;
};

export const getOrderedServerChannelItems = (textChannels = [], voiceChannels = [], categoryId = "") => {
  const normalizedCategoryId = normalizeCategoryId(categoryId);
  return [
    ...(textChannels || []).map((channel, index) => ({ type: "text", channel, sourceIndex: index })),
    ...(voiceChannels || []).map((channel, index) => ({ type: "voice", channel, sourceIndex: index })),
  ]
    .filter((item) => normalizeCategoryId(item.channel?.categoryId) === normalizedCategoryId)
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
  const categoryIds = new Set([""]);
  (server?.channelCategories || []).forEach((category) => {
    categoryIds.add(normalizeCategoryId(category?.id));
  });
  [...(server?.textChannels || []), ...(server?.voiceChannels || [])].forEach((channel) => {
    categoryIds.add(normalizeCategoryId(channel?.categoryId));
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
      categoryId: normalizedTargetCategoryId,
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
      if (normalizeCategoryId(nextMixedChannels[index]?.channel?.categoryId) === normalizedTargetCategoryId) {
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
    const categoryKey = normalizeCategoryId(item.channel?.categoryId);
    const order = categoryOrder.get(categoryKey) || 0;
    categoryOrder.set(categoryKey, order + 1);
    const channel = { ...item.channel, categoryId: categoryKey, order };
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
