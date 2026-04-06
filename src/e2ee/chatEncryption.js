import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, getStoredToken, parseApiResponse } from "../utils/auth";

const DEVICE_IDENTITY_PREFIX = "nd:e2ee:device:";
const SHARED_KEY_PREFIX = "nd:e2ee:shared:";
const DEVICE_IDENTITY_ALGORITHM = "ECDH-P256";
const DEVICE_IDENTITY_CURVE = "P-256";
const TEXT_SCOPE = "text";
const VOICE_SCOPE = "voice";
const MESSAGE_ENCRYPTION_VERSION = "nd-e2ee-v2-shared";
const LEGACY_MESSAGE_ENCRYPTION_VERSION = "nd-e2ee-v1";
const FILE_ENCRYPTION_VERSION = "nd-e2ee-file-v1";
const KEY_DIGEST_LABEL = "nd-e2ee-wrap-v1";
const SHARED_KEY_DELIMITER = "::";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const identityCache = new Map();
const sharedKeyCache = new Map();

function getIdentityStorageKey(userId) {
  const normalizedUserId = String(userId || "").trim();
  return normalizedUserId ? `${DEVICE_IDENTITY_PREFIX}${normalizedUserId}` : "";
}

function getSharedKeyStorageKey(sharedKeyId) {
  const normalizedSharedKeyId = String(sharedKeyId || "").trim();
  return normalizedSharedKeyId ? `${SHARED_KEY_PREFIX}${encodeURIComponent(normalizedSharedKeyId)}` : "";
}

function normalizeScope(scope) {
  return String(scope || "").trim().toLowerCase() === VOICE_SCOPE ? VOICE_SCOPE : TEXT_SCOPE;
}

function getCurrentUtcKeyDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildSharedKeyId(scope, channelId, keyDate) {
  return [
    normalizeScope(scope),
    encodeURIComponent(String(channelId || "").trim()),
    String(keyDate || "").trim(),
  ].join(SHARED_KEY_DELIMITER);
}

function parseSharedKeyId(sharedKeyId, fallbackScope = TEXT_SCOPE) {
  const parts = String(sharedKeyId || "").split(SHARED_KEY_DELIMITER);
  if (parts.length !== 3) {
    return {
      scope: normalizeScope(fallbackScope),
      channelId: "",
      keyDate: "",
      sharedKeyId: String(sharedKeyId || "").trim(),
    };
  }

  return {
    scope: normalizeScope(parts[0]),
    channelId: decodeURIComponent(parts[1] || ""),
    keyDate: String(parts[2] || "").trim(),
    sharedKeyId: String(sharedKeyId || "").trim(),
  };
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce((result, key) => {
      result[key] = sortObjectKeys(value[key]);
      return result;
    }, {});
}

function toBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function resolveApiAssetUrl(value) {
  try {
    return new URL(String(value || ""), API_BASE_URL).toString();
  } catch {
    return String(value || "");
  }
}

async function readSecureValue(key) {
  if (!key) {
    return null;
  }

  if (window?.electronSecrets?.get) {
    return window.electronSecrets.get(key);
  }

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeSecureValue(key, value) {
  if (!key) {
    return;
  }

  if (window?.electronSecrets?.set) {
    await window.electronSecrets.set(key, value);
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

async function removeSecureValue(key) {
  if (!key) {
    return;
  }

  if (window?.electronSecrets?.remove) {
    await window.electronSecrets.remove(key);
    return;
  }

  localStorage.removeItem(key);
}

async function computeFingerprint(publicKeyJwk) {
  const canonicalJson = JSON.stringify(sortObjectKeys(publicKeyJwk));
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(canonicalJson));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function importPublicKey(publicKeyJwk) {
  const jwk = typeof publicKeyJwk === "string" ? JSON.parse(publicKeyJwk) : publicKeyJwk;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: DEVICE_IDENTITY_CURVE },
    true,
    []
  );
}

async function importAesKey(rawKey, usages) {
  const normalizedRawKey = rawKey instanceof Uint8Array ? rawKey : new Uint8Array(rawKey);
  return crypto.subtle.importKey("raw", normalizedRawKey, { name: "AES-GCM" }, false, usages);
}

async function deriveWrapKey(privateKey, recipientPublicKeyJwk) {
  const publicKey = await importPublicKey(recipientPublicKeyJwk);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(KEY_DIGEST_LABEL + toBase64(derivedBits))
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function generateDeviceIdentity() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: DEVICE_IDENTITY_CURVE },
    true,
    ["deriveBits"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const fingerprint = await computeFingerprint(publicKeyJwk);

  return {
    algorithm: DEVICE_IDENTITY_ALGORITHM,
    publicKeyJwk,
    privateKeyJwk,
    fingerprint,
  };
}

async function importStoredIdentity(serializedIdentity) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    serializedIdentity.publicKeyJwk,
    { name: "ECDH", namedCurve: DEVICE_IDENTITY_CURVE },
    true,
    []
  );
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    serializedIdentity.privateKeyJwk,
    { name: "ECDH", namedCurve: DEVICE_IDENTITY_CURVE },
    true,
    ["deriveBits"]
  );

  return {
    ...serializedIdentity,
    publicKey,
    privateKey,
  };
}

async function registerDeviceKey(identity, userId) {
  const response = await authFetch(`${API_BASE_URL}/e2ee/device-key`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      algorithm: identity.algorithm,
      publicKeyJwk: JSON.stringify(identity.publicKeyJwk),
      fingerprint: identity.fingerprint,
    }),
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Failed to register E2EE device key."));
  }

  return {
    userId: String(data?.userId || userId || ""),
    fingerprint: String(data?.fingerprint || identity.fingerprint || ""),
  };
}

async function loadSharedKeyFromSecureStore(sharedKeyId) {
  const storageKey = getSharedKeyStorageKey(sharedKeyId);
  if (!storageKey) {
    return null;
  }

  const cachedValue = await readSecureValue(storageKey);
  if (!cachedValue?.keyBase64) {
    return null;
  }

  return {
    sharedKeyId,
    keyDate: String(cachedValue.keyDate || ""),
    rawKey: fromBase64(cachedValue.keyBase64),
  };
}

async function persistSharedKey(sharedKeyId, keyDate, rawKey) {
  const storageKey = getSharedKeyStorageKey(sharedKeyId);
  if (!storageKey) {
    return;
  }

  const normalizedRawKey = rawKey instanceof Uint8Array ? rawKey : new Uint8Array(rawKey);
  const payload = {
    sharedKeyId,
    keyDate: String(keyDate || ""),
    keyBase64: toBase64(normalizedRawKey),
  };
  await writeSecureValue(storageKey, payload);
  sharedKeyCache.set(sharedKeyId, Promise.resolve({
    sharedKeyId,
    keyDate: String(keyDate || ""),
    rawKey: normalizedRawKey,
  }));
}

async function clearPersistedSharedKey(sharedKeyId) {
  const storageKey = getSharedKeyStorageKey(sharedKeyId);
  sharedKeyCache.delete(sharedKeyId);
  if (storageKey) {
    await removeSecureValue(storageKey);
  }
}

async function fetchChannelKeyState({ channelId, scope, keyDate }) {
  const response = await authFetch(`${API_BASE_URL}/e2ee/channel-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channelId,
      scope: normalizeScope(scope),
      keyDate: String(keyDate || ""),
    }),
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Failed to resolve E2EE channel key."));
  }

  return {
    keyDate: String(data?.keyDate || keyDate || ""),
    participants: Array.isArray(data?.participants) ? data.participants : [],
    availableRecipientUserIds: Array.isArray(data?.availableRecipientUserIds)
      ? data.availableRecipientUserIds.map((item) => String(item || "")).filter(Boolean)
      : [],
    currentEnvelope: data?.currentEnvelope || null,
  };
}

async function publishChannelKeyEnvelopes({
  channelId,
  scope,
  keyDate,
  user,
  identity,
  sharedKeyRaw,
  participants,
  targetUserIds = [],
}) {
  const normalizedTargetUserIds = new Set(
    (Array.isArray(targetUserIds) && targetUserIds.length ? targetUserIds : participants.map((item) => item?.userId))
      .map((item) => String(item || ""))
      .filter(Boolean)
  );

  const recipients = [];
  for (const participant of participants) {
    const participantUserId = String(participant?.userId || "");
    if (!participant?.hasKey || !participant?.publicKeyJwk || !normalizedTargetUserIds.has(participantUserId)) {
      continue;
    }

    const wrapKey = await deriveWrapKey(identity.privateKey, participant.publicKeyJwk);
    const wrapIv = randomBytes(12);
    const wrappedKey = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: wrapIv },
      wrapKey,
      sharedKeyRaw
    );
    recipients.push({
      userId: participantUserId,
      keyFingerprint: String(participant?.fingerprint || ""),
      wrapIv: toBase64(wrapIv),
      wrappedKey: toBase64(wrappedKey),
    });
  }

  if (!recipients.length) {
    throw new Error("No eligible E2EE recipients were found for this channel.");
  }

  const response = await authFetch(`${API_BASE_URL}/e2ee/channel-key`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channelId,
      scope: normalizeScope(scope),
      keyDate,
      creatorFingerprint: identity.fingerprint,
      creatorPublicKeyJwk: JSON.stringify(identity.publicKeyJwk),
      recipients,
    }),
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Failed to publish shared E2EE key."));
  }

  return recipients.length;
}

async function decryptSharedKeyEnvelope({ envelope, identity }) {
  if (!envelope?.wrappedKey || !envelope?.wrapIv || !envelope?.creatorPublicKeyJwk) {
    throw new Error("Encrypted channel key envelope is incomplete.");
  }

  const wrapKey = await deriveWrapKey(identity.privateKey, envelope.creatorPublicKeyJwk);
  const rawKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.wrapIv) },
    wrapKey,
    fromBase64(envelope.wrappedKey)
  );
  return new Uint8Array(rawKey);
}

async function resolveSharedChannelKey({ channelId, user, scope = TEXT_SCOPE, keyDate = "" }) {
  const normalizedScope = normalizeScope(scope);
  const resolvedKeyDate = String(keyDate || "").trim() || getCurrentUtcKeyDate();
  const sharedKeyId = buildSharedKeyId(normalizedScope, channelId, resolvedKeyDate);

  if (sharedKeyCache.has(sharedKeyId)) {
    return sharedKeyCache.get(sharedKeyId);
  }

  const sharedKeyPromise = (async () => {
    const secureStoredKey = await loadSharedKeyFromSecureStore(sharedKeyId);
    const identity = await ensureE2eeDeviceIdentity(user);
    const keyState = await fetchChannelKeyState({ channelId, scope: normalizedScope, keyDate: resolvedKeyDate });
    const participants = Array.isArray(keyState.participants) ? keyState.participants : [];
    const keyedParticipants = participants.filter((participant) => participant?.hasKey);
    const participantsWithoutKeys = participants.filter((participant) => !participant?.hasKey);

    let sharedKeyRaw = null;
    let usedSecureStoredKey = false;
    if (keyState.currentEnvelope) {
      try {
        sharedKeyRaw = await decryptSharedKeyEnvelope({ envelope: keyState.currentEnvelope, identity });
      } catch {
        sharedKeyRaw = null;
      }
    }

    if (!sharedKeyRaw && secureStoredKey?.rawKey?.length) {
      sharedKeyRaw = secureStoredKey.rawKey;
      usedSecureStoredKey = true;
    }

    if (!sharedKeyRaw) {
      if ((keyState.availableRecipientUserIds || []).length > 0) {
        throw new Error("The current daily E2EE key has not been shared with this user yet.");
      }

      if (participantsWithoutKeys.length) {
        throw new Error("Not all participants have published E2EE keys yet.");
      }

      sharedKeyRaw = randomBytes(32);
      await publishChannelKeyEnvelopes({
        channelId,
        scope: normalizedScope,
        keyDate: keyState.keyDate || resolvedKeyDate,
        user,
        identity,
        sharedKeyRaw,
        participants: keyedParticipants,
      });
    }

    if (usedSecureStoredKey && keyState.currentEnvelope) {
      try {
        const refreshedSharedKey = await decryptSharedKeyEnvelope({ envelope: keyState.currentEnvelope, identity });
        if (refreshedSharedKey?.length) {
          sharedKeyRaw = refreshedSharedKey;
        }
      } catch {
        // keep locally stored shared key when the envelope still targets an older device key
      }
    }

    const availableRecipientUserIds = new Set((keyState.availableRecipientUserIds || []).map((item) => String(item || "")));
    const missingRecipientUserIds = keyedParticipants
      .map((participant) => String(participant?.userId || ""))
      .filter((participantUserId) => participantUserId && !availableRecipientUserIds.has(participantUserId));

    if (missingRecipientUserIds.length) {
      await publishChannelKeyEnvelopes({
        channelId,
        scope: normalizedScope,
        keyDate: keyState.keyDate || resolvedKeyDate,
        user,
        identity,
        sharedKeyRaw,
        participants: keyedParticipants,
        targetUserIds: missingRecipientUserIds,
      }).catch(() => {});
    }

    await persistSharedKey(sharedKeyId, keyState.keyDate || resolvedKeyDate, sharedKeyRaw);
    return {
      sharedKeyId,
      keyDate: keyState.keyDate || resolvedKeyDate,
      rawKey: sharedKeyRaw,
    };
  })();

  sharedKeyCache.set(sharedKeyId, sharedKeyPromise);

  try {
    return await sharedKeyPromise;
  } catch (error) {
    sharedKeyCache.delete(sharedKeyId);
    throw error;
  }
}

async function encryptWithAesGcm(rawKey, plaintextBytes) {
  const iv = randomBytes(12);
  const key = await importAesKey(rawKey, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintextBytes);
  return {
    iv,
    ciphertext: new Uint8Array(ciphertext),
  };
}

async function decryptWithAesGcm(rawKey, ivBase64, ciphertextBase64) {
  const key = await importAesKey(rawKey, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    key,
    fromBase64(ciphertextBase64)
  );
  return new Uint8Array(plaintext);
}

async function wrapFileKeyWithSharedKey(sharedKeyRaw, fileKeyRaw) {
  const wrapIv = randomBytes(12);
  const sharedKey = await importAesKey(sharedKeyRaw, ["encrypt"]);
  const wrappedFileKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv },
    sharedKey,
    fileKeyRaw
  );
  return {
    keyWrapIv: toBase64(wrapIv),
    wrappedFileKey: toBase64(wrappedFileKey),
  };
}

async function unwrapFileKeyWithSharedKey(sharedKeyRaw, attachmentEncryption) {
  const sharedKey = await importAesKey(sharedKeyRaw, ["decrypt"]);
  const fileKeyRaw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(attachmentEncryption.keyWrapIv) },
    sharedKey,
    fromBase64(attachmentEncryption.wrappedFileKey)
  );
  return new Uint8Array(fileKeyRaw);
}

async function readRemoteAttachmentCipherBytes(attachmentUrl) {
  const resolvedUrl = resolveApiAssetUrl(attachmentUrl);
  if (window?.electronDownloads?.fetchBytes) {
    try {
      const token = getStoredToken();
      const result = await window.electronDownloads.fetchBytes({
        url: resolvedUrl,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return new Uint8Array(result?.bytes || []);
    } catch (error) {
      const message = String(error?.message || error || "");
      if (!message.includes("downloads:fetch-bytes")) {
        throw error;
      }
    }
  }

  const response = await authFetch(resolvedUrl);
  if (!response.ok) {
    const data = await parseApiResponse(response);
    throw new Error(getApiErrorMessage(response, data, "Failed to download encrypted attachment."));
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function ensureE2eeDeviceIdentity(user) {
  const userId = String(user?.id || "").trim();
  if (!userId) {
    throw new Error("Authenticated user id is required for E2EE.");
  }

  if (identityCache.has(userId)) {
    return identityCache.get(userId);
  }

  const identityPromise = (async () => {
    const storageKey = getIdentityStorageKey(userId);
    const storedIdentity = await readSecureValue(storageKey);
    const normalizedStoredIdentity =
      storedIdentity?.publicKeyJwk && storedIdentity?.privateKeyJwk && storedIdentity?.fingerprint
        ? storedIdentity
        : await generateDeviceIdentity();

    await writeSecureValue(storageKey, normalizedStoredIdentity);
    const importedIdentity = await importStoredIdentity(normalizedStoredIdentity);
    await registerDeviceKey(importedIdentity, userId);
    return importedIdentity;
  })();

  identityCache.set(userId, identityPromise);
  try {
    return await identityPromise;
  } catch (error) {
    identityCache.delete(userId);
    throw error;
  }
}

export async function fetchChannelE2eeDirectory(channelId, scope = TEXT_SCOPE) {
  const response = await authFetch(`${API_BASE_URL}/e2ee/channel-directory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, scope: normalizeScope(scope) }),
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Failed to resolve E2EE directory."));
  }

  return Array.isArray(data?.participants) ? data.participants : [];
}

export async function ensureDailySharedChannelKey({ channelId, user, scope = TEXT_SCOPE, keyDate = "" }) {
  return resolveSharedChannelKey({ channelId, user, scope, keyDate });
}

export async function prepareOutgoingTextEncryption({ channelId, user, text, scope = TEXT_SCOPE }) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return {
      message: normalizedText,
      encryption: null,
      encryptionState: "empty",
    };
  }

  try {
    const sharedKey = await ensureDailySharedChannelKey({ channelId, user, scope });
    const { iv, ciphertext } = await encryptWithAesGcm(sharedKey.rawKey, textEncoder.encode(normalizedText));

    return {
      message: "",
      encryptionState: "e2ee",
      encryption: {
        version: MESSAGE_ENCRYPTION_VERSION,
        algorithm: "AES-GCM",
        sharedKeyId: sharedKey.sharedKeyId,
        iv: toBase64(iv),
        ciphertext: toBase64(ciphertext),
        recipients: [],
      },
    };
  } catch (error) {
    return {
      message: normalizedText,
      encryption: null,
      encryptionState: "plaintext",
      reason: error?.message || "Falling back to plaintext because E2EE setup failed.",
    };
  }
}

export async function decryptIncomingMessageText(messageItem, user, { channelId = "", scope = TEXT_SCOPE } = {}) {
  const encryption = messageItem?.encryption || messageItem?.Encryption;
  if (!encryption?.ciphertext || !encryption?.iv || (!Array.isArray(encryption?.recipients) && !encryption?.sharedKeyId)) {
    return {
      text: String(messageItem?.message || ""),
      encryptionState: "plaintext",
    };
  }

  try {
    if (String(encryption?.sharedKeyId || "").trim()) {
      const parsedSharedKey = parseSharedKeyId(encryption.sharedKeyId, scope);
      const resolvedChannelId = parsedSharedKey.channelId || channelId || String(messageItem?.channelId || "");
      const resolvedScope = parsedSharedKey.scope || scope;
      let plaintextBytes = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const sharedKey = await ensureDailySharedChannelKey({
            channelId: resolvedChannelId,
            user,
            scope: resolvedScope,
            keyDate: parsedSharedKey.keyDate,
          });
          plaintextBytes = await decryptWithAesGcm(sharedKey.rawKey, encryption.iv, encryption.ciphertext);
          break;
        } catch (error) {
          if (attempt === 0 && String(encryption?.sharedKeyId || "").trim()) {
            await clearPersistedSharedKey(encryption.sharedKeyId);
            continue;
          }

          throw error;
        }
      }

      return {
        text: textDecoder.decode(plaintextBytes || new Uint8Array()),
        encryptionState: "e2ee",
      };
    }

    const identity = await ensureE2eeDeviceIdentity(user);
    const currentUserId = String(user?.id || "");
    const recipientEntry = Array.isArray(encryption?.recipients)
      ? encryption.recipients.find((entry) => String(entry?.userId || "") === currentUserId)
      : null;
    if (!recipientEntry?.wrappedKey || !recipientEntry?.wrapIv || !encryption?.senderPublicKeyJwk) {
      return {
        text: "[Encrypted message unavailable]",
        encryptionState: "unavailable",
      };
    }

    const wrapKey = await deriveWrapKey(identity.privateKey, encryption.senderPublicKeyJwk);
    const messageKeyRaw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(recipientEntry.wrapIv) },
      wrapKey,
      fromBase64(recipientEntry.wrappedKey)
    );
    const messageKey = await importAesKey(messageKeyRaw, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encryption.iv) },
      messageKey,
      fromBase64(encryption.ciphertext)
    );

    return {
      text: textDecoder.decode(plaintext),
      encryptionState: encryption?.version === LEGACY_MESSAGE_ENCRYPTION_VERSION ? "e2ee-legacy" : "e2ee",
    };
  } catch {
    return {
      text: "[Encrypted message unavailable]",
      encryptionState: "unavailable",
    };
  }
}

export async function prepareOutgoingAttachmentEncryption({ channelId, user, file }) {
  if (!(file instanceof Blob)) {
    throw new Error("Attachment blob is required for encryption.");
  }

  const sharedKey = await ensureDailySharedChannelKey({ channelId, user, scope: TEXT_SCOPE });
  const fileKeyRaw = randomBytes(32);
  // Preserve the exact original attachment bytes. Do not transcode or recompress here.
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const encryptedFile = await encryptWithAesGcm(fileKeyRaw, fileBytes);
  const metadataPayload = {
    name: String(file.name || "file"),
    contentType: String(file.type || "application/octet-stream"),
    size: Number(file.size || fileBytes.byteLength || 0),
    lastModified: Number(file.lastModified || 0),
  };
  const encryptedMetadata = await encryptWithAesGcm(fileKeyRaw, textEncoder.encode(JSON.stringify(metadataPayload)));
  const wrappedFileKey = await wrapFileKeyWithSharedKey(sharedKey.rawKey, fileKeyRaw);

  return {
    uploadBlob: new Blob([encryptedFile.ciphertext], { type: "application/octet-stream" }),
    uploadFileName: "attachment.bin",
    attachmentEncryption: {
      version: FILE_ENCRYPTION_VERSION,
      algorithm: "AES-GCM",
      sharedKeyId: sharedKey.sharedKeyId,
      keyWrapIv: wrappedFileKey.keyWrapIv,
      wrappedFileKey: wrappedFileKey.wrappedFileKey,
      fileIv: toBase64(encryptedFile.iv),
      metadataIv: toBase64(encryptedMetadata.iv),
      metadataCiphertext: toBase64(encryptedMetadata.ciphertext),
    },
  };
}

export async function decryptIncomingAttachment(messageItem, user, { channelId = "", scope = TEXT_SCOPE } = {}) {
  const attachmentEncryption = messageItem?.attachmentEncryption || messageItem?.AttachmentEncryption;
  const attachmentUrl = String(messageItem?.attachmentUrl || "");
  if (!attachmentEncryption?.sharedKeyId || !attachmentUrl) {
    return null;
  }

  const parsedSharedKey = parseSharedKeyId(attachmentEncryption.sharedKeyId, scope);
  const resolvedChannelId = parsedSharedKey.channelId || channelId || String(messageItem?.channelId || "");
  const resolvedScope = parsedSharedKey.scope || scope;
  let fileKeyRaw = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const sharedKey = await ensureDailySharedChannelKey({
        channelId: resolvedChannelId,
        user,
        scope: resolvedScope,
        keyDate: parsedSharedKey.keyDate,
      });
      fileKeyRaw = await unwrapFileKeyWithSharedKey(sharedKey.rawKey, attachmentEncryption);
      break;
    } catch (error) {
      if (attempt === 0) {
        await clearPersistedSharedKey(attachmentEncryption.sharedKeyId);
        continue;
      }

      throw error;
    }
  }

  const metadataBytes = await decryptWithAesGcm(fileKeyRaw, attachmentEncryption.metadataIv, attachmentEncryption.metadataCiphertext);
  const metadata = JSON.parse(textDecoder.decode(metadataBytes));
  const encryptedFileBytes = await readRemoteAttachmentCipherBytes(attachmentUrl);
  const fileKey = await importAesKey(fileKeyRaw, ["decrypt"]);
  const decryptedFileBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(attachmentEncryption.fileIv) },
    fileKey,
    encryptedFileBytes
  );
  const contentType = String(metadata?.contentType || "application/octet-stream");
  const blob = new Blob([decryptedFileBytes], { type: contentType });

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    name: String(metadata?.name || "file"),
    contentType,
    size: Number(metadata?.size || blob.size || 0),
    lastModified: Number(metadata?.lastModified || 0),
  };
}
