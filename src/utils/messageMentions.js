function normalizeMentionAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
}

function getMentionAliasesForMember(member) {
  const name = String(member?.name || "").trim();
  if (!name) {
    return [];
  }

  const firstToken = name.split(/\s+/)[0] || "";
  return Array.from(new Set([
    normalizeMentionAlias(name),
    normalizeMentionAlias(firstToken),
  ])).filter(Boolean);
}

export function buildMentionLookup(serverMembers = []) {
  const aliasMap = new Map();
  const collisions = new Set();

  (serverMembers || []).forEach((member) => {
    const userId = String(member?.userId || "").trim();
    if (!userId) {
      return;
    }

    getMentionAliasesForMember(member).forEach((alias) => {
      const existing = aliasMap.get(alias);
      if (existing && existing.userId !== userId) {
        collisions.add(alias);
        return;
      }

      if (!collisions.has(alias)) {
        aliasMap.set(alias, {
          userId,
          displayName: String(member?.name || "User").trim() || "User",
        });
      }
    });
  });

  collisions.forEach((alias) => aliasMap.delete(alias));
  return aliasMap;
}

export function extractMentionsFromText(text, serverMembers = []) {
  const lookup = buildMentionLookup(serverMembers);
  if (!lookup.size) {
    return [];
  }

  const mentions = [];
  const seenUserIds = new Set();
  const pattern = /(^|[^\p{L}\p{N}_.-])@([\p{L}\p{N}_.-]{1,80})/gu;

  for (const match of String(text || "").matchAll(pattern)) {
    const handle = String(match[2] || "");
    const alias = normalizeMentionAlias(handle);
    const resolved = lookup.get(alias);
    if (!resolved || seenUserIds.has(resolved.userId)) {
      continue;
    }

    seenUserIds.add(resolved.userId);
    mentions.push({
      userId: resolved.userId,
      handle,
      displayName: resolved.displayName,
    });
  }

  return mentions;
}

export function segmentMessageTextByMentions(text, mentions = []) {
  const mentionMap = new Map(
    (mentions || [])
      .map((mention) => {
        const handle = String(mention?.handle || "").trim();
        return handle
          ? [handle.toLowerCase(), {
              userId: String(mention?.userId || ""),
              displayName: String(mention?.displayName || handle),
              handle,
            }]
          : null;
      })
      .filter(Boolean)
  );

  if (!mentionMap.size) {
    return [{ text: String(text || ""), isMention: false }];
  }

  const segments = [];
  const pattern = /@([\p{L}\p{N}_.-]{1,80})/gu;
  let lastIndex = 0;
  const normalizedText = String(text || "");

  for (const match of normalizedText.matchAll(pattern)) {
    const matchedText = String(match[0] || "");
    const handle = String(match[1] || "").toLowerCase();
    const matchIndex = Number(match.index || 0);
    const mention = mentionMap.get(handle);
    if (!mention) {
      continue;
    }

    if (matchIndex > lastIndex) {
      segments.push({ text: normalizedText.slice(lastIndex, matchIndex), isMention: false });
    }

    segments.push({
      text: matchedText,
      isMention: true,
      userId: mention.userId,
      displayName: mention.displayName,
    });
    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex < normalizedText.length) {
    segments.push({ text: normalizedText.slice(lastIndex), isMention: false });
  }

  return segments.length ? segments : [{ text: normalizedText, isMention: false }];
}

export function isUserMentioned(mentions, userId) {
  const normalizedUserId = String(userId || "");
  return Array.isArray(mentions) && mentions.some((mention) => String(mention?.userId || "") === normalizedUserId);
}
