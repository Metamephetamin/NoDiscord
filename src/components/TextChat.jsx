import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/TextChat.css";
import { API_URL } from "../config/runtime";
import {
  decryptIncomingAttachment,
  decryptIncomingMessageText,
  ensureE2eeDeviceIdentity,
  prepareOutgoingAttachmentEncryption,
  prepareOutgoingTextEncryption,
} from "../e2ee/chatEncryption";
import { authFetch, getStoredToken } from "../utils/auth";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MESSAGE_SEND_COOLDOWN_MS = 1500;
const COMPAT_FORWARD_DELAY_MS = 1600;
const MESSAGE_REACTION_OPTIONS = [
  { key: "star", glyph: "\u2B50", label: "\u0417\u0432\u0435\u0437\u0434\u0430" },
  { key: "note", glyph: "\u270D\uFE0F", label: "\u0417\u0430\u043C\u0435\u0442\u043A\u0430" },
  { key: "idea", glyph: "\uD83D\uDCA1", label: "\u0418\u0434\u0435\u044F" },
  { key: "date", glyph: "\uD83D\uDCC5", label: "\u041F\u043B\u0430\u043D" },
  { key: "fire", glyph: "\uD83D\uDD25", label: "\u041E\u0433\u043E\u043D\u044C" },
  { key: "zap", glyph: "\u26A1", label: "\u0418\u043C\u043F\u0443\u043B\u044C\u0441" },
  { key: "party", glyph: "\uD83C\uDF89", label: "\u041F\u0440\u0430\u0437\u0434\u043D\u0438\u043A" },
  { key: "heart", glyph: "\u2764\uFE0F", label: "\u0421\u0435\u0440\u0434\u0446\u0435" },
  { key: "eyes", glyph: "\uD83D\uDC40", label: "\u0421\u043C\u043E\u0442\u0440\u044E" },
  { key: "laugh", glyph: "\uD83D\uDE02", label: "\u0421\u043C\u0435\u0448\u043D\u043E" },
  { key: "wow", glyph: "\uD83D\uDE2E", label: "\u0423\u0434\u0438\u0432\u043B\u0435\u043D\u0438\u0435" },
  { key: "cool", glyph: "\uD83D\uDE0E", label: "\u041A\u0440\u0443\u0442\u043E" },
  { key: "rocket", glyph: "\uD83D\uDE80", label: "\u0420\u0430\u043A\u0435\u0442\u0430" },
  { key: "check", glyph: "\u2705", label: "\u0413\u043E\u0442\u043E\u0432\u043E" },
  { key: "chat", glyph: "\uD83D\uDCAC", label: "\u041E\u0431\u0441\u0443\u0434\u0438\u0442\u044C" },
  { key: "music", glyph: "\uD83C\uDFA7", label: "\u0412\u0430\u0439\u0431" },
];

const getUserName = (user) => user?.firstName || user?.first_name || user?.name || "User";
const getScopedChatChannelId = (serverId, channelId) =>
  serverId && channelId ? `server:${serverId}::channel:${channelId}` : "";
const isDirectMessageChannelId = (channelId) => String(channelId || "").startsWith("dm:");

function formatFileSize(size) {
  if (!size) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function isImageAttachment(messageItem) {
  return Boolean(messageItem?.attachmentContentType?.startsWith("image/"));
}

function isVideoAttachment(messageItem) {
  return Boolean(messageItem?.attachmentContentType?.startsWith("video/"));
}

function getAttachmentKind(messageItem) {
  if (isImageAttachment(messageItem)) {
    return "image";
  }

  if (isVideoAttachment(messageItem)) {
    return "video";
  }

  if (messageItem?.attachmentUrl) {
    return "file";
  }

  return "";
}

function getDownloadLabel(kind) {
  if (kind === "image") {
    return "Скачать фото";
  }

  if (kind === "video") {
    return "Скачать видео";
  }

  return "Скачать файл";
}

function getExtensionFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (!normalized) {
    return "";
  }

  const extensionMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "application/pdf": ".pdf",
  };

  return extensionMap[normalized] || "";
}

function sanitizeDownloadFileName(name) {
  const normalized = Array.from(String(name || "").trim())
    .map((character) => {
      const code = character.charCodeAt(0);
      return '<>:"/\\|?*'.includes(character) || code < 32 ? "_" : character;
    })
    .join("");
  return normalized;
}

function buildDownloadFileName({ type, url, name, contentType }) {
  const normalizedName = sanitizeDownloadFileName(name);
  if (normalizedName) {
    return normalizedName;
  }

  try {
    const parsed = new URL(String(url || ""), window.location.href);
    const candidate = sanitizeDownloadFileName(decodeURIComponent(parsed.pathname.split("/").pop() || ""));
    if (candidate) {
      return candidate;
    }
  } catch {
    // ignore malformed URLs
  }

  const fallbackBaseName =
    type === "image"
      ? "photo"
      : type === "video"
        ? "video"
        : "file";

  return `${fallbackBaseName}${getExtensionFromContentType(contentType)}`;
}

function shouldUseAuthenticatedDownload(url) {
  try {
    const parsed = new URL(String(url || ""), window.location.href);
    const apiOrigin = new URL(API_URL).origin;
    return parsed.origin === apiOrigin;
  } catch {
    return false;
  }
}

async function saveBlobWithBrowser(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

const MAX_PINNED_MESSAGES = 8;
const MAX_FORWARD_BATCH_SIZE = 30;

function getPinnedStorageKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  return normalizedUserId && normalizedChannelId ? `nd:pinned:${normalizedUserId}:${normalizedChannelId}` : "";
}

function readPinnedMessages(storageKey) {
  if (!storageKey) {
    return [];
  }

  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePinnedMessages(storageKey, pinnedMessages) {
  if (!storageKey) {
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.isArray(pinnedMessages) ? pinnedMessages : []));
  } catch {
    // ignore storage failures
  }
}

function getMessagePreview(messageItem) {
  const text = String(messageItem?.message || "").trim();
  if (text) {
    return text;
  }

  const kind = getAttachmentKind(messageItem);
  if (kind === "image") {
    return "Изображение";
  }

  if (kind === "video") {
    return "Видео";
  }

  return String(messageItem?.attachmentName || "Файл").trim() || "Вложение";
}

function createPinnedSnapshot(messageItem) {
  return {
    id: messageItem.id,
    username: String(messageItem.username || "User"),
    preview: getMessagePreview(messageItem),
    timestamp: messageItem.timestamp,
  };
}

function getTargetDisplayName(target) {
  const displayName = String(target?.name || "").trim();
  if (displayName) {
    return displayName;
  }

  const firstName = String(target?.firstName || target?.first_name || "").trim();
  const lastName = String(target?.lastName || target?.last_name || "").trim();
  return `${firstName} ${lastName}`.trim() || String(target?.email || "Без имени");
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDayLabel(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) {
    return "Сегодня";
  }

  if (isYesterday) {
    return "Вчера";
  }

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: now.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  if (isToday) {
    return `Сегодня в ${hours}:${minutes}`;
  }

  if (isYesterday) {
    return `Вчера в ${hours}:${minutes}`;
  }

  return `${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()} в ${hours}:${minutes}`;
}

function getChatErrorMessage(error, fallbackMessage) {
  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) {
    return fallbackMessage;
  }

  if (rawMessage.includes("Method does not exist")) {
    return "Backend ещё не поддерживает новую возможность. Перезапустите сервер и повторите действие.";
  }

  if (rawMessage.includes("Forbidden")) {
    return "Нет доступа к этому чату.";
  }

  if (rawMessage.includes("Unauthorized")) {
    return "Сессия недействительна. Войдите снова.";
  }

  return rawMessage;
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function revokeAttachmentObjectUrl(entry) {
  if (entry?.objectUrl) {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // ignore object URL cleanup failures
    }
  }
}

function isMissingHubMethodError(error, methodName) {
  const rawMessage = String(error?.message || error?.toString?.() || "");
  if (!rawMessage) {
    return false;
  }

  return rawMessage.includes("Method does not exist")
    || rawMessage.includes(`'${methodName}'`)
    || rawMessage.includes(`"${methodName}"`);
}

function normalizeReactions(reactions) {
  return Array.isArray(reactions)
    ? reactions
      .map((reaction) => ({
        key: String(reaction?.key || ""),
        glyph: String(reaction?.glyph || ""),
        count: Number(reaction?.count || 0),
        reactorUserIds: Array.isArray(reaction?.reactorUserIds)
          ? reaction.reactorUserIds.map((item) => String(item || "")).filter(Boolean)
          : [],
        users: Array.isArray(reaction?.users)
          ? reaction.users
            .map((user) => ({
              userId: String(user?.userId || ""),
              displayName: String(user?.displayName || user?.userId || "User"),
              avatarUrl: String(user?.avatarUrl || user?.avatar_url || ""),
            }))
            .filter((user) => user.userId)
          : [],
      }))
      .filter((reaction) => reaction.key && reaction.glyph && reaction.count > 0)
    : [];
}

export default function TextChat({ serverId, channelId, user, resolvedChannelId = "", searchQuery = "", directTargets = [] }) {
  const [message, setMessage] = useState("");
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [floatingDateLabel, setFloatingDateLabel] = useState("");
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [decryptedAttachmentsByMessageId, setDecryptedAttachmentsByMessageId] = useState({});
  const [forwardModal, setForwardModal] = useState({
    open: false,
    messageIds: [],
    targetIds: [],
    query: "",
    submitting: false,
  });
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const textareaRef = useRef(null);
  const contextMenuRef = useRef(null);
  const mediaPreviewVideoRef = useRef(null);
  const joinedChannelRef = useRef("");
  const messageRefs = useRef(new Map());
  const lastSendAtRef = useRef(0);
  const previousChannelIdRef = useRef("");
  const forceScrollToBottomRef = useRef(false);
  const pendingInitialScrollChannelRef = useRef("");
  const decryptingAttachmentIdsRef = useRef(new Set());
  const decryptedAttachmentsRef = useRef({});
  const scopedChannelId = resolvedChannelId || getScopedChatChannelId(serverId, channelId);
  const currentUserId = String(user?.id || "");
  const isDirectChat = isDirectMessageChannelId(scopedChannelId);
  const messages = messagesByChannel[scopedChannelId] || [];
  const pinnedStorageKey = useMemo(() => getPinnedStorageKey(currentUserId, scopedChannelId), [currentUserId, scopedChannelId]);
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds.map((id) => String(id))), [selectedMessageIds]);
  const pinnedMessageIdSet = useMemo(() => new Set(pinnedMessages.map((item) => String(item.id))), [pinnedMessages]);
  const normalizedForwardQuery = forwardModal.query.trim().toLowerCase();
  const availableForwardTargets = useMemo(() => {
    if (!normalizedForwardQuery) {
      return directTargets;
    }

    return directTargets.filter((target) => {
      const displayName = getTargetDisplayName(target).toLowerCase();
      const email = String(target?.email || "").toLowerCase();
      return displayName.includes(normalizedForwardQuery) || email.includes(normalizedForwardQuery);
    });
  }, [directTargets, normalizedForwardQuery]);
  const forwardableMessages = useMemo(() => {
    const messageIds = new Set((forwardModal.messageIds || []).map((id) => String(id)));
    return messages
      .filter((messageItem) => messageIds.has(String(messageItem.id)))
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  }, [forwardModal.messageIds, messages]);

  const normalizeIncomingMessage = async (messageItem) => {
    const decrypted = await decryptIncomingMessageText(messageItem, user, { channelId: scopedChannelId });
    return {
      ...messageItem,
      message: decrypted.text,
      encryption: messageItem?.encryption || messageItem?.Encryption || null,
      attachmentEncryption: messageItem?.attachmentEncryption || messageItem?.AttachmentEncryption || null,
      encryptionState: decrypted.encryptionState,
      reactions: normalizeReactions(messageItem?.reactions),
    };
  };

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    ensureE2eeDeviceIdentity(user).catch((error) => {
      console.warn("Failed to initialize local E2EE identity:", error);
    });

    return undefined;
  }, [user?.id]);

  useEffect(() => {
    decryptedAttachmentsRef.current = decryptedAttachmentsByMessageId;
  }, [decryptedAttachmentsByMessageId]);

  useEffect(() => {
    setDecryptedAttachmentsByMessageId((previous) => {
      Object.values(previous || {}).forEach(revokeAttachmentObjectUrl);
      return {};
    });
    decryptingAttachmentIdsRef.current.clear();
  }, [scopedChannelId]);

  useEffect(() => () => {
    Object.values(decryptedAttachmentsRef.current || {}).forEach(revokeAttachmentObjectUrl);
  }, []);

  useEffect(() => {
    if (!messages.length || !user?.id) {
      return undefined;
    }

    let cancelled = false;
    const encryptedMessages = messages.filter((messageItem) =>
      messageItem?.attachmentEncryption && String(messageItem?.attachmentUrl || "").trim());

    encryptedMessages.forEach((messageItem) => {
      const normalizedMessageId = String(messageItem.id || "");
      if (!normalizedMessageId
        || decryptedAttachmentsByMessageId[normalizedMessageId]
        || decryptingAttachmentIdsRef.current.has(normalizedMessageId)) {
        return;
      }

      decryptingAttachmentIdsRef.current.add(normalizedMessageId);

      void (async () => {
        try {
          const decryptedAttachment = await decryptIncomingAttachment(messageItem, user, { channelId: scopedChannelId });
          if (cancelled || !decryptedAttachment) {
            if (decryptedAttachment?.objectUrl) {
              revokeAttachmentObjectUrl(decryptedAttachment);
            }
            return;
          }

          setDecryptedAttachmentsByMessageId((previous) => {
            const existingEntry = previous[normalizedMessageId];
            if (existingEntry) {
              revokeAttachmentObjectUrl(existingEntry);
            }

            return {
              ...previous,
              [normalizedMessageId]: decryptedAttachment,
            };
          });
        } catch (error) {
          console.warn("Failed to decrypt attachment:", error?.message || error);
        } finally {
          decryptingAttachmentIdsRef.current.delete(normalizedMessageId);
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [decryptedAttachmentsByMessageId, messages, scopedChannelId, user]);

  useEffect(() => {
    const updateFloatingDate = () => {
      const list = messagesListRef.current;
      if (!list || messages.length === 0) {
        setFloatingDateLabel("");
        return;
      }

      const scrollTop = list.scrollTop;
      const probeLine = scrollTop + 24;
      let nextVisibleMessage = messages[0];

      for (const messageItem of messages) {
        const node = messageRefs.current.get(messageItem.id);
        if (!node) {
          continue;
        }

        const nodeBottom = node.offsetTop + node.offsetHeight;
        if (nodeBottom >= probeLine) {
          nextVisibleMessage = messageItem;
          break;
        }
      }

      const nextLabel = nextVisibleMessage?.timestamp ? formatDayLabel(nextVisibleMessage.timestamp) : "";
      setFloatingDateLabel((current) => (current === nextLabel ? current : nextLabel));
    };

    updateFloatingDate();
    const list = messagesListRef.current;
    if (!list) {
      return undefined;
    }

    list.addEventListener("scroll", updateFloatingDate, { passive: true });
    window.addEventListener("resize", updateFloatingDate);

    return () => {
      list.removeEventListener("scroll", updateFloatingDate);
      window.removeEventListener("resize", updateFloatingDate);
    };
  }, [messages, scopedChannelId]);

  useLayoutEffect(() => {
    const list = messagesListRef.current;
    const end = messagesEndRef.current;
    if (!list || !end) {
      previousChannelIdRef.current = scopedChannelId;
      return;
    }

    const channelChanged = previousChannelIdRef.current !== scopedChannelId;
    previousChannelIdRef.current = scopedChannelId;

    if (channelChanged) {
      forceScrollToBottomRef.current = false;
      pendingInitialScrollChannelRef.current = scopedChannelId;
      list.scrollTop = list.scrollHeight;
      return;
    }

    if (pendingInitialScrollChannelRef.current === scopedChannelId) {
      if (messages.length === 0) {
        return;
      }

      pendingInitialScrollChannelRef.current = "";
      list.scrollTop = list.scrollHeight;
      return;
    }

    if (forceScrollToBottomRef.current) {
      forceScrollToBottomRef.current = false;
      end.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const shouldStickToBottom = distanceFromBottom < 96;
    if (!shouldStickToBottom) {
      return;
    }

    end.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, scopedChannelId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const minHeight = 48;
    const maxHeight = 140;

    textarea.style.height = `${minHeight}px`;
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  useEffect(() => {
    if (!mediaPreview) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMediaPreview(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mediaPreview]);

  useEffect(() => {
    if (!forwardModal.open) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeForwardModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [forwardModal.open]);

  useEffect(() => {
    if (!messageContextMenu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (contextMenuRef.current?.contains(event.target)) {
        return;
      }

      setMessageContextMenu(null);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMessageContextMenu(null);
      }
    };

    const handleViewportChange = () => {
      setMessageContextMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [messageContextMenu]);

  useEffect(() => {
    setPinnedMessages(readPinnedMessages(pinnedStorageKey));
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setForwardModal({
      open: false,
      messageIds: [],
      targetIds: [],
      query: "",
      submitting: false,
    });
  }, [pinnedStorageKey]);

  useEffect(() => {
    writePinnedMessages(pinnedStorageKey, pinnedMessages);
  }, [pinnedMessages, pinnedStorageKey]);

  const ensureChannelJoined = async () => {
    const connection = await startChatConnection();
    if (!connection) {
      throw new Error("Сессия недействительна. Войдите снова.");
    }

    if (joinedChannelRef.current === scopedChannelId) {
      return;
    }

    const initialMessages = await chatConnection.invoke("JoinChannel", scopedChannelId);
    const normalizedInitialMessages = Array.isArray(initialMessages)
      ? await Promise.all(initialMessages.map((messageItem) => normalizeIncomingMessage(messageItem)))
      : [];
    joinedChannelRef.current = scopedChannelId;
    setIsChannelReady(true);
    setMessagesByChannel((previous) => ({
      ...previous,
      [scopedChannelId]: normalizedInitialMessages,
    }));

    if (isDirectChat) {
      chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
    }
  };

  useEffect(() => {
    if (!scopedChannelId) {
      setIsChannelReady(false);
      joinedChannelRef.current = "";
      return undefined;
    }

    let isMounted = true;

    const handleReceiveMessage = (nextMessage) => {
      if (String(nextMessage?.channelId || scopedChannelId) !== String(scopedChannelId)) {
        return;
      }

      void (async () => {
        const normalizedMessage = await normalizeIncomingMessage(nextMessage);

        setMessagesByChannel((previous) => {
          const channelMessages = previous[scopedChannelId] || [];
          return { ...previous, [scopedChannelId]: [...channelMessages, normalizedMessage] };
        });

        if (isDirectChat && String(nextMessage?.authorUserId || "") !== String(currentUserId)) {
          chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
        }
      })();
    };

    const handleMessageDeleted = (deletedId) => {
      setMessageContextMenu((current) => (String(current?.messageId || "") === String(deletedId) ? null : current));
      setPinnedMessages((previous) => previous.filter((item) => String(item.id) !== String(deletedId)));
      setSelectedMessageIds((previous) => previous.filter((itemId) => String(itemId) !== String(deletedId)));
      setForwardModal((previous) =>
        previous.open
          ? {
              ...previous,
              messageIds: previous.messageIds.filter((itemId) => String(itemId) !== String(deletedId)),
            }
          : previous
      );
      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.filter((item) => item.id !== deletedId),
        };
      });
    };

    const handleMessagesRead = (payload) => {
      if (String(payload?.channelId || "") !== String(scopedChannelId)) {
        return;
      }

      const readMessageIds = new Set((payload?.messageIds || []).map((messageId) => String(messageId)));
      if (readMessageIds.size === 0) {
        return;
      }

      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.map((messageItem) =>
            readMessageIds.has(String(messageItem.id))
              ? {
                  ...messageItem,
                  isRead: true,
                  readAt: payload?.readAt || messageItem.readAt || null,
                  readByUserId: payload?.readerUserId || messageItem.readByUserId || null,
                }
              : messageItem
          ),
        };
      });
    };

    const handleMessageReactionsUpdated = (payload) => {
      const messageId = String(payload?.messageId || "");
      if (!messageId) {
        return;
      }

      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.map((messageItem) =>
            String(messageItem.id) === messageId
              ? {
                  ...messageItem,
                  reactions: normalizeReactions(payload?.reactions),
                }
              : messageItem
          ),
        };
      });
    };

    const init = async () => {
      try {
        setErrorMessage("");
        setIsChannelReady(false);

        chatConnection.off("ReceiveMessage", handleReceiveMessage);
        chatConnection.off("MessageDeleted", handleMessageDeleted);
        chatConnection.off("MessagesRead", handleMessagesRead);
        chatConnection.off("MessageReactionsUpdated", handleMessageReactionsUpdated);
        chatConnection.on("ReceiveMessage", handleReceiveMessage);
        chatConnection.on("MessageDeleted", handleMessageDeleted);
        chatConnection.on("MessagesRead", handleMessagesRead);
        chatConnection.on("MessageReactionsUpdated", handleMessageReactionsUpdated);

        await ensureChannelJoined();
      } catch (error) {
        console.error("SignalR chat init error:", error);
        if (!isMounted) {
          return;
        }

        joinedChannelRef.current = "";
        setIsChannelReady(false);
        setMessagesByChannel((previous) => ({ ...previous, [scopedChannelId]: previous[scopedChannelId] || [] }));
        setErrorMessage(getChatErrorMessage(error, "Не удалось подключить чат."));
      }
    };

    init();

    return () => {
      isMounted = false;

      if (joinedChannelRef.current === scopedChannelId) {
        chatConnection.invoke("LeaveChannel", scopedChannelId).catch(() => {});
        joinedChannelRef.current = "";
      }

      chatConnection.off("ReceiveMessage", handleReceiveMessage);
      chatConnection.off("MessageDeleted", handleMessageDeleted);
      chatConnection.off("MessagesRead", handleMessagesRead);
      chatConnection.off("MessageReactionsUpdated", handleMessageReactionsUpdated);
    };
  }, [currentUserId, isDirectChat, scopedChannelId]);

  useEffect(() => {
    const handleProfileUpdated = (payload) => {
      const updatedUserId = String(payload?.userId || "");
      if (!updatedUserId) {
        return;
      }

      const nextFirstName = String(payload?.first_name || payload?.firstName || "").trim();
      const nextLastName = String(payload?.last_name || payload?.lastName || "").trim();
      const nextAvatar = String(payload?.avatar_url || payload?.avatarUrl || payload?.avatar || "").trim();
      const nextUsername = `${nextFirstName} ${nextLastName}`.trim();

      setMessagesByChannel((previous) =>
        Object.fromEntries(
          Object.entries(previous || {}).map(([channelKey, channelMessages]) => [
            channelKey,
            Array.isArray(channelMessages)
              ? channelMessages.map((messageItem) =>
                  String(messageItem?.authorUserId || "") === updatedUserId
                    ? {
                        ...messageItem,
                        username: nextUsername || messageItem.username || "User",
                        photoUrl: nextAvatar || messageItem.photoUrl || DEFAULT_AVATAR,
                      }
                    : messageItem
                )
              : channelMessages,
          ])
        )
      );
    };

    chatConnection.on("ProfileUpdated", handleProfileUpdated);

    return () => {
      chatConnection.off("ProfileUpdated", handleProfileUpdated);
    };
  }, []);

  const uploadAttachment = async ({ blob, fileName = "" }) => {
    const uploadFile = blob instanceof File
      ? blob
      : new File([blob], fileName || "attachment.bin", { type: blob?.type || "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", uploadFile);

    const response = await authFetch(`${API_URL}/api/chat-files/upload`, {
      method: "POST",
      body: formData,
    });

    const rawText = await response.text();
    let data = null;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: rawText };
      }
    }

    if (!response.ok) {
      throw new Error(data?.message || "Не удалось загрузить файл");
    }

    return data;
  };

  const send = async () => {
    const messageText = message.trim();
    const filesToSend = selectedFiles;

    if ((!messageText && !filesToSend.length) || !scopedChannelId || uploadingFile) {
      return;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return;
    }

    const avatar = user?.avatarUrl || user?.avatar || DEFAULT_AVATAR;

    try {
      setErrorMessage("");
      await ensureChannelJoined();

      let attachments = [];
      if (filesToSend.length) {
        setUploadingFile(true);
        for (let index = 0; index < filesToSend.length; index += 1) {
          const fileItem = filesToSend[index];
          const encryptedAttachment = await prepareOutgoingAttachmentEncryption({
            channelId: scopedChannelId,
            user,
            file: fileItem,
          });
          const uploaded = await uploadAttachment({
            blob: encryptedAttachment.uploadBlob,
            fileName: `attachment-${Date.now()}-${index}.bin`,
          });
          attachments.push({
            fileUrl: uploaded?.fileUrl || null,
            fileName: uploaded?.fileName || "attachment.bin",
            size: uploaded?.size || encryptedAttachment.uploadBlob.size || null,
            contentType: uploaded?.contentType || "application/octet-stream",
            attachmentEncryption: encryptedAttachment.attachmentEncryption,
          });
        }
      }

      const payload = attachments.length
        ? attachments.map((attachment, index) => ({
            message: index === 0 ? messageText : "",
            attachmentUrl: attachment.fileUrl || "",
            attachmentName: attachment.fileName || "",
            attachmentSize: attachment.size || null,
            attachmentContentType: attachment.contentType || "",
            attachmentEncryption: attachment.attachmentEncryption || null,
          }))
        : [
            {
              message: messageText,
              attachmentUrl: "",
              attachmentName: "",
              attachmentSize: null,
              attachmentContentType: "",
              attachmentEncryption: null,
            },
          ];

      await sendMessagesCompat(scopedChannelId, avatar, payload);

      forceScrollToBottomRef.current = true;
      lastSendAtRef.current = Date.now();
      setMessage("");
      setSelectedFiles([]);
      setIsChannelReady(true);
    } catch (error) {
      console.error("SendMessage error:", error);
      joinedChannelRef.current = "";
      setIsChannelReady(false);
      setErrorMessage(getChatErrorMessage(error, "Не удалось отправить сообщение."));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    const validFiles = [];
    let hasOversizedFile = false;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        hasOversizedFile = true;
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) {
      setErrorMessage("Размер файла не должен быть больше 100 МБ.");
      return;
    }

    if (hasOversizedFile) {
      setErrorMessage("Некоторые файлы пропущены: размер файла не должен быть больше 100 МБ.");
    } else {
      setErrorMessage("");
    }

    setSelectedFiles((previous) => [...previous, ...validFiles]);
  };

  const buildForwardPayloadForTargetChannel = async (targetChannelId, sourceMessages) => {
    const payload = [];

    for (const messageItem of sourceMessages.slice(0, MAX_FORWARD_BATCH_SIZE)) {
      let attachmentPayload = {
        attachmentUrl: String(messageItem.attachmentUrl || ""),
        attachmentName: String(messageItem.attachmentName || ""),
        attachmentSize: messageItem.attachmentSize || null,
        attachmentContentType: String(messageItem.attachmentContentType || ""),
        attachmentEncryption: messageItem.attachmentEncryption || null,
      };

      if (messageItem.attachmentUrl) {
        let forwardFile = null;

        if (messageItem.attachmentEncryption) {
          const cachedAttachment = decryptedAttachmentsByMessageId[String(messageItem.id)];
          const decryptedAttachment = cachedAttachment || await decryptIncomingAttachment(messageItem, user, { channelId: scopedChannelId });
          if (!decryptedAttachment?.blob) {
            throw new Error("Не удалось подготовить вложение для пересылки.");
          }

          forwardFile = new File([decryptedAttachment.blob], decryptedAttachment.name || "file", {
            type: decryptedAttachment.contentType || "application/octet-stream",
          });

          if (!cachedAttachment && decryptedAttachment?.objectUrl) {
            revokeAttachmentObjectUrl(decryptedAttachment);
          }
        } else {
          const sourceUrl = resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl);
          const response = shouldUseAuthenticatedDownload(sourceUrl)
            ? await authFetch(sourceUrl)
            : await fetch(sourceUrl);
          if (!response.ok) {
            throw new Error("Не удалось загрузить файл для пересылки.");
          }

          const blob = await response.blob();
          forwardFile = new File([blob], messageItem.attachmentName || "file", {
            type: messageItem.attachmentContentType || blob.type || "application/octet-stream",
          });
        }

        const encryptedAttachment = await prepareOutgoingAttachmentEncryption({
          channelId: targetChannelId,
          user,
          file: forwardFile,
        });
        const uploaded = await uploadAttachment({
          blob: encryptedAttachment.uploadBlob,
          fileName: `attachment-forward-${Date.now()}-${messageItem.id}.bin`,
        });

        attachmentPayload = {
          attachmentUrl: uploaded?.fileUrl || "",
          attachmentName: uploaded?.fileName || "attachment.bin",
          attachmentSize: uploaded?.size || encryptedAttachment.uploadBlob.size || null,
          attachmentContentType: uploaded?.contentType || "application/octet-stream",
          attachmentEncryption: encryptedAttachment.attachmentEncryption,
        };
      }

      if (!String(messageItem.message || "").trim() && !attachmentPayload.attachmentUrl) {
        continue;
      }

      payload.push({
        message: String(messageItem.message || ""),
        forwardedFromUserId: String(messageItem.authorUserId || ""),
        forwardedFromUsername: String(messageItem.username || ""),
        ...attachmentPayload,
      });
    }

    return payload;
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (normalizedSearchQuery.length < 2) {
      return [];
    }

    return messages
      .filter((messageItem) => {
        const messageText = String(messageItem.message || "").toLowerCase();
        const attachmentName = String(messageItem.attachmentName || "").toLowerCase();
        return messageText.includes(normalizedSearchQuery) || attachmentName.includes(normalizedSearchQuery);
      })
      .map((messageItem) => ({
        id: messageItem.id,
        username: messageItem.username,
        timestamp: messageItem.timestamp,
        preview: String(messageItem.message || messageItem.attachmentName || "").trim(),
      }));
  }, [messages, normalizedSearchQuery]);

  const scrollToMessage = (messageId) => {
    const element = messageRefs.current.get(messageId);
    if (!element) {
      return;
    }

    setHighlightedMessageId(String(messageId));
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === String(messageId) ? "" : current));
    }, 2200);
  };

  const toggleMessageSelection = (messageId) => {
    const normalizedMessageId = String(messageId);
    setSelectedMessageIds((previous) => {
      const exists = previous.some((itemId) => String(itemId) === normalizedMessageId);
      if (exists) {
        return previous.filter((itemId) => String(itemId) !== normalizedMessageId);
      }

      return [...previous, messageId];
    });
  };

  const openSelectionMode = (messageId) => {
    setSelectionMode(true);
    setSelectedMessageIds((previous) => {
      const normalizedMessageId = String(messageId);
      return previous.some((itemId) => String(itemId) === normalizedMessageId) ? previous : [...previous, messageId];
    });
    setMessageContextMenu(null);
  };

  const clearSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
  };

  const togglePinnedMessage = (messageItem) => {
    if (!messageItem?.id) {
      return;
    }

    const normalizedMessageId = String(messageItem.id);
    setPinnedMessages((previous) => {
      const exists = previous.some((item) => String(item.id) === normalizedMessageId);
      if (exists) {
        return previous.filter((item) => String(item.id) !== normalizedMessageId);
      }

      return [createPinnedSnapshot(messageItem), ...previous].slice(0, MAX_PINNED_MESSAGES);
    });
    setMessageContextMenu(null);
  };

  const openForwardModal = (messageIds) => {
    const normalizedIds = Array.from(new Set((messageIds || []).map((id) => String(id))));
    if (!normalizedIds.length) {
      return;
    }

    setForwardModal({
      open: true,
      messageIds: normalizedIds,
      targetIds: [],
      query: "",
      submitting: false,
    });
    setMessageContextMenu(null);
  };

  const closeForwardModal = () => {
    setForwardModal({
      open: false,
      messageIds: [],
      targetIds: [],
      query: "",
      submitting: false,
    });
  };

  const toggleForwardTarget = (targetId) => {
    const normalizedTargetId = String(targetId);
    setForwardModal((previous) => {
      const exists = previous.targetIds.some((itemId) => String(itemId) === normalizedTargetId);
      return {
        ...previous,
        targetIds: exists
          ? previous.targetIds.filter((itemId) => String(itemId) !== normalizedTargetId)
          : [...previous.targetIds, normalizedTargetId],
      };
    });
  };

  const openMediaPreview = (type, url, name, contentType = "", messageId = "", attachmentEncryption = null, sourceUrl = "") => {
    if (!url) {
      return;
    }

    setMediaPreview({
      type,
      url,
      name: name || (type === "image" ? "Изображение" : "Видео"),
      contentType,
      messageId: String(messageId || ""),
      attachmentEncryption,
      sourceUrl: sourceUrl || url,
    });
  };

  const openMessageContextMenu = (event, messageItem, isOwnMessage) => {
    event.preventDefault();

    const decryptedAttachment = decryptedAttachmentsByMessageId[String(messageItem?.id || "")];
    const resolvedAttachmentContentType = decryptedAttachment?.contentType || messageItem?.attachmentContentType || "";
    const attachmentKind = resolvedAttachmentContentType.startsWith("image/")
      ? "image"
      : resolvedAttachmentContentType.startsWith("video/")
        ? "video"
        : messageItem?.attachmentUrl
          ? "file"
          : "";
    const hasAttachment = Boolean(messageItem?.attachmentUrl);
    const hasText = Boolean(String(messageItem?.message || messageItem?.attachmentName || "").trim());
    const enabledActionCount = 6 + (hasAttachment ? 1 : 0);
    const menuWidth = 248;
    const reactionPanelHeight = 66;
    const menuHeight = reactionPanelHeight + 16 + enabledActionCount * 46;
    const padding = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const nextX = Math.min(event.clientX, viewportWidth - menuWidth - padding);
    const nextY = Math.min(event.clientY, viewportHeight - menuHeight - padding);

    setMessageContextMenu({
      x: Math.max(padding, nextX),
      y: Math.max(padding, nextY),
      messageId: messageItem.id,
      text: String(messageItem.message || decryptedAttachment?.name || messageItem.attachmentName || "").trim(),
      attachmentKind,
      attachmentUrl: decryptedAttachment?.objectUrl || (messageItem?.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : ""),
      attachmentSourceUrl: messageItem?.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : "",
      attachmentName: decryptedAttachment?.name || messageItem?.attachmentName || "",
      attachmentContentType: resolvedAttachmentContentType,
      attachmentEncryption: messageItem?.attachmentEncryption || null,
      hasAttachment,
      hasText,
      isPinned: pinnedMessageIdSet.has(String(messageItem.id)),
      canDelete: Boolean(isOwnMessage),
    });
  };

  const handleCopyMessageText = async () => {
    if (!messageContextMenu?.text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(messageContextMenu.text);
      setErrorMessage("");
    } catch {
      setErrorMessage("Не удалось скопировать текст в буфер обмена.");
    } finally {
      setMessageContextMenu(null);
    }
  };

  const handleDeleteMessage = async () => {
    if (!messageContextMenu?.canDelete || !messageContextMenu?.messageId) {
      return;
    }

    try {
      await chatConnection.invoke("DeleteMessage", messageContextMenu.messageId);
      setErrorMessage("");
    } catch (error) {
      console.error("DeleteMessage error:", error);
      setErrorMessage(getChatErrorMessage(error, "Не удалось удалить сообщение."));
    } finally {
      setMessageContextMenu(null);
    }
  };

  const handleDownloadAttachment = async (attachment = messageContextMenu) => {
    if (!attachment?.attachmentUrl) {
      return;
    }

    try {
      setErrorMessage("");
      const sourceAttachmentUrl = attachment.attachmentSourceUrl || attachment.attachmentUrl;
      let resolvedContentType = attachment.attachmentContentType || "";
      let fileName = buildDownloadFileName({
        type: attachment.attachmentKind,
        url: sourceAttachmentUrl,
        name: attachment.attachmentName,
        contentType: resolvedContentType,
      });
      let fileBytes = null;

      if (attachment?.attachmentEncryption) {
        const cachedAttachment = decryptedAttachmentsByMessageId[String(attachment?.messageId || "")];
        const decryptedAttachment = cachedAttachment || await decryptIncomingAttachment(attachment, user, { channelId: scopedChannelId });
        if (!decryptedAttachment?.blob) {
          throw new Error("Не удалось расшифровать файл.");
        }

        if (!cachedAttachment && decryptedAttachment?.objectUrl) {
          revokeAttachmentObjectUrl(decryptedAttachment);
        }

        resolvedContentType = decryptedAttachment.contentType || resolvedContentType;
        fileName = buildDownloadFileName({
          type: attachment.attachmentKind,
          url: sourceAttachmentUrl,
          name: decryptedAttachment.name || attachment.attachmentName,
          contentType: resolvedContentType,
        });
        fileBytes = new Uint8Array(await decryptedAttachment.blob.arrayBuffer());
      } else {
        const requestUrl = sourceAttachmentUrl;

        if (window?.electronDownloads?.fetchAndSave) {
          const headers = shouldUseAuthenticatedDownload(requestUrl) && getStoredToken()
            ? { Authorization: `Bearer ${getStoredToken()}` }
            : {};
          const result = await window.electronDownloads.fetchAndSave({
            url: requestUrl,
            defaultFileName: fileName,
            headers,
          });

          if (!result?.canceled) {
            setMessageContextMenu(null);
          }
          return;
        }

        const response = shouldUseAuthenticatedDownload(requestUrl)
          ? await authFetch(requestUrl)
          : await fetch(requestUrl);

        if (!response.ok) {
          throw new Error("Не удалось загрузить файл для скачивания.");
        }

        resolvedContentType = response.headers.get("content-type") || attachment.attachmentContentType || "";
        fileName = buildDownloadFileName({
          type: attachment.attachmentKind,
          url: requestUrl,
          name: attachment.attachmentName,
          contentType: resolvedContentType,
        });
        fileBytes = new Uint8Array(await response.arrayBuffer());
      }

      if (window?.electronDownloads?.saveFile) {
        const result = await window.electronDownloads.saveFile({
          defaultFileName: fileName,
          bytes: Array.from(fileBytes),
        });

        if (!result?.canceled) {
          setMessageContextMenu(null);
        }
        return;
      }

      await saveBlobWithBrowser(new Blob([fileBytes], { type: resolvedContentType || "application/octet-stream" }), fileName);
      setMessageContextMenu(null);
    } catch (error) {
      console.error("Download attachment error:", error);
      setErrorMessage(error?.message || "Не удалось скачать файл.");
      setMessageContextMenu(null);
    }
  };

  const handleToggleReaction = async (messageId, reactionOption) => {
    if (!messageId || !reactionOption?.key || !reactionOption?.glyph) {
      return;
    }

    try {
      setErrorMessage("");
      await chatConnection.invoke("ToggleReaction", messageId, reactionOption.key, reactionOption.glyph);
      setMessageContextMenu(null);
    } catch (error) {
      console.error("ToggleReaction error:", error);
      setErrorMessage(getChatErrorMessage(error, "Не удалось поставить реакцию."));
    }
  };

  const handleOpenMediaPreviewFullscreen = async () => {
    const mediaElement = mediaPreviewVideoRef.current;
    const requestFullscreen =
      mediaElement?.requestFullscreen
      || mediaElement?.webkitRequestFullscreen
      || mediaElement?.mozRequestFullScreen
      || mediaElement?.msRequestFullscreen;

    if (!requestFullscreen) {
      return;
    }

    try {
      await requestFullscreen.call(mediaElement);
    } catch (error) {
      console.error("Fullscreen preview error:", error);
    }
  };

  const sendMessagesCompat = async (targetChannelId, avatar, payload, { allowBatch = true } = {}) => {
    const normalizedPayload = Array.isArray(payload)
      ? payload.filter((item) => String(item?.message || "").trim() || String(item?.attachmentUrl || "").trim())
      : [];

    if (!normalizedPayload.length) {
      throw new Error("Нет данных для отправки.");
    }

    const containsTextPayload = normalizedPayload.some((item) => String(item?.message || "").trim());

    if (allowBatch && normalizedPayload.length > 1 && !containsTextPayload) {
      try {
        await chatConnection.invoke("ForwardMessages", targetChannelId, avatar, normalizedPayload);
        return;
      } catch (error) {
        if (!isMissingHubMethodError(error, "ForwardMessages")) {
          throw error;
        }
      }
    }

    for (let index = 0; index < normalizedPayload.length; index += 1) {
      const item = normalizedPayload[index];
      const preparedTextPayload = await prepareOutgoingTextEncryption({
        channelId: targetChannelId,
        user,
        text: String(item.message || ""),
      });

      if (preparedTextPayload.reason) {
        console.warn("E2EE fallback:", preparedTextPayload.reason);
      }

      await chatConnection.invoke(
        "SendMessage",
        targetChannelId,
        getUserName(user),
        preparedTextPayload.message,
        avatar,
        item.attachmentUrl || null,
        item.attachmentName || null,
        item.attachmentSize || null,
        item.attachmentContentType || null,
        preparedTextPayload.encryption || null,
        item.attachmentEncryption || null
      );

      if (index < normalizedPayload.length - 1) {
        await sleep(COMPAT_FORWARD_DELAY_MS);
      }
    }
  };

  const handleForwardSubmit = async () => {
    if (!forwardModal.targetIds.length) {
      setErrorMessage("Выберите хотя бы один чат получателя.");
      return;
    }

    if (!forwardableMessages.length) {
      setErrorMessage("Не удалось найти сообщения для пересылки.");
      return;
    }

    try {
      setErrorMessage("");
      setForwardModal((previous) => ({ ...previous, submitting: true }));

      const connection = await startChatConnection();
      if (!connection) {
        throw new Error("Сессия недействительна. Войдите снова.");
      }

      const avatar = user?.avatarUrl || user?.avatar || DEFAULT_AVATAR;

      const targetChannels = directTargets
        .filter((target) => forwardModal.targetIds.some((targetId) => String(target.id) === String(targetId)))
        .map((target) => ({
          id: String(target.id),
          channelId: String(target.directChannelId || ""),
        }))
        .filter((target) => target.channelId);

      if (!targetChannels.length) {
        throw new Error("Не удалось определить чаты получателей.");
      }

      for (const target of targetChannels) {
        const payload = await buildForwardPayloadForTargetChannel(target.channelId, forwardableMessages);
        if (!payload.length) {
          throw new Error("Нет данных для пересылки.");
        }

        await sendMessagesCompat(target.channelId, avatar, payload, { allowBatch: false });
      }

      if (selectionMode) {
        clearSelectionMode();
      }

      closeForwardModal();
    } catch (error) {
      console.error("Forward messages error:", error);
      setErrorMessage(getChatErrorMessage(error, "Не удалось переслать сообщения."));
      setForwardModal((previous) => ({ ...previous, submitting: false }));
    }
  };

  const contextMenuActions = [
    { id: "reply", label: "Ответить", icon: "?", disabled: true, hidden: false, onClick: () => {} },
    {
      id: "pin",
      label: messageContextMenu?.isPinned ? "Открепить" : "Закрепить",
      icon: "📌",
      disabled: false,
      hidden: false,
      onClick: () => {
        const messageItem = messages.find((item) => String(item.id) === String(messageContextMenu?.messageId));
        if (messageItem) {
          togglePinnedMessage(messageItem);
        }
      },
    },
    {
      id: "download",
      label: getDownloadLabel(messageContextMenu?.attachmentKind),
      icon: "v",
      disabled: !messageContextMenu?.hasAttachment,
      hidden: !messageContextMenu?.hasAttachment,
      onClick: () => handleDownloadAttachment(),
    },
    { id: "copy", label: "Копировать текст", icon: "?", disabled: !messageContextMenu?.hasText, hidden: false, onClick: handleCopyMessageText },
    { id: "forward", label: "Переслать", icon: "?", disabled: !directTargets.length, hidden: false, onClick: () => openForwardModal([messageContextMenu?.messageId]) },
    { id: "delete", label: "Удалить", icon: "🗑", disabled: !messageContextMenu?.canDelete, hidden: false, danger: true, onClick: handleDeleteMessage },
    { id: "select", label: "Выбрать", icon: "?", disabled: false, hidden: false, onClick: () => openSelectionMode(messageContextMenu?.messageId) },
  ].filter((action) => !action.hidden);

  return (
    <div className="textchat-container">
      {normalizedSearchQuery.length >= 2 ? (
        <div className="message-search-panel">
          <div className="message-search-panel__header">
            <strong>Найденные сообщения</strong>
            <span>{searchResults.length ? `${searchResults.length} совпадений` : "Совпадений нет"}</span>
          </div>
          {searchResults.length ? (
            <div className="message-search-panel__list">
              {searchResults.slice(0, 8).map((result) => (
                <button key={result.id} type="button" className="message-search-panel__item" onClick={() => scrollToMessage(result.id)}>
                  <strong>{result.username || "User"}</strong>
                  <span>{result.preview || "Сообщение без текста"}</span>
                  <small>{formatTimestamp(result.timestamp)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="message-search-panel__empty">В текущем чате ничего не найдено.</div>
          )}
        </div>
      ) : null}

      {pinnedMessages.length ? (
        <div className="chat-pins">
          <div className="chat-pins__header">
            <strong>Закреплённые сообщения</strong>
            <span>{pinnedMessages.length}</span>
          </div>
          <div className="chat-pins__list">
            {pinnedMessages.map((pinnedMessage) => (
              <div
                key={pinnedMessage.id}
                className="chat-pins__item"
              >
                <button type="button" className="chat-pins__link" onClick={() => scrollToMessage(pinnedMessage.id)}>
                  <span className="chat-pins__meta">
                    <strong>{pinnedMessage.username}</strong>
                    <small>{formatTimestamp(pinnedMessage.timestamp)}</small>
                  </span>
                  <span className="chat-pins__preview">{pinnedMessage.preview}</span>
                </button>
                <button
                  type="button"
                  className="chat-pins__remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPinnedMessages((previous) => previous.filter((item) => String(item.id) !== String(pinnedMessage.id)));
                  }}
                  aria-label="Открепить сообщение"
                >
                  ?
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectionMode ? (
        <div className="chat-selection-bar">
          <div className="chat-selection-bar__copy">
            <strong>{selectedMessageIds.length || 0}</strong>
            <span>Выбрано сообщений</span>
          </div>
          <div className="chat-selection-bar__actions">
            <button
              type="button"
              className="chat-selection-bar__button"
              disabled={!selectedMessageIds.length || !directTargets.length}
              onClick={() => openForwardModal(selectedMessageIds)}
            >
              Переслать
            </button>
            <button type="button" className="chat-selection-bar__button chat-selection-bar__button--ghost" onClick={clearSelectionMode}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      <div className="messages-list-shell">
        {floatingDateLabel ? <div className="messages-floating-date">{floatingDateLabel}</div> : null}

        <div ref={messagesListRef} className="messages-list">
          {messages.map((messageItem) => {
            const attachmentView = decryptedAttachmentsByMessageId[String(messageItem.id)] || null;
            const attachmentUrl = attachmentView?.objectUrl || (
              messageItem.attachmentEncryption
                ? ""
                : messageItem.attachmentUrl
                  ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl)
                  : ""
            );
            const attachmentName = attachmentView?.name || messageItem.attachmentName || "";
            const attachmentContentType = attachmentView?.contentType || messageItem.attachmentContentType || "";
            const attachmentSize = attachmentView?.size || messageItem.attachmentSize || null;
            const isResolvedImageAttachment = String(attachmentContentType).startsWith("image/");
            const isResolvedVideoAttachment = String(attachmentContentType).startsWith("video/");
            const reactions = normalizeReactions(messageItem.reactions);
            const messageText = String(messageItem.message || "");
            const isOwnMessage =
              String(messageItem.authorUserId || "") === currentUserId ||
              (!messageItem.authorUserId && messageItem.username?.toLowerCase() === getUserName(user).toLowerCase());
            const isSelectedMessage = selectedMessageIdSet.has(String(messageItem.id));
            const useInlineFooter = isDirectChat
              && Boolean(messageText.trim())
              && !attachmentUrl
              && !messageItem.attachmentEncryption
              && !reactions.length
              && !messageItem.forwardedFromUsername
              && !messageText.includes("\n")
              && messageText.trim().length <= 14;

            return (
              <div
                key={messageItem.id}
                ref={(node) => {
                  if (node) {
                    messageRefs.current.set(messageItem.id, node);
                  } else {
                    messageRefs.current.delete(messageItem.id);
                  }
                }}
                className={`message-item ${isDirectChat ? "message-item--dm" : ""} ${isDirectChat && isOwnMessage ? "message-item--dm-own" : ""} ${isDirectChat && !isOwnMessage ? "message-item--dm-incoming" : ""} ${String(messageItem.id) === highlightedMessageId ? "message-item--highlighted" : ""} ${isSelectedMessage ? "message-item--selected" : ""} ${selectionMode ? "message-item--selectable" : ""}`}
                onContextMenu={(event) => openMessageContextMenu(event, messageItem, isOwnMessage)}
                onClick={selectionMode ? () => toggleMessageSelection(messageItem.id) : undefined}
              >
                {selectionMode ? (
                  <button
                    type="button"
                    className={`message-select-toggle ${isSelectedMessage ? "message-select-toggle--active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMessageSelection(messageItem.id);
                    }}
                    aria-label={isSelectedMessage ? "Снять выделение" : "Выбрать сообщение"}
                  >
                    <span className="message-select-toggle__mark" aria-hidden="true" />
                  </button>
                ) : null}
                <img src={resolveMediaUrl(messageItem.photoUrl, DEFAULT_AVATAR)} alt="avatar" className="msg-avatar" />

                <div className={`msg-content ${isDirectChat ? "msg-content--dm" : ""} ${isDirectChat && isOwnMessage ? "msg-content--dm-own" : ""}`}>
                  {!isDirectChat ? (
                    <div className="message-author">
                      <span>{messageItem.username}</span>
                      <span className="message-meta">
                        <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                      </span>
                    </div>
                  ) : null}

                  {messageItem.forwardedFromUsername ? (
                    <div className="message-forwarded">
                      <span className="message-forwarded__label">Переслано от</span>
                      <strong>{messageItem.forwardedFromUsername}</strong>
                    </div>
                  ) : null}

                  {messageText ? (
                    useInlineFooter ? (
                      <div className="message-text-row">
                        <div className="message-text">{messageText}</div>
                        <div className={`message-footer message-footer--inline ${isOwnMessage ? "message-footer--own" : ""}`}>
                          <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                          {isOwnMessage ? (
                            <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                              <span className="message-read-status__check" />
                              <span className="message-read-status__check" />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="message-text">{messageText}</div>
                    )
                  ) : null}

                  {attachmentUrl ? (
                    isResolvedImageAttachment ? (
                      <button
                        type="button"
                        className="message-media message-media--button"
                        onClick={(event) => {
                          if (selectionMode) {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleMessageSelection(messageItem.id);
                            return;
                          }

                          openMediaPreview(
                            "image",
                            attachmentUrl,
                            attachmentName,
                            attachmentContentType,
                            messageItem.id,
                            messageItem.attachmentEncryption,
                            messageItem.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : attachmentUrl
                          );
                        }}
                        aria-label={`Открыть изображение ${attachmentName || ""}`.trim()}
                      >
                        <img className="message-media__image" src={attachmentUrl} alt={attachmentName || "image"} />
                      </button>
                    ) : isResolvedVideoAttachment ? (
                      <button
                        type="button"
                        className="message-media message-media--video message-media--button"
                        onClick={(event) => {
                          if (selectionMode) {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleMessageSelection(messageItem.id);
                            return;
                          }

                          openMediaPreview(
                            "video",
                            attachmentUrl,
                            attachmentName,
                            attachmentContentType,
                            messageItem.id,
                            messageItem.attachmentEncryption,
                            messageItem.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : attachmentUrl
                          );
                        }}
                        aria-label={`Открыть видео ${attachmentName || ""}`.trim()}
                      >
                        <video className="message-media__video" src={attachmentUrl} preload="metadata" playsInline muted />
                        <span className="message-media__play" aria-hidden="true" />
                      </button>
                    ) : (
                      <a
                        className="message-attachment"
                        href={attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => {
                          if (!selectionMode) {
                            return;
                          }

                          event.preventDefault();
                          event.stopPropagation();
                          toggleMessageSelection(messageItem.id);
                        }}
                      >
                        <span className="message-attachment__icon" aria-hidden="true" />
                        <span className="message-attachment__meta">
                          <span className="message-attachment__name">{attachmentName || "Файл"}</span>
                          <span className="message-attachment__size">{formatFileSize(attachmentSize)}</span>
                        </span>
                      </a>
                    )
                  ) : messageItem.attachmentEncryption ? (
                    <div className="message-attachment message-attachment--pending">
                      <span className="message-attachment__icon" aria-hidden="true" />
                      <span className="message-attachment__meta">
                        <span className="message-attachment__name">Зашифрованный файл</span>
                        <span className="message-attachment__size">Расшифровывается автоматически</span>
                      </span>
                    </div>
                  ) : null}

                  {((isDirectChat && !useInlineFooter) || reactions.length) ? (
                    <div className="message-bottom-row">
                      {reactions.length ? (
                        <div className="message-reactions-wrap">
                          <div className="message-reactions">
                            {reactions.map((reaction) => {
                              const reactedByCurrentUser = reaction.reactorUserIds.some((userId) => String(userId) === currentUserId);
                              return (
                                <button
                                  key={`${messageItem.id}-${reaction.key}`}
                                  type="button"
                                  className={`message-reaction ${reactedByCurrentUser ? "message-reaction--active" : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleToggleReaction(messageItem.id, reaction);
                                  }}
                                  aria-label={`${reaction.glyph} ${reaction.count}`}
                                >
                                  <span className="message-reaction__glyph" aria-hidden="true">{reaction.glyph}</span>
                                  <span className="message-reaction__count">{reaction.count}</span>
                                  <span className="message-reaction__avatars" aria-hidden="true">
                                    {reaction.users.slice(0, 2).map((reactor) => (
                                      <img
                                        key={`${reaction.key}-${reactor.userId}`}
                                        className="message-reaction__avatar"
                                        src={resolveMediaUrl(reactor.avatarUrl, DEFAULT_AVATAR)}
                                        alt={reactor.displayName}
                                      />
                                    ))}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                        </div>
                      ) : (
                        <span />
                      )}

                      {isDirectChat && !useInlineFooter ? (
                        <div className={`message-footer ${isOwnMessage ? "message-footer--own" : ""}`}>
                          <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                          {isOwnMessage ? (
                            <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                              <span className="message-read-status__check" />
                              <span className="message-read-status__check" />
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="input-area">
        <div className="input-area__editor">
          {selectedFiles.length ? (
            <div className="chat-file-list">
              {selectedFiles.map((selectedFile, index) => (
                <div key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${index}`} className="chat-file-pill">
                  <span className="chat-file-pill__name">{selectedFile.name}</span>
                  <span className="chat-file-pill__size">{formatFileSize(selectedFile.size)}</span>
                  <button
                    type="button"
                    className="chat-file-pill__remove"
                    onClick={() => setSelectedFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))}
                    disabled={uploadingFile}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="input-area__controls">
            <div className="message-composer">
              <label className="attach-button" aria-label="Прикрепить файл" title="Прикрепить файл">
                <input type="file" className="attach-button__input" onChange={handleFileChange} disabled={uploadingFile} multiple />
                <span className="attach-button__icon" aria-hidden="true" />
              </label>
              <textarea
                ref={textareaRef}
                value={message}
                disabled={uploadingFile}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={uploadingFile ? "Загружаем вложения..." : "Введите сообщение..."}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {!isChannelReady && scopedChannelId ? (
        <div className="chat-error">Чат инициализируется. Если это не пройдёт, попробуйте переподключиться или ещё раз открыть диалог.</div>
      ) : null}
      {errorMessage ? <div className="chat-error">{errorMessage}</div> : null}

      {mediaPreview ? (
        <div className="media-preview" onClick={() => setMediaPreview(null)} role="presentation">
          <div className="media-preview__dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={mediaPreview.name}>
            <div className="media-preview__header">
              <div className="media-preview__meta">
                <strong>{mediaPreview.name}</strong>
                <span>{mediaPreview.type === "image" ? "Изображение" : "Видео"}</span>
              </div>
              <div className="media-preview__actions">
                <button
                  type="button"
                  className="media-preview__action"
                  onClick={() =>
                    handleDownloadAttachment({
                      attachmentKind: mediaPreview.type,
                      attachmentUrl: mediaPreview.url,
                      attachmentSourceUrl: mediaPreview.sourceUrl || mediaPreview.url,
                      attachmentName: mediaPreview.name,
                      attachmentContentType: mediaPreview.contentType || "",
                      attachmentEncryption: mediaPreview.attachmentEncryption || null,
                      messageId: mediaPreview.messageId || "",
                    })
                  }
                >
                  Скачать
                </button>
                {mediaPreview.type === "video" ? (
                  <button type="button" className="media-preview__action" onClick={handleOpenMediaPreviewFullscreen}>
                    На весь экран
                  </button>
                ) : null}
                <button
                  type="button"
                  className="media-preview__close"
                  onClick={() => setMediaPreview(null)}
                  aria-label="Закрыть предпросмотр"
                >
                  <span className="media-preview__close-icon" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="media-preview__content">
              {mediaPreview.type === "image" ? (
                <img className="media-preview__image" src={mediaPreview.url} alt={mediaPreview.name} />
              ) : (
                <video
                  ref={mediaPreviewVideoRef}
                  className="media-preview__video"
                  src={mediaPreview.url}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              )}
            </div>
            <div className="media-preview__caption">{mediaPreview.name}</div>
          </div>
        </div>
      ) : null}

      {messageContextMenu ? (
        <div
          ref={contextMenuRef}
          className="message-context-menu-stack"
          style={{ left: `${messageContextMenu.x}px`, top: `${messageContextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="message-reaction-picker" aria-label="Быстрые реакции">
            {MESSAGE_REACTION_OPTIONS.map((reactionOption) => {
              const contextMessage = messages.find((item) => String(item.id) === String(messageContextMenu.messageId));
              const contextReactions = normalizeReactions(contextMessage?.reactions);
              const isActive = contextReactions.some((reaction) =>
                reaction.key === reactionOption.key
                && reaction.reactorUserIds.some((userId) => String(userId) === currentUserId));

              return (
                <button
                  key={reactionOption.key}
                  type="button"
                  className={`message-reaction-picker__item ${isActive ? "message-reaction-picker__item--active" : ""}`}
                  onClick={() => handleToggleReaction(messageContextMenu.messageId, reactionOption)}
                  aria-label={reactionOption.label}
                  title={reactionOption.label}
                >
                  <span aria-hidden="true">{reactionOption.glyph}</span>
                </button>
              );
            })}
          </div>
          <div className="message-context-menu" role="menu">
            {contextMenuActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`message-context-menu__item ${action.danger ? "message-context-menu__item--danger" : ""}`}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                <span className="message-context-menu__icon" aria-hidden="true">{action.icon}</span>
                <span className="message-context-menu__label">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {forwardModal.open ? (
        <div className="forward-modal__backdrop" onClick={closeForwardModal} role="presentation">
          <div className="forward-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Переслать сообщения">
            <div className="forward-modal__header">
              <div>
                <h3>Переслать сообщения</h3>
                <p>{forwardableMessages.length} {forwardableMessages.length === 1 ? "сообщение" : "сообщения"} можно переслать выбранным друзьям</p>
              </div>
              <button type="button" className="forward-modal__close" onClick={closeForwardModal} aria-label="Закрыть">
                ?
              </button>
            </div>

            <input
              className="forward-modal__search"
              type="text"
              value={forwardModal.query}
              onChange={(event) => setForwardModal((previous) => ({ ...previous, query: event.target.value }))}
              placeholder="Поиск друзей"
            />

            <div className="forward-modal__list">
              {availableForwardTargets.length ? (
                availableForwardTargets.map((target) => {
                  const isSelectedTarget = forwardModal.targetIds.some((targetId) => String(targetId) === String(target.id));
                  return (
                    <button
                      key={target.id}
                      type="button"
                      className={`forward-modal__target ${isSelectedTarget ? "forward-modal__target--active" : ""}`}
                      onClick={() => toggleForwardTarget(target.id)}
                    >
                      <img src={resolveMediaUrl(target.avatar || "", DEFAULT_AVATAR)} alt={getTargetDisplayName(target)} />
                      <span className="forward-modal__target-copy">
                        <strong>{getTargetDisplayName(target)}</strong>
                        <small>{target.email || "Без email"}</small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="forward-modal__empty">Подходящие друзья не найдены.</div>
              )}
            </div>

            <div className="forward-modal__actions">
              <button type="button" className="forward-modal__button forward-modal__button--ghost" onClick={closeForwardModal} disabled={forwardModal.submitting}>
                Отмена
              </button>
              <button type="button" className="forward-modal__button" onClick={handleForwardSubmit} disabled={!forwardModal.targetIds.length || !forwardableMessages.length || forwardModal.submitting}>
                {forwardModal.submitting ? "Отправляем..." : "Переслать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



