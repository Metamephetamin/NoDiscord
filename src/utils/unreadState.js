const DEFAULT_MAX_UNREAD_COUNT = 999;

export function normalizeChannelId(channelId) {
  return String(channelId || "").trim();
}

export function clampUnreadCount(value, maxCount = DEFAULT_MAX_UNREAD_COUNT) {
  const numericValue = Math.max(0, Math.floor(Number(value) || 0));
  return Math.min(Math.max(0, Number(maxCount) || DEFAULT_MAX_UNREAD_COUNT), numericValue);
}

export function incrementUnreadCount(state, channelId, { amount = 1, maxCount = DEFAULT_MAX_UNREAD_COUNT } = {}) {
  const normalizedChannelId = normalizeChannelId(channelId);
  if (!normalizedChannelId) {
    return state || {};
  }

  const previousState = state || {};
  const previousCount = clampUnreadCount(previousState[normalizedChannelId], maxCount);
  const nextCount = clampUnreadCount(previousCount + Math.max(0, Number(amount) || 0), maxCount);
  if (nextCount === previousCount && Object.prototype.hasOwnProperty.call(previousState, normalizedChannelId)) {
    return previousState;
  }

  return {
    ...previousState,
    [normalizedChannelId]: nextCount,
  };
}

export function clearUnreadCount(state, channelId, { keepZero = false } = {}) {
  const normalizedChannelId = normalizeChannelId(channelId);
  if (!normalizedChannelId) {
    return state || {};
  }

  const previousState = state || {};
  const hasChannel = Object.prototype.hasOwnProperty.call(previousState, normalizedChannelId);
  if (keepZero) {
    if (hasChannel && clampUnreadCount(previousState[normalizedChannelId]) === 0) {
      return previousState;
    }

    return {
      ...previousState,
      [normalizedChannelId]: 0,
    };
  }

  if (!hasChannel) {
    return previousState;
  }

  const nextState = { ...previousState };
  delete nextState[normalizedChannelId];
  return nextState;
}

export function getTotalUnreadCount(state) {
  return Object.values(state || {}).reduce((sum, value) => sum + clampUnreadCount(value), 0);
}

export function getUnreadThreadCount(items, {
  state = {},
  activeChannelId = "",
  getChannelId = (item) => item?.channelId,
  getFallbackUnreadCount = (item) => item?.unreadCount,
} = {}) {
  const normalizedActiveChannelId = normalizeChannelId(activeChannelId);
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const channelId = normalizeChannelId(getChannelId(item));
    if (!channelId || channelId === normalizedActiveChannelId) {
      return sum;
    }

    const unreadCount = Object.prototype.hasOwnProperty.call(state || {}, channelId)
      ? clampUnreadCount(state[channelId])
      : clampUnreadCount(getFallbackUnreadCount(item));
    return unreadCount > 0 ? sum + 1 : sum;
  }, 0);
}

export function mergeUnreadCountsFromTargets(previousState, targets, {
  activeChannelId = "",
  getChannelId = (item) => item?.channelId,
  getUnreadCount = (item) => item?.unreadCount,
} = {}) {
  const normalizedActiveChannelId = normalizeChannelId(activeChannelId);
  const previous = previousState || {};
  let changed = false;
  const next = { ...previous };

  (Array.isArray(targets) ? targets : []).forEach((target) => {
    const channelId = normalizeChannelId(getChannelId(target));
    if (!channelId) {
      return;
    }

    if (channelId === normalizedActiveChannelId) {
      const cleared = clearUnreadCount(next, channelId, { keepZero: true });
      if (cleared !== next) {
        Object.keys(next).forEach((key) => delete next[key]);
        Object.assign(next, cleared);
        changed = true;
      }
      return;
    }

    const incomingCount = clampUnreadCount(getUnreadCount(target));
    const hasLocalCount = Object.prototype.hasOwnProperty.call(next, channelId);
    const localCount = clampUnreadCount(next[channelId]);
    if (incomingCount > localCount && (!hasLocalCount || localCount > 0)) {
      next[channelId] = incomingCount;
      changed = true;
    }
  });

  return changed ? next : previous;
}

export function shouldTrackIncomingUnread({
  channelId,
  activeChannelId = "",
  authorUserId = "",
  currentUserId = "",
} = {}) {
  const normalizedChannelId = normalizeChannelId(channelId);
  if (!normalizedChannelId) {
    return false;
  }

  if (normalizeChannelId(activeChannelId) === normalizedChannelId) {
    return false;
  }

  return !currentUserId || String(authorUserId || "") !== String(currentUserId);
}

export function shouldNotifyForUnread({
  notificationsEnabled = true,
  muted = false,
  shouldTrackUnread = true,
} = {}) {
  return Boolean(notificationsEnabled && shouldTrackUnread && !muted);
}
