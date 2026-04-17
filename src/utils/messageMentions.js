function normalizeMentionAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
}

function getMentionAliasesFromLabel(value) {
  const name = String(value || "").trim();
  if (!name) {
    return [];
  }

  const firstToken = name.split(/\s+/)[0] || "";
  return Array.from(new Set([
    normalizeMentionAlias(name),
    normalizeMentionAlias(firstToken),
  ])).filter(Boolean);
}

function buildEntityMentionRecord(entity, baseRecord) {
  const existing = entity.get(baseRecord.alias);
  if (existing && existing.entityKey !== baseRecord.entityKey) {
    entity.set(baseRecord.alias, null);
    return;
  }

  if (!existing) {
    entity.set(baseRecord.alias, baseRecord);
  }
}

function getMentionAliasesForMember(member) {
  return getMentionAliasesFromLabel(member?.name || member?.displayName || member?.nickname || "");
}

function getMentionAliasesForRole(role) {
  return getMentionAliasesFromLabel(role?.name || role?.displayName || role?.roleName || role?.role_name || "");
}

function getRoleColorValue(role) {
  return String(role?.color || role?.Color || role?.roleColor || role?.role_color || "").trim();
}

function getMemberRoleId(member) {
  return String(member?.roleId || member?.role_id || member?.RoleId || "").trim();
}

export function getMentionHandleForMember(member) {
  return getMentionAliasesForMember(member)[1] || getMentionAliasesForMember(member)[0] || "";
}

export function getMentionHandleForRole(role) {
  return getMentionAliasesForRole(role)[1] || getMentionAliasesForRole(role)[0] || "";
}

export function buildMentionLookup(serverMembers = [], serverRoles = []) {
  const aliasMap = new Map();
  const roleColorById = new Map(
    (serverRoles || []).map((role) => [String(role?.id || role?.roleId || role?.role_id || "").trim(), getRoleColorValue(role)])
  );

  (serverMembers || []).forEach((member) => {
    const userId = String(member?.userId || member?.id || "").trim();
    if (!userId) {
      return;
    }

    const displayName = String(member?.name || member?.displayName || "User").trim() || "User";
    const memberRoleId = getMemberRoleId(member);
    const color = String(
      member?.color
      || member?.Color
      || member?.roleColor
      || member?.role_color
      || roleColorById.get(memberRoleId)
      || ""
    ).trim();
    getMentionAliasesForMember(member).forEach((alias) => {
      buildEntityMentionRecord(aliasMap, {
        alias,
        entityKey: `user:${userId}`,
        type: "user",
        userId,
        handle: alias,
        displayName,
        color,
      });
    });
  });

  (serverRoles || []).forEach((role) => {
    const roleId = String(role?.id || role?.roleId || role?.role_id || "").trim();
    if (!roleId) {
      return;
    }

    const displayName = String(role?.name || role?.displayName || "Role").trim() || "Role";
    const color = getRoleColorValue(role);
    getMentionAliasesForRole(role).forEach((alias) => {
      buildEntityMentionRecord(aliasMap, {
        alias,
        entityKey: `role:${roleId}`,
        type: "role",
        roleId,
        handle: alias,
        displayName,
        color,
      });
    });
  });

  Array.from(aliasMap.entries()).forEach(([alias, value]) => {
    if (!value) {
      aliasMap.delete(alias);
    }
  });

  return aliasMap;
}

export function extractMentionsFromText(text, serverMembers = [], serverRoles = []) {
  const lookup = buildMentionLookup(serverMembers, serverRoles);
  if (!lookup.size) {
    return [];
  }

  const mentions = [];
  const seenEntityIds = new Set();
  const pattern = /(^|[^\p{L}\p{N}_.-])@([\p{L}\p{N}_.-]{1,80})/gu;

  for (const match of String(text || "").matchAll(pattern)) {
    const handle = String(match[2] || "");
    const alias = normalizeMentionAlias(handle);
    const resolved = lookup.get(alias);
    if (!resolved) {
      continue;
    }

    const entityId = resolved.type === "role" ? `role:${resolved.roleId}` : `user:${resolved.userId}`;
    if (seenEntityIds.has(entityId)) {
      continue;
    }

    seenEntityIds.add(entityId);
    if (resolved.type === "role") {
      mentions.push({
        type: "role",
        roleId: resolved.roleId,
        handle,
        displayName: resolved.displayName,
        color: resolved.color || "",
      });
      continue;
    }

    mentions.push({
      type: "user",
      userId: resolved.userId,
      handle,
      displayName: resolved.displayName,
      color: resolved.color || "",
    });
  }

  return mentions;
}

export function segmentMessageTextByMentions(text, mentions = []) {
  const mentionMap = new Map(
    (mentions || [])
      .map((mention) => {
        const handle = String(mention?.handle || "").trim();
        if (!handle) {
          return null;
        }

        const type = String(mention?.type || (mention?.roleId ? "role" : "user")).trim().toLowerCase() === "role"
          ? "role"
          : "user";

        return [handle.toLowerCase(), {
          type,
          userId: String(mention?.userId || ""),
          roleId: String(mention?.roleId || ""),
          displayName: String(mention?.displayName || handle),
          handle,
          color: String(mention?.color || ""),
        }];
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
      type: mention.type,
      userId: mention.userId,
      roleId: mention.roleId,
      displayName: mention.displayName,
      color: mention.color,
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
  return Array.isArray(mentions) && mentions.some((mention) =>
    String(mention?.type || (mention?.roleId ? "role" : "user")) !== "role"
    && String(mention?.userId || "") === normalizedUserId
  );
}

export { normalizeMentionAlias };
