import { useEffect, useRef, useState } from "react";
import chatConnection from "../SignalR/ChatConnect";
import {
  authFetch,
  getApiErrorMessage,
  parseApiResponse,
} from "../utils/auth";
import {
  getDisplayName,
  normalizeConversationTarget,
  normalizeFriend,
  normalizeFriendRequest,
  parseFriendSearchInput,
} from "../utils/menuMainModel";

const SKIP_NEXT_WINDOW_FOCUS_REFRESH_FLAG = "__TEND_SKIP_NEXT_WINDOW_FOCUS_REFRESH__";

const sortFriends = (friends) =>
  friends.sort((left, right) =>
    getDisplayName(left).localeCompare(getDisplayName(right), "ru", { sensitivity: "base" })
  );

export default function useFriendsWorkspaceState({
  user,
  apiBaseUrl,
  activeDirectFriendId,
  friendsPageSection,
}) {
  const [friends, setFriends] = useState([]);
  const [friendEmail, setFriendEmail] = useState("");
  const [friendLookupResults, setFriendLookupResults] = useState([]);
  const [friendLookupLoading, setFriendLookupLoading] = useState(false);
  const [friendLookupPerformed, setFriendLookupPerformed] = useState(false);
  const [friendsError, setFriendsError] = useState("");
  const [friendActionStatus, setFriendActionStatus] = useState("");
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState([]);
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(false);
  const [friendRequestsError, setFriendRequestsError] = useState("");
  const [friendRequestActionId, setFriendRequestActionId] = useState(0);
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState("");
  const [conversationActionLoading, setConversationActionLoading] = useState(false);
  const [conversationActionStatus, setConversationActionStatus] = useState("");

  const latestSearchRef = useRef("");

  const loadFriends = async () => {
    try {
      const response = await authFetch(`${apiBaseUrl}/friends`, { method: "GET" });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить список друзей."));
      }

      setFriends(
        Array.isArray(data)
          ? sortFriends(data.map(normalizeFriend).filter((friend) => friend.id))
          : []
      );
      setFriendsError("");
    } catch (error) {
      console.error("Ошибка загрузки друзей:", error);
      setFriendsError(error.message || "Не удалось загрузить список друзей.");
    }
  };

  const searchFriendCandidates = async (query) => {
    const { mode, normalizedQuery } = parseFriendSearchInput(query);
    latestSearchRef.current = query;

    if (!normalizedQuery) {
      setFriendLookupResults([]);
      setFriendLookupPerformed(false);
      return;
    }

    try {
      setFriendLookupLoading(true);
      setFriendsError("");
      setFriendActionStatus("");

      const response = await authFetch(
        `${apiBaseUrl}/friends/search?q=${encodeURIComponent(normalizedQuery)}&mode=${encodeURIComponent(mode)}`,
        { method: "GET" }
      );
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось найти пользователей."));
      }

      setFriendLookupResults(
        Array.isArray(data)
          ? sortFriends(data.map(normalizeFriend).filter((friend) => friend.id))
          : []
      );
      setFriendLookupPerformed(true);
    } catch (error) {
      setFriendLookupResults([]);
      setFriendLookupPerformed(true);
      setFriendsError(error.message || "Не удалось найти пользователей.");
    } finally {
      setFriendLookupLoading(false);
    }
  };

  const loadFriendRequests = async () => {
    try {
      setFriendRequestsLoading(true);
      setFriendRequestsError("");

      const response = await authFetch(`${apiBaseUrl}/friends/requests`, { method: "GET" });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить заявки в друзья."));
      }

      setIncomingFriendRequests(
        Array.isArray(data)
          ? data
              .map(normalizeFriendRequest)
              .filter((request) => request.id && request.sender?.id)
              .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""))
          : []
      );
      setFriendRequestsError("");
    } catch (error) {
      console.error("Ошибка загрузки заявок в друзья:", error);
      setIncomingFriendRequests([]);
      setFriendRequestsError(error.message || "Не удалось загрузить заявки в друзья.");
    } finally {
      setFriendRequestsLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      setConversationsLoading(true);
      setConversationsError("");

      const response = await authFetch(`${apiBaseUrl}/conversations`, { method: "GET" });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить беседы."));
      }

      setConversations(
        Array.isArray(data)
          ? data
              .map(normalizeConversationTarget)
              .filter((conversation) => conversation.conversationId && conversation.directChannelId)
              .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
          : []
      );
    } catch (error) {
      console.error("Ошибка загрузки бесед:", error);
      setConversations([]);
      setConversationsError(error.message || "Не удалось загрузить беседы.");
    } finally {
      setConversationsLoading(false);
    }
  };

  const handleCreateConversation = async ({ title, avatarUrl = "", memberUserIds }) => {
    const normalizedTitle = String(title || "").trim();
    const normalizedMemberIds = Array.isArray(memberUserIds)
      ? memberUserIds.map((item) => Number(item)).filter((item) => item > 0)
      : [];

    if (!normalizedTitle) {
      throw new Error("Введите название беседы.");
    }

    if (!normalizedMemberIds.length) {
      throw new Error("Выберите хотя бы одного друга.");
    }

    try {
      setConversationActionLoading(true);
      setConversationsError("");
      setConversationActionStatus("");

      const response = await authFetch(`${apiBaseUrl}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          avatarUrl: String(avatarUrl || "").trim(),
          memberUserIds: normalizedMemberIds,
        }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось создать беседу."));
      }

      const createdConversation = normalizeConversationTarget(data || {});
      setConversationActionStatus("Беседа создана.");
      await loadConversations();
      return createdConversation;
    } catch (error) {
      setConversationsError(error.message || "Не удалось создать беседу.");
      throw error;
    } finally {
      setConversationActionLoading(false);
    }
  };

  const handleAddConversationMember = async (conversationId, userId) => {
    const normalizedConversationId = Number(conversationId);
    const normalizedUserId = Number(userId);

    if (normalizedConversationId <= 0 || normalizedUserId <= 0) {
      throw new Error("Не удалось определить беседу или пользователя.");
    }

    try {
      setConversationActionLoading(true);
      setConversationsError("");
      setConversationActionStatus("");

      const response = await authFetch(`${apiBaseUrl}/conversations/${normalizedConversationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: normalizedUserId }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось добавить участника в беседу."));
      }

      setConversationActionStatus("Участник добавлен в беседу.");
      await loadConversations();
      return data;
    } catch (error) {
      setConversationsError(error.message || "Не удалось добавить участника в беседу.");
      throw error;
    } finally {
      setConversationActionLoading(false);
    }
  };

  const handleUploadConversationAvatar = async (file) => {
    if (!(file instanceof File)) {
      throw new Error("Выберите изображение для беседы.");
    }

    try {
      setConversationActionLoading(true);
      setConversationsError("");
      setConversationActionStatus("");

      const formData = new FormData();
      formData.append("avatar", file);

      const response = await authFetch(`${apiBaseUrl}/conversations/upload-avatar`, {
        method: "POST",
        body: formData,
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить аватар беседы."));
      }

      return String(data?.avatarUrl || data?.avatar_url || "").trim();
    } catch (error) {
      setConversationsError(error.message || "Не удалось загрузить аватар беседы.");
      throw error;
    } finally {
      setConversationActionLoading(false);
    }
  };

  const rerunFriendSearch = () => {
    const { normalizedQuery } = parseFriendSearchInput(latestSearchRef.current || friendEmail);
    if (friendsPageSection !== "add" || !normalizedQuery) {
      return;
    }

    searchFriendCandidates(latestSearchRef.current || friendEmail).catch(() => {});
  };

  const handleFriendSearchSubmit = async (event) => {
    event.preventDefault();
    const { mode, normalizedQuery } = parseFriendSearchInput(friendEmail);
    if (!normalizedQuery) {
      setFriendsError(mode === "email" ? "Введите email после символа @." : "Введите имя пользователя.");
      return;
    }

    await searchFriendCandidates(friendEmail);
  };

  const handleAddFriend = async (candidate) => {
    const { mode, normalizedQuery } = parseFriendSearchInput(friendEmail);
    if (!candidate && !normalizedQuery) {
      setFriendsError("Сначала найдите пользователя.");
      return;
    }

    if (!candidate && mode !== "email") {
      setFriendsError("Без выбора из списка можно добавить друга только по email через @.");
      return;
    }

    try {
      setIsAddingFriend(true);
      setFriendsError("");
      setFriendActionStatus("");

      const response = await authFetch(`${apiBaseUrl}/friends/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          candidate
            ? { userId: Number(candidate.id), email: candidate.email || "" }
            : { email: mode === "email" ? normalizedQuery : "" }
        ),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось добавить друга."));
      }

      if (data?.status === "auto_accepted" || data?.status === "already_friends") {
        if (data?.friend) {
          const nextFriend = normalizeFriend(data.friend);
          setFriends((previous) => {
            const exists = previous.some((friend) => friend.id === nextFriend.id);
            const nextFriends = exists
              ? previous.map((friend) => (friend.id === nextFriend.id ? nextFriend : friend))
              : [nextFriend, ...previous];

            return sortFriends(nextFriends);
          });
        }

        setFriendActionStatus(
          data?.status === "auto_accepted"
            ? "Встречная заявка уже была. Друг добавлен автоматически."
            : "Этот пользователь уже у вас в друзьях."
        );
        rerunFriendSearch();
        loadFriendRequests().catch(() => {});
        return;
      }

      if (data?.status === "already_requested") {
        setFriendActionStatus("Заявка уже отправлена и ждёт ответа.");
        rerunFriendSearch();
        loadFriendRequests().catch(() => {});
        return;
      }

      setFriendActionStatus("Заявка отправлена.");
      rerunFriendSearch();
      loadFriendRequests().catch(() => {});
    } catch (error) {
      setFriendsError(error.message || "Не удалось добавить друга.");
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleFriendRequestAction = async (requestId, action) => {
    if (!requestId || (action !== "accept" && action !== "decline")) {
      return;
    }

    try {
      setFriendRequestActionId(Number(requestId));
      setFriendRequestsError("");
      setFriendActionStatus("");
      setFriendsError("");

      const response = await authFetch(`${apiBaseUrl}/friends/requests/${requestId}/${action}`, {
        method: "POST",
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, action === "accept" ? "Не удалось принять заявку." : "Не удалось отклонить заявку."));
      }

      if (action === "accept" && data?.friend) {
        const nextFriend = normalizeFriend(data.friend);
        setFriends((previous) => {
          const exists = previous.some((friend) => friend.id === nextFriend.id);
          const nextFriends = exists
            ? previous.map((friend) => (friend.id === nextFriend.id ? nextFriend : friend))
            : [nextFriend, ...previous];

          return sortFriends(nextFriends);
        });
        setFriendActionStatus("Заявка принята.");
      } else {
        setFriendActionStatus("Заявка отклонена.");
      }

      setIncomingFriendRequests((previous) => previous.filter((request) => Number(request.id) !== Number(requestId)));
      rerunFriendSearch();
    } catch (error) {
      setFriendRequestsError(error.message || "Не удалось обработать заявку.");
    } finally {
      setFriendRequestActionId(0);
    }
  };

  const setFriendSearchValue = (value) => {
    setFriendEmail(value);
    latestSearchRef.current = value;
    if (friendsError) {
      setFriendsError("");
    }
    if (friendActionStatus) {
      setFriendActionStatus("");
    }
  };

  const resetFriendsState = () => {
    setFriends([]);
    setIncomingFriendRequests([]);
    setConversations([]);
    setFriendEmail("");
    setFriendLookupResults([]);
    setFriendLookupPerformed(false);
    setFriendsError("");
    setFriendActionStatus("");
    setFriendRequestsError("");
    setConversationsError("");
    setConversationActionStatus("");
  };

  const updateFriendProfile = (updatedUserId, updater) => {
    setFriends((previous) =>
      previous.map((friend) => (String(friend.id) === String(updatedUserId) ? updater(friend) : friend))
    );
    setFriendLookupResults((previous) =>
      previous.map((friend) => (String(friend.id) === String(updatedUserId) ? updater(friend) : friend))
    );
  };

  useEffect(() => {
    if (!user) {
      resetFriendsState();
      return;
    }

    loadFriends().catch(() => {});
    loadFriendRequests().catch(() => {});
    loadConversations().catch(() => {});
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const handleFriendListUpdated = () => {
      loadFriends().catch(() => {});
    };
    const handleFriendRequestsUpdated = () => {
      loadFriendRequests().catch(() => {});
      rerunFriendSearch();
    };
    const handleConversationsUpdated = () => {
      loadConversations().catch(() => {});
    };
    const handleFriendPresenceUpdated = (payload) => {
      const updatedUserId = String(payload?.userId || payload?.user_id || "").trim();
      if (!updatedUserId) {
        loadFriends().catch(() => {});
        return;
      }

      const isOnline = Boolean(payload?.is_online ?? payload?.isOnline);
      const lastSeenAt = String(payload?.last_seen_at || payload?.lastSeenAt || "").trim();
      const presence = isOnline ? "online" : "offline";
      const applyPresence = (friend) => (
        String(friend?.id || "") === updatedUserId
          ? {
            ...friend,
            isOnline,
            presence,
            status: presence,
            lastSeenAt: lastSeenAt || friend.lastSeenAt || "",
          }
          : friend
      );

      setFriends((previous) => previous.map(applyPresence));
      setFriendLookupResults((previous) => previous.map(applyPresence));
      setIncomingFriendRequests((previous) => previous.map((request) => ({
        ...request,
        sender: applyPresence(request.sender),
      })));
    };
    const handleWindowFocus = () => {
      if (typeof window !== "undefined" && window[SKIP_NEXT_WINDOW_FOCUS_REFRESH_FLAG]) {
        window[SKIP_NEXT_WINDOW_FOCUS_REFRESH_FLAG] = false;
        return;
      }

      loadFriends().catch(() => {});
      loadFriendRequests().catch(() => {});
      loadConversations().catch(() => {});
    };

    chatConnection.on("FriendListUpdated", handleFriendListUpdated);
    chatConnection.on("FriendRequestsUpdated", handleFriendRequestsUpdated);
    chatConnection.on("ConversationsUpdated", handleConversationsUpdated);
    chatConnection.on("FriendPresenceUpdated", handleFriendPresenceUpdated);
    window.addEventListener("focus", handleWindowFocus);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      loadFriends().catch(() => {});
      loadFriendRequests().catch(() => {});
      loadConversations().catch(() => {});
    }, 45000);

    return () => {
      chatConnection.off("FriendListUpdated", handleFriendListUpdated);
      chatConnection.off("FriendRequestsUpdated", handleFriendRequestsUpdated);
      chatConnection.off("ConversationsUpdated", handleConversationsUpdated);
      chatConnection.off("FriendPresenceUpdated", handleFriendPresenceUpdated);
      window.removeEventListener("focus", handleWindowFocus);
      window.clearInterval(intervalId);
    };
  }, [friendEmail, friendsPageSection, user?.id, user?.email]);

  useEffect(() => {
    if (!user || activeDirectFriendId || friendsPageSection !== "add") {
      setFriendLookupResults([]);
      setFriendLookupPerformed(false);
      return undefined;
    }

    const { normalizedQuery } = parseFriendSearchInput(friendEmail);
    if (!normalizedQuery) {
      setFriendLookupResults([]);
      setFriendLookupPerformed(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      searchFriendCandidates(friendEmail).catch(() => {});
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [activeDirectFriendId, friendEmail, friendsPageSection, user?.id]);

  useEffect(() => {
    if (!user || friendsPageSection !== "add" || activeDirectFriendId) {
      return;
    }

    loadFriendRequests().catch(() => {});
  }, [activeDirectFriendId, friendsPageSection, user?.id]);

  return {
    friends,
    friendEmail,
    friendLookupResults,
    friendLookupLoading,
    friendLookupPerformed,
    friendsError,
    friendActionStatus,
    isAddingFriend,
    incomingFriendRequests,
    friendRequestsLoading,
    friendRequestsError,
    friendRequestActionId,
    conversations,
    conversationsLoading,
    conversationsError,
    conversationActionLoading,
    conversationActionStatus,
    setFriends,
    setFriendEmail: setFriendSearchValue,
    setFriendsError,
    setFriendActionStatus,
    setConversationActionStatus,
    refreshFriends: loadFriends,
    refreshFriendRequests: loadFriendRequests,
    refreshConversations: loadConversations,
    rerunFriendSearch,
    updateFriendProfile,
    resetFriendsState,
    handleFriendSearchSubmit,
    handleAddFriend,
    handleFriendRequestAction,
    handleCreateConversation,
    handleUploadConversationAvatar,
    handleAddConversationMember,
  };
}
