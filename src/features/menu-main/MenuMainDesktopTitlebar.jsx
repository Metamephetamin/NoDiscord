import { useCallback, useMemo } from "react";
import AnimatedAvatar from "../../components/AnimatedAvatar";
import { DEFAULT_SERVER_ICON, resolveMediaUrl } from "../../utils/media";
import { SMS_ICON_URL } from "../../utils/menuMainModel";
import { SHOW_DIRECT_CALL_IN_TITLEBAR } from "./MenuMainControllerHelpers";

export default function MenuMainDesktopTitlebar({
  activeServer,
  activeSettingsTabMeta,
  canNavigateBack,
  canNavigateForward,
  currentConversationTarget,
  currentDirectFriend,
  directCallState,
  friendsPageSection,
  getDisplayName,
  navigateHistoryBack,
  navigateHistoryForward,
  openSettings,
  workspaceMode,
}) {
  const desktopTitlebarContext = useMemo(() => {
    if (SHOW_DIRECT_CALL_IN_TITLEBAR && directCallState.phase !== "idle") {
      return {
        title: directCallState.peerName || "Личный звонок",
        iconType: directCallState.peerAvatar ? "image" : "glyph",
        iconSrc: directCallState.peerAvatar || "",
        iconAlt: directCallState.peerName || "Личный звонок",
        iconGlyph: "C",
      };
    }

    if (openSettings) {
      return {
        title: activeSettingsTabMeta?.label || "Настройки",
        iconType: "glyph",
        iconGlyph: "⚙",
      };
    }

    if (workspaceMode === "friends") {
      if (currentDirectFriend) {
        return {
          title: getDisplayName(currentDirectFriend),
          iconType: currentDirectFriend?.avatar ? "image" : "glyph",
          iconSrc: currentDirectFriend?.avatar || "",
          iconAlt: getDisplayName(currentDirectFriend),
          iconGlyph: currentDirectFriend?.isSelf ? "В" : "ЛС",
        };
      }

      if (currentConversationTarget) {
        return {
          title: currentConversationTarget.title || "Беседа",
          iconType: currentConversationTarget?.avatar ? "image" : "glyph",
          iconSrc: currentConversationTarget?.avatar || "",
          iconAlt: currentConversationTarget.title || "Беседа",
          iconGlyph: "#",
        };
      }

      if (friendsPageSection === "conversations") {
        return {
          title: "Беседы",
          iconType: "glyph",
          iconGlyph: "#",
        };
      }

      if (friendsPageSection === "where") {
        return {
          title: "Где все ?",
          iconType: "glyph",
          iconGlyph: "⌖",
        };
      }

      return {
        title: "Друзья",
        iconType: "image",
        iconSrc: SMS_ICON_URL,
        iconAlt: "Друзья",
        iconTone: "mono",
      };
    }

    if (activeServer) {
      return {
        title: activeServer.name || "Сервер",
        iconType: activeServer.icon ? "image" : "glyph",
        iconSrc: activeServer.icon ? resolveMediaUrl(activeServer.icon, DEFAULT_SERVER_ICON) : "",
        iconAlt: activeServer.name || "Сервер",
        iconGlyph: String(activeServer.name || "S").trim().charAt(0).toUpperCase() || "S",
      };
    }

    return {
      title: "Lanaya",
      iconType: "glyph",
      iconGlyph: "T",
    };
  }, [
    activeServer,
    activeSettingsTabMeta?.label,
    currentConversationTarget,
    currentDirectFriend,
    directCallState,
    friendsPageSection,
    getDisplayName,
    openSettings,
    workspaceMode,
  ]);

  const hasDesktopWindowControls = typeof window !== "undefined" && Boolean(window.electronWindowControls?.minimize);
  const handleWindowMinimize = useCallback(() => {
    window.electronWindowControls?.minimize?.().catch?.(() => {});
  }, []);
  const handleWindowToggleMaximize = useCallback(() => {
    window.electronWindowControls?.toggleMaximize?.().catch?.(() => {});
  }, []);
  const handleWindowClose = useCallback(() => {
    window.electronWindowControls?.close?.().catch?.(() => {});
  }, []);

  return (
    <div className="desktop-app-topbar">
      <div className="desktop-app-topbar__drag" aria-hidden="true" />
      <div className="desktop-app-topbar__left">
        <button
          type="button"
          className="desktop-app-topbar__nav"
          onClick={navigateHistoryBack}
          disabled={!canNavigateBack}
          aria-label="Назад"
        >
          ←
        </button>
        <button
          type="button"
          className="desktop-app-topbar__nav"
          onClick={navigateHistoryForward}
          disabled={!canNavigateForward}
          aria-label="Вперед"
        >
          →
        </button>
      </div>
      <div className="desktop-app-topbar__center">
        <div className="desktop-app-topbar__title">
          {desktopTitlebarContext.iconType === "image" && desktopTitlebarContext.iconSrc ? (
            <AnimatedAvatar
              className={`desktop-app-topbar__title-icon desktop-app-topbar__title-icon--image ${desktopTitlebarContext.iconTone === "mono" ? "desktop-app-topbar__title-icon--mono" : ""}`}
              src={desktopTitlebarContext.iconSrc}
              alt={desktopTitlebarContext.iconAlt || desktopTitlebarContext.title}
              fallback=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="desktop-app-topbar__title-icon" aria-hidden="true">
              {desktopTitlebarContext.iconGlyph}
            </span>
          )}
          <div className="desktop-app-topbar__title-copy">
            <strong>{desktopTitlebarContext.title}</strong>
          </div>
        </div>
      </div>
      <div className="desktop-app-topbar__right">
        {hasDesktopWindowControls ? (
          <div className="desktop-app-topbar__window-controls">
            <button
              type="button"
              className="desktop-app-topbar__window-button"
              onClick={handleWindowMinimize}
              aria-label="Свернуть окно"
              title="Свернуть"
            >
              <span className="desktop-app-topbar__window-glyph desktop-app-topbar__window-glyph--minimize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="desktop-app-topbar__window-button"
              onClick={handleWindowToggleMaximize}
              aria-label="Развернуть окно"
              title="Развернуть"
            >
              <span className="desktop-app-topbar__window-glyph desktop-app-topbar__window-glyph--maximize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="desktop-app-topbar__window-button desktop-app-topbar__window-button--close"
              onClick={handleWindowClose}
              aria-label="Закрыть окно"
              title="Закрыть"
            >
              <span className="desktop-app-topbar__window-glyph desktop-app-topbar__window-glyph--close" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
