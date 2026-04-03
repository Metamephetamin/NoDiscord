const DIRECT_MESSAGE_PREFIX = "dm:";
const SELF_DIRECT_MESSAGE_SEGMENT = "self";

export function buildDirectMessageChannelId(firstUserId, secondUserId) {
  const firstId = Number(firstUserId);
  const secondId = Number(secondUserId);

  if (!Number.isInteger(firstId) || firstId <= 0 || !Number.isInteger(secondId) || secondId <= 0) {
    return "";
  }

  if (firstId === secondId) {
    return `${DIRECT_MESSAGE_PREFIX}${SELF_DIRECT_MESSAGE_SEGMENT}:${firstId}`;
  }

  const [lowId, highId] = [firstId, secondId].sort((left, right) => left - right);
  return `${DIRECT_MESSAGE_PREFIX}${lowId}:${highId}`;
}

export function parseDirectMessageChannelId(channelId) {
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedChannelId.toLowerCase().startsWith(DIRECT_MESSAGE_PREFIX)) {
    return null;
  }

  const parts = normalizedChannelId.split(":").filter(Boolean);
  if (parts.length !== 3) {
    return null;
  }

  if (parts[1].toLowerCase() === SELF_DIRECT_MESSAGE_SEGMENT) {
    const userId = Number(parts[2]);
    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    return {
      firstUserId: userId,
      secondUserId: userId,
      isSelf: true,
    };
  }

  const firstUserId = Number(parts[1]);
  const secondUserId = Number(parts[2]);
  if (!Number.isInteger(firstUserId) || firstUserId <= 0 || !Number.isInteger(secondUserId) || secondUserId <= 0) {
    return null;
  }

  return {
    firstUserId,
    secondUserId,
    isSelf: firstUserId === secondUserId,
  };
}

export function isDirectMessageChannelId(channelId) {
  return parseDirectMessageChannelId(channelId) !== null;
}
