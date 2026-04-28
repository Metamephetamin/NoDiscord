import { useCallback, useRef, useState } from "react";
import { API_BASE_URL, API_URL } from "../../config/runtime";
import {
  readMediaFileDimensions,
  validateAvatarFile,
  validateProfileBackgroundFile,
  validateServerIconFile,
} from "../../utils/avatarMedia";
import {
  authFetch,
  getApiErrorMessage,
  getStoredAccessTokenExpiresAt,
  getStoredRefreshToken,
  getStoredToken,
  parseApiResponse,
  storeSession,
} from "../../utils/auth";
import {
  getAutoMediaFrame,
  getDefaultMediaFrame,
  normalizeMediaFrame,
  parseMediaFrame,
  serializeMediaFrame,
} from "../../utils/mediaFrames";

const revokeMediaEditorPreviewUrl = (editorState) => {
  const previewUrl = String(editorState?.previewUrl || "");
  if (previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }
};

export default function useMenuMainMediaFrameActions({
  user,
  setUser,
  activeServer,
  canManageServer,
  updateServer,
  setProfileDraft,
  setProfileStatus,
  createServerIconFrame,
  setCreateServerIcon,
  setCreateServerIconFrame,
  setCreateServerError,
}) {
  const [mediaFrameEditorState, setMediaFrameEditorState] = useState(null);
  const avatarInputRef = useRef(null);
  const profileBackgroundInputRef = useRef(null);
  const serverIconInputRef = useRef(null);

  const closeMediaFrameEditor = useCallback(() => {
    setMediaFrameEditorState((previous) => {
      revokeMediaEditorPreviewUrl(previous);
      return null;
    });
  }, []);

  const openMediaFrameEditor = useCallback(({ kind, target, file, title }) => {
    const previewUrl = URL.createObjectURL(file);
    const fallbackFrame = normalizeMediaFrame(getDefaultMediaFrame());
    setMediaFrameEditorState((previous) => {
      revokeMediaEditorPreviewUrl(previous);
      return {
        kind,
        target,
        title: title || "",
        file,
        previewUrl,
        frame: fallbackFrame,
        autoFrame: fallbackFrame,
        activeServerId: activeServer?.id || "",
      };
    });

    readMediaFileDimensions(file)
      .then((dimensions) => {
        if (!dimensions) {
          return;
        }

        const autoFrame = getAutoMediaFrame({ ...dimensions, target });
        setMediaFrameEditorState((previous) => {
          if (previous?.previewUrl !== previewUrl) {
            return previous;
          }

          return {
            ...previous,
            frame: autoFrame,
            autoFrame,
          };
        });
      })
      .catch(() => {});
  }, [activeServer?.id]);

  const uploadAvatarWithFrame = useCallback(async (file, frame) => {
    const formData = new FormData();
    formData.append("avatar", file);
    formData.append("frame", JSON.stringify(serializeMediaFrame(frame)));
    const response = await authFetch(`${API_URL}/api/user/upload-avatar`, { method: "POST", body: formData });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить аватар."));
    }

    const nextAvatarUrl = data?.avatarUrl || data?.avatar_url || "";
    const nextAvatarFrame = parseMediaFrame(data?.avatar_frame, data?.avatarFrame, frame);
    const nextUser = {
      ...user,
      avatarUrl: nextAvatarUrl,
      avatar: nextAvatarUrl,
      avatarFrame: nextAvatarFrame,
      avatar_frame: nextAvatarFrame,
    };
    setUser?.(nextUser);
    await storeSession(nextUser, {
      accessToken: getStoredToken(),
      refreshToken: getStoredRefreshToken(),
      accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
    });
    setProfileStatus("Аватар сохранён.");
  }, [setProfileStatus, setUser, user]);

  const uploadProfileBackgroundWithFrame = useCallback(async (file, frame) => {
    const formData = new FormData();
    formData.append("background", file);
    formData.append("frame", JSON.stringify(serializeMediaFrame(frame)));

    const response = await authFetch(`${API_URL}/api/user/upload-profile-background`, { method: "POST", body: formData });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить фон профиля."));
    }

    const nextProfileBackgroundUrl = data?.profileBackgroundUrl || data?.profile_background_url || "";
    const nextProfileBackgroundFrame = parseMediaFrame(
      data?.profile_background_frame,
      data?.profileBackgroundFrame,
      frame
    );
    const nextUser = {
      ...user,
      profileBackgroundUrl: nextProfileBackgroundUrl,
      profile_background_url: nextProfileBackgroundUrl,
      profileBackground: nextProfileBackgroundUrl,
      profileBackgroundFrame: nextProfileBackgroundFrame,
      profile_background_frame: nextProfileBackgroundFrame,
    };
    setUser?.(nextUser);
    setProfileDraft((previous) => ({
      ...previous,
      profileBackgroundUrl: nextProfileBackgroundUrl,
      profileBackgroundFrame: nextProfileBackgroundFrame,
    }));
    await storeSession(nextUser, {
      accessToken: getStoredToken(),
      refreshToken: getStoredRefreshToken(),
      accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
    });
    setProfileStatus("Фон профиля сохранён.");
  }, [setProfileDraft, setProfileStatus, setUser, user]);

  const uploadServerIconWithFrame = useCallback(async (file, frame, { createDraft = false } = {}) => {
    const formData = new FormData();
    formData.append("icon", file);
    const response = await authFetch(`${API_BASE_URL}/server-assets/upload-icon`, {
      method: "POST",
      body: formData,
    });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить иконку сервера."));
    }

    const nextIconUrl = data?.iconUrl || data?.icon_url || "";
    const nextIconFrame = normalizeMediaFrame(frame);
    if (createDraft) {
      setCreateServerIcon(nextIconUrl);
      setCreateServerIconFrame(nextIconFrame);
      setCreateServerError("");
      return;
    }

    updateServer((server) => ({ ...server, icon: nextIconUrl, iconFrame: nextIconFrame }));
    setProfileStatus("Иконка сервера сохранена.");
  }, [setCreateServerError, setCreateServerIcon, setCreateServerIconFrame, setProfileStatus, updateServer]);

  const handleMediaFrameConfirm = useCallback(async (frame) => {
    const editorState = mediaFrameEditorState;
    if (!editorState?.file) {
      closeMediaFrameEditor();
      return;
    }

    try {
      if (editorState.kind === "avatar") {
        await uploadAvatarWithFrame(editorState.file, frame);
      } else if (editorState.kind === "profileBackground") {
        await uploadProfileBackgroundWithFrame(editorState.file, frame);
      } else if (editorState.kind === "serverIcon") {
        await uploadServerIconWithFrame(editorState.file, frame);
      } else if (editorState.kind === "createServerIcon") {
        await uploadServerIconWithFrame(editorState.file, frame, { createDraft: true });
      }
    } catch (error) {
      if (editorState.kind === "createServerIcon") {
        setCreateServerError(error?.message || "Не удалось загрузить иконку сервера.");
      } else {
        setProfileStatus(error?.message || "Не удалось сохранить медиа.");
      }
      console.error("Ошибка сохранения медиа с кадрированием:", error);
    } finally {
      revokeMediaEditorPreviewUrl(editorState);
      setMediaFrameEditorState(null);
    }
  }, [
    closeMediaFrameEditor,
    mediaFrameEditorState,
    setCreateServerError,
    setProfileStatus,
    uploadAvatarWithFrame,
    uploadProfileBackgroundWithFrame,
    uploadServerIconWithFrame,
  ]);

  const handleCreateServerIconChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const validationError = await validateServerIconFile(file);
      if (validationError) {
        setCreateServerError(validationError);
        return;
      }
    } catch (error) {
      console.error("Ошибка подготовки иконки сервера:", error);
      setCreateServerError(error?.message || "Не удалось загрузить иконку сервера.");
      return;
    }

    openMediaFrameEditor({
      kind: "createServerIcon",
      target: "serverIcon",
      file,
      initialFrame: createServerIconFrame,
      title: "Иконка сервера",
    });
  }, [createServerIconFrame, openMediaFrameEditor, setCreateServerError]);

  const handleAvatarChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    const avatarValidationError = await validateAvatarFile(file);
    if (avatarValidationError) {
      setProfileStatus(avatarValidationError);
      return;
    }

    openMediaFrameEditor({
      kind: "avatar",
      target: "avatar",
      file,
      title: "Аватар",
    });
  }, [openMediaFrameEditor, setProfileStatus, user?.id]);

  const handleProfileBackgroundChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    const backgroundValidationError = await validateProfileBackgroundFile(file);
    if (backgroundValidationError) {
      setProfileStatus(backgroundValidationError);
      return;
    }

    openMediaFrameEditor({
      kind: "profileBackground",
      target: "profileBackground",
      file,
      title: "Фон профиля",
    });
  }, [openMediaFrameEditor, setProfileStatus, user?.id]);

  const handleServerIconChange = useCallback(async (event) => {
    if (!canManageServer) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeServer) return;

    try {
      const validationError = await validateServerIconFile(file);
      if (validationError) {
        setProfileStatus(validationError);
        return;
      }
      openMediaFrameEditor({
        kind: "serverIcon",
        target: "serverIcon",
        file,
        title: "Иконка сервера",
      });
    } catch (error) {
      console.error("Ошибка смены иконки сервера:", error);
      setProfileStatus(error?.message || "Не удалось загрузить иконку сервера.");
    }
  }, [activeServer, canManageServer, openMediaFrameEditor, setProfileStatus]);

  return {
    mediaFrameEditorState,
    avatarInputRef,
    profileBackgroundInputRef,
    serverIconInputRef,
    closeMediaFrameEditor,
    handleMediaFrameConfirm,
    handleCreateServerIconChange,
    handleAvatarChange,
    handleProfileBackgroundChange,
    handleServerIconChange,
  };
}
