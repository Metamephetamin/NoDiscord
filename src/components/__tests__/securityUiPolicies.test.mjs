import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

const readRepoFileIfExists = (relativePath) => {
  try {
    return readRepoFile(relativePath);
  } catch {
    return "";
  }
};

test("voice channel settings button is only rendered for channel managers", () => {
  const source = readRepoFile("src/components/VoiceChannelList.jsx");

  assert.match(source, /\{canManageChannels \? \(/);
  assert.match(source, /className="channel-edit-button"/);
  assert.doesNotMatch(source, /disabled=\{!canManageChannels\}/);
});

test("media preview delete button requires delete handler", () => {
  const previewSource = readRepoFile("src/components/TextChatMediaPreview.jsx");
  const viewSource = readRepoFile("src/features/text-chat/TextChatView.jsx");
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.match(previewSource, /\{onDeleteActive \? \(/);
  assert.match(viewSource, /onDeleteActive=\{mediaPreview\?\.canDelete \? handleDeleteMediaPreviewItem : null\}/);
  assert.match(messageListSource, /canDeleteAttachments=\{Boolean\(messageAuthorUserId\) && isOwnMessage\}/);
  assert.match(messageListSource, /canDelete: canDeleteAttachments/);
});

test("shared location is reduced to a privacy cell before realtime publication", () => {
  const hookSource = readRepoFile("src/hooks/useLocationSharingPreference.js");
  const hubSource = readRepoFile("BackNoDiscord/BackNoDiscord/ChatHub.cs");

  assert.match(hookSource, /const LOCATION_PRIVACY_DECIMALS = 1;/);
  assert.match(hookSource, /Number\(numericValue\.toFixed\(LOCATION_PRIVACY_DECIMALS\)\)/);
  assert.match(hookSource, /normalizeSharedLocationCoordinate\(position\?\.coords\?\.latitude\)/);
  assert.match(hookSource, /formatSharedLocationCell\(latitude, longitude\)/);
  assert.match(hookSource, /invoke\?\.\("UpdateLocationCell", \{ cell: locationCell \}\)/);
  assert.doesNotMatch(hookSource, /invoke\?\.\("UpdateLocation", latitude, longitude\)/);
  assert.doesNotMatch(hubSource, /public async Task UpdateLocation\(double latitude, double longitude\)/);
  assert.match(hubSource, /public sealed record LocationCellInput\(string\? Cell\);/);
  assert.match(hubSource, /public async Task UpdateLocationCell\(LocationCellInput\? input\)/);
  assert.match(hubSource, /TryParseLocationCell\(input\?\.Cell, out var latitude, out var longitude\)/);
  assert.match(hubSource, /Math\.Round\(value, LocationPrivacyDecimals, MidpointRounding\.AwayFromZero\)/);
});

test("message timestamps render in the bottom message footer", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.doesNotMatch(messageListSource, /<span className="message-meta">[\s\S]*?<MessageTimestamp messageItem=\{messageItem\} \/>[\s\S]*?<\/span>/);
  assert.match(messageListSource, /const showBottomFooter = !useInlineFooter[\s\S]*!usesEmbeddedLocationFooter;/);
  assert.match(messageListSource, /import \{ formatFileSize, formatTimestamp \}/);
});

test("role assignment errors use in-app status instead of alert", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");

  assert.doesNotMatch(controllerSource, /window\.alert/);
  assert.match(controllerSource, /pushWorkspaceStatusToast\(error instanceof Error \? error\.message : "Не удалось назначить роль\.", "danger"\)/);
});

test("server icon changes require manage server permission", () => {
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const rendererSource = readRepoFile("src/features/menu-main/MenuMainSettingsRenderer.jsx");
  const mediaActionsSource = readRepoFile("src/features/menu-main/useMenuMainMediaFrameActions.js");
  const assetsControllerSource = readRepoFile("BackNoDiscord/BackNoDiscord/Controllers/ServerAssetsController.cs");

  assert.match(settingsSource, /\{canManageServer \? \([\s\S]*?Сменить картинку[\s\S]*?\) : null\}/);
  assert.match(rendererSource, /if \(canManageServer\) \{\s*serverIconInputRef\.current\?\.click\(\);/);
  assert.match(mediaActionsSource, /if \(!canManageServer\) \{[\s\S]*Недостаточно прав для смены картинки сервера/);
  assert.match(mediaActionsSource, /formData\.append\("serverId", String\(activeServer\.id\)\)/);
  assert.match(assetsControllerSource, /ServerPermissionEvaluator\.CanManageServer\(snapshot, currentUser\.UserId\)/);
});

test("admin banned user rows keep avatar urls from mixed backend payloads", () => {
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");

  assert.match(settingsSource, /const getAdminUserAvatarUrl = \(user\) =>/);
  assert.match(settingsSource, /user\?\.avatarUrl \?\? user\?\.avatar_url \?\? user\?\.AvatarUrl \?\? user\?\.avatar/);
  assert.match(settingsSource, /src=\{getAdminUserAvatarUrl\(targetUser\)\}/);
});

test("sticker emoji list avoids Windows tofu fallback glyphs", () => {
  const textChatModelSource = readRepoFile("src/utils/textChatModel.js");

  assert.doesNotMatch(textChatModelSource, /"🫩"/);
  assert.match(textChatModelSource, /"face_bags_under_eyes", "😩"/);
});

test("pinned message jumps hydrate older history before giving up", () => {
  const scrollManagerSource = readRepoFile("src/hooks/useTextChatScrollManager.js");
  const scrollToMessageStart = scrollManagerSource.indexOf("const scrollToMessage = useCallback");
  const scrollToMessageEnd = scrollManagerSource.indexOf("useEffect(() => () => {", scrollToMessageStart);
  const scrollToMessageSource = scrollManagerSource.slice(scrollToMessageStart, scrollToMessageEnd);

  assert.match(scrollToMessageSource, /const requestOlderHistoryForJump = async \(\) =>/);
  assert.match(scrollToMessageSource, /loadOlderHistoryRef\.current\?\.\(\)/);
  assert.match(scrollToMessageSource, /hasMoreHistoryRef\.current/);
  assert.match(scrollToMessageSource, /isLoadingOlderHistoryRef\.current/);
  assert.match(scrollToMessageSource, /window\.requestAnimationFrame\(\(\) => attemptScroll\(attempt \+ 1\)\)/);
});

test("avatar crop editor exposes vertical positioning control", () => {
  const editorSource = readRepoFile("src/components/MediaFrameEditorModal.jsx");

  assert.match(editorSource, /const handleVerticalPositionChange = \(event\) => \{/);
  assert.match(editorSource, /ariaLabel="Положение аватара вверх и вниз"/);
  assert.match(editorSource, /value=\{normalizedDraftFrame\.y\}/);
});

test("microphone test and auto sensitivity are wired to the voice client", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const processingSource = readRepoFile("src/features/menu-main/useMenuMainVoiceProcessing.js");
  const voiceClientSource = readRepoFile("src/webrtc/livekitVoiceRoomClient.js");
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const storageSource = readRepoFile("src/features/menu-main/menuMainWorkspaceStorage.js");

  assert.match(controllerSource, /setIsMicMuted\(false\);\s*setIsMicTestActive\(true\);/);
  assert.match(controllerSource, /const activeMicSettingsBars = getMeterActiveBars\(micLevel, 32\);/);
  assert.match(settingsSource, /Array\.from\(\{ length: 32 \}\)/);
  assert.match(storageSource, /nd:auto-input-sensitivity:/);
  assert.match(processingSource, /client\.setAutoInputSensitivity\?\.\(currentVoiceProcessingState\.autoInputSensitivity\)/);
  assert.match(processingSource, /voiceClientRef\.current\.setAutoInputSensitivity\?\.\(autoInputSensitivity\)/);
  assert.match(voiceClientSource, /let autoInputSensitivityEnabled = true;/);
  assert.match(voiceClientSource, /async setAutoInputSensitivity\(enabled\)/);
  assert.match(voiceClientSource, /const adaptiveOpenThreshold = autoInputSensitivityEnabled/);
});

test("self headphones mute does not force local microphone mute", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const mobileSource = readRepoFile("src/components/MobileVoiceRoom.jsx");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const overlaysSource = readRepoFile("src/components/MenuMainOverlays.jsx");
  const selfMuteStart = controllerSource.indexOf("const shouldMutePublishedMic =\n      isMicMuted");
  const selfMuteEnd = controllerSource.indexOf("queueSelfVoiceStateSync", selfMuteStart);
  const selfMuteExpression = controllerSource.slice(selfMuteStart, selfMuteEnd);

  assert.match(controllerSource, /const shouldMutePublishedMic =\s*isMicMuted\s*\|\| \(Boolean\(currentVoiceChannel\) && isMicTestActive\);/);
  assert.ok(selfMuteStart >= 0 && selfMuteEnd > selfMuteStart, "self mute expression is present");
  assert.doesNotMatch(selfMuteExpression, /isSoundMuted/);
  assert.match(controllerSource, /const normalizedMicMuted = Boolean\(nextMicMuted\);/);
  assert.match(stageSource, /const isEffectiveMicMuted = Boolean\(isMicMuted\);/);
  assert.match(mobileSource, /const isEffectiveMicMuted = Boolean\(isMicMuted\);/);
  assert.doesNotMatch(profileSource, /isMicMuted \|\| isSoundMuted \? "profile__mini-icon--slashed"/);
  assert.match(overlaysSource, /const isEffectiveMicMuted = Boolean\(isMicMuted\);/);
});

test("voice settings microphone meter stays compact", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");

  assert.match(mainCss, /\.device-menu__meter span,\n\.voice-settings-meter__bars span \{\s*height: 7px;/);
  assert.match(mainCss, /\.voice-settings-card--voice \.voice-settings-meter \{\s*margin-top: 22px;\s*gap: 12px;/);
});

test("server management settings are hidden without permissions", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");

  assert.match(controllerSource, /if \(item\.id === "server" && !canManageServer\) \{/);
  assert.match(controllerSource, /if \(item\.id === "roles" && !canManageRoles\) \{/);
  assert.doesNotMatch(controllerSource, /SETTINGS_NAV_ITEMS\.find\(\(item\) => item\.id === settingsTab\)/);
});

test("owner role can be renamed without exposing role descriptions or permission edits", () => {
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const controllerSource = readRepoFile("BackNoDiscord/BackNoDiscord/Controllers/ServerInvitesController.cs");

  assert.match(settingsSource, /const selectedRoleIsOwner = selectedRole\?\.id === "owner";/);
  assert.match(settingsSource, /const selectedRolePermissionsLocked = selectedRoleIsOwner;/);
  assert.match(settingsSource, /permissions: selectedRolePermissionsLocked && selectedRole/);
  assert.doesNotMatch(settingsSource, /role\.permissions\.map\(\(permission\) => rolePermissionLabels/);
  assert.match(controllerSource, /Permissions = string\.Equals\(roleId, "owner", StringComparison\.Ordinal\)/);
  assert.match(controllerSource, /string\.Equals\(existingRole\.Id, "owner", StringComparison\.Ordinal\)[\s\S]*string\.Equals\(snapshot\.OwnerId, actorUserId, StringComparison\.Ordinal\)/);
});

test("speaking indicators animate without adding profile status dots", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const stageCss = readRepoFile("src/css/VoiceRoomStage.css");
  const channelCss = readRepoFile("src/css/ListChannels.css");
  const profileCss = readRepoFile("src/css/MenuProfile.css");

  assert.match(`${mainCss}\n${stageCss}`, /@keyframes voice-speaking-card-pulse/);
  assert.match(`${mainCss}\n${stageCss}`, /@keyframes voice-speaking-avatar-pulse/);
  assert.match(channelCss, /@keyframes participant-speaking-avatar-pulse/);
  assert.match(profileCss, /\.avatar-shell--speaking::after \{[\s\S]*?content: none;/);
  assert.match(profileCss, /@keyframes profile-speaking-avatar-pulse/);
});

test("light theme text tools menu is opaque and readable", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");

  assert.match(textChatCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu \{[\s\S]*?background: #ffffff;/);
  assert.match(textChatCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu \{[\s\S]*?backdrop-filter: none;/);
  assert.match(textChatCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu__action b/);
  assert.match(textChatCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu__action small/);
});

test("message search input text is readable on dark chat topbar", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");

  assert.match(mainCss, /\.chat__topbar-search \{[\s\S]*?color: #f8fbff;/);
  assert.match(mainCss, /\.chat__topbar-search \{[\s\S]*?caret-color: #f8fbff;/);
});

test("admin security styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const adminCss = readRepoFile("src/css/AdminSecurity.css");
  const panelsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");

  assert.match(panelsSource, /import "\.\.\/css\/AdminSecurity\.css";/);
  assert.match(adminCss, /\.admin-security-page-backdrop \{/);
  assert.match(adminCss, /\.admin-security-workspace \{/);
  assert.match(adminCss, /\.admin-user-row \{/);
  assert.doesNotMatch(mainCss, /^\.admin-security-page-backdrop \{/m);
  assert.doesNotMatch(mainCss, /^\.admin-security-workspace \{/m);
  assert.doesNotMatch(mainCss, /^\.admin-user-row \{/m);
});

test("API_BASE_URL callers do not duplicate the api prefix", () => {
  const menuSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const textChatSource = readRepoFile("src/features/text-chat/TextChatController.jsx");

  assert.doesNotMatch(menuSource, /API_BASE_URL\}\/api\//);
  assert.doesNotMatch(textChatSource, /API_BASE_URL\}\/api\//);
  assert.match(menuSource, /API_BASE_URL\}\/server-invites\/server\/\$\{encodeURIComponent\(serverId\)\}\/audit-log\?limit=20/);
  assert.match(textChatSource, /API_BASE_URL\}\/chats\/\$\{encodeURIComponent\(scopedChannelId\)\}\/messages\/search/);
});

test("server audit log refreshes after role mutations", () => {
  const menuSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const mutationStart = menuSource.indexOf("const mutateServerRoles = async");
  const createRoleStart = menuSource.indexOf("const createServerRole =", mutationStart);
  const mutationSource = menuSource.slice(mutationStart, createRoleStart);

  assert.match(mutationSource, /await refreshServerAuditLog\(requestServer\.id\);/);
});

test("message search indexes attachment media kinds, not only file names", () => {
  const actionsSource = readRepoFile("src/hooks/useTextChatMessageActions.js");
  const backendSearchSource = readRepoFile("BackNoDiscord/BackNoDiscord/Services/MessageSearchService.cs");

  assert.match(actionsSource, /buildAttachmentSearchText/);
  assert.match(actionsSource, /изображение картинка фото image photo picture/);
  assert.match(backendSearchSource, /BuildAttachmentSearchText/);
  assert.match(backendSearchSource, /"изображение картинка фото image photo picture"/);
});

test("common counters and timestamps use the numeric Roboto font", () => {
  const indexCss = readRepoFile("src/index.css");

  assert.match(indexCss, /--font-numeric: Roboto/);
  assert.match(indexCss, /\.chat__topbar-badge,[\s\S]*?\.message-reaction__count,[\s\S]*?\.voice-message__duration,[\s\S]*?font-family: var\(--font-numeric\);/);
});

test("voice stage toolbar buttons avoid native title tooltips", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const mobileStageSource = readRepoFile("src/components/MobileVoiceRoom.jsx");

  assert.doesNotMatch(stageSource, /title=\{label\}/);
  assert.doesNotMatch(stageSource, /title="Открыть сцену на весь экран"/);
  assert.match(stageSource, /aria-label=\{label\}/);
  assert.match(stageSource, /aria-label="Открыть сцену на весь экран"/);
  assert.doesNotMatch(mobileStageSource, /\stitle=/);
});

test("profile voice action uses a soundpad glyph instead of settings gear", () => {
  const panelSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");

  assert.match(panelSource, /profile__mini-glyph profile__mini-glyph--soundpad/);
  assert.doesNotMatch(panelSource, /profile__mini-glyph profile__mini-glyph--settings/);
  assert.match(mainCss, /\.profile__mini-glyph--soundpad::before/);
});

test("profile store styles are split out of the main menu bundle", () => {
  const workspaceSource = readRepoFile("src/components/FriendsWorkspace.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const storeCss = readRepoFile("src/css/ProfileStore.css");

  assert.match(workspaceSource, /import "\.\.\/css\/ProfileStore\.css";/);
  assert.doesNotMatch(mainCss, /\.profile-store-hero/);
  assert.match(storeCss, /\.profile-store-hero/);
  assert.match(storeCss, /\.friends-main__content--store/);
});

test("clipboard images can be pasted from the whole text chat area", () => {
  const controllerSource = readRepoFile("src/features/text-chat/TextChatController.jsx");
  const viewSource = readRepoFile("src/features/text-chat/TextChatView.jsx");

  assert.match(controllerSource, /const clipboardDataFiles = Array\.from\(event\.clipboardData\?\.files \|\| \[\]\);/);
  assert.match(controllerSource, /const clipboardFiles = \[\.\.\.clipboardItemFiles, \.\.\.clipboardDataFiles\]/);
  assert.match(controllerSource, /if \(event\.defaultPrevented\) \{/);
  assert.match(viewSource, /className=\{`textchat-container/);
  assert.match(viewSource, /onPaste=\{handleComposerPaste\}/);
});

test("message reports use an in-app dialog instead of browser prompt", () => {
  const actionsSource = readRepoFile("src/hooks/useTextChatMessageActions.js");
  const viewSource = readRepoFile("src/features/text-chat/TextChatView.jsx");
  const modalSource = readRepoFile("src/components/TextChatReportModal.jsx");

  assert.doesNotMatch(actionsSource, /window\.prompt/);
  assert.match(actionsSource, /setMessageReportModal\(\{/);
  assert.match(actionsSource, /submitMessageReport/);
  assert.match(viewSource, /<TextChatReportModal/);
  assert.match(modalSource, /Причина жалобы/);
});

test("member nickname changes use an in-app form instead of browser prompt", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");

  assert.doesNotMatch(controllerSource, /window\.prompt/);
  assert.match(workspaceSource, /member-role-menu__nickname-form/);
  assert.match(workspaceSource, /member-role-menu__nickname-input/);
});

test("member role menu styles are split out of the main menu stylesheet", () => {
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const memberRoleMenuCss = readRepoFileIfExists("src/css/MemberRoleMenu.css");

  assert.match(workspaceSource, /import "\.\.\/css\/MemberRoleMenu\.css";/);
  assert.doesNotMatch(mainCss, /\.member-role-menu/);
  assert.match(memberRoleMenuCss, /\.member-role-menu/);
});

test("server invite modal styles are split out of the main menu stylesheet", () => {
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const inviteModalCss = readRepoFileIfExists("src/css/ServerInviteModal.css");

  assert.match(workspaceSource, /import "\.\.\/css\/ServerInviteModal\.css";/);
  assert.doesNotMatch(mainCss, /\.server-invite-modal/);
  assert.match(inviteModalCss, /\.server-invite-modal/);
});

test("quick switcher styles are split out of the main menu stylesheet", () => {
  const quickSwitcherSource = readRepoFile("src/components/QuickSwitcherModal.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const quickSwitcherCss = readRepoFileIfExists("src/css/QuickSwitcherModal.css");

  assert.match(quickSwitcherSource, /import "\.\.\/css\/QuickSwitcherModal\.css";/);
  assert.doesNotMatch(mainCss, /\.quick-switcher/);
  assert.doesNotMatch(textChatCss, /\.quick-switcher/);
  assert.match(quickSwitcherCss, /\.quick-switcher/);
  assert.match(quickSwitcherCss, /\.quick-switcher__list::-webkit-scrollbar-thumb/);
});

test("friends workspace styles are split out of the main menu stylesheet", () => {
  const friendsWorkspaceSource = readRepoFile("src/components/FriendsWorkspace.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const friendsCss = readRepoFileIfExists("src/css/FriendsWorkspace.css");

  assert.match(friendsWorkspaceSource, /import "\.\.\/css\/FriendsWorkspace\.css";/);
  assert.doesNotMatch(mainCss, /\.friends-main/);
  assert.doesNotMatch(mainCss, /\.friends-directory/);
  assert.doesNotMatch(mainCss, /\.friends-modal/);
  assert.match(friendsCss, /\.friends-main/);
  assert.match(friendsCss, /\.friends-directory/);
  assert.match(friendsCss, /\.friends-modal/);
});

test("stream viewer styles are split out of the main menu stylesheet", () => {
  const viewerSource = readRepoFile("src/components/ScreenShareViewer.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const viewerCss = readRepoFileIfExists("src/css/ScreenShareViewer.css");

  assert.match(viewerSource, /import "\.\.\/css\/ScreenShareViewer\.css";/);
  assert.match(viewerCss, /\.stream-viewer \{/);
  assert.match(viewerCss, /\.stream-viewer__video--mirrored/);
  assert.doesNotMatch(mainCss, /\.stream-viewer \{/);
  assert.doesNotMatch(mainCss, /\.stream-viewer__button/);
});

test("role deletion uses an in-app confirmation instead of browser confirm", () => {
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");

  assert.doesNotMatch(settingsSource, /window\.confirm/);
  assert.match(settingsSource, /roleDeleteConfirmId/);
  assert.match(settingsSource, /Подтвердить удаление/);
});

test("server deletion uses an in-app confirmation instead of browser confirm", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");

  assert.doesNotMatch(controllerSource, /window\.confirm/);
  assert.match(controllerSource, /serverDeleteConfirmId/);
  assert.match(controllerSource, /Подтвердите удаление сервера/);
});

test("server names are capped consistently in settings and stored snapshots", () => {
  const modelSource = readRepoFile("src/utils/menuMainModel.js");
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const serverWorkspaceCss = readRepoFile("src/css/ServerWorkspace.css");

  assert.match(modelSource, /export const MAX_SERVER_NAME_LENGTH = 48;/);
  assert.match(modelSource, /export const normalizeServerNameInput = \(value, fallback = "Сервер"\) =>/);
  assert.match(modelSource, /name: normalizeServerNameInput\(String\(server\?\.name \|\| `Сервер \$\{index \+ 1\}`\)/);
  assert.match(controllerSource, /normalizeServerNameInput\(createServerName/);
  assert.match(controllerSource, /name: normalizeServerNameInput\(value, server\.name \|\| "Сервер"\)/);
  assert.match(settingsSource, /maxLength=\{MAX_SERVER_NAME_LENGTH\}/);
  assert.match(serverWorkspaceCss, /\.server-summary__name \{\s*min-width: 0;\s*display: -webkit-box;\s*-webkit-line-clamp: 2;\s*-webkit-box-orient: vertical;/);
});

test("stream fullscreen button toggles fullscreen mode", () => {
  const streamSource = readRepoFile("src/components/ScreenShareViewer.jsx");

  assert.match(streamSource, /toggleFullscreen/);
  assert.match(streamSource, /document\.fullscreenElement/);
  assert.match(streamSource, /document\.exitFullscreen\?\.\(\)/);
  assert.doesNotMatch(streamSource, /const requestFullscreen = async/);
});

test("local camera previews are mirrored consistently", () => {
  const streamSource = readRepoFile("src/components/ScreenShareViewer.jsx");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const overlaysSource = readRepoFile("src/components/MenuMainOverlays.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const screenShareCss = readRepoFile("src/css/ScreenShareViewer.css");

  assert.match(streamSource, /mirrored = false/);
  assert.match(streamSource, /stream-viewer__video--mirrored/);
  assert.match(workspaceSource, /mirrored: localSharePreview\?\.mode === "camera"/);
  assert.match(workspaceSource, /mirrored=\{localSharePreview\?\.mode === "camera"\}/);
  assert.match(workspaceSource, /stream-mini-player__video--mirrored/);
  assert.match(overlaysSource, /camera-modal__video camera-modal__video--mirrored/);
  assert.match(screenShareCss, /\.stream-viewer__video--mirrored/);
  assert.match(mainCss, /\.stream-mini-player__video--mirrored/);
  assert.match(mainCss, /\.camera-modal__video--mirrored/);
});

test("screen and camera shares render as separate viewing windows", () => {
  const voiceClientSource = readRepoFile("src/webrtc/livekitVoiceRoomClient.js");
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const viewerSource = readRepoFile("src/components/ScreenShareViewer.jsx");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const stageCss = readRepoFile("src/css/VoiceRoomStage.css");
  const viewerCss = readRepoFile("src/css/ScreenShareViewer.css");

  assert.match(voiceClientSource, /secondaryStream: screenActive && cameraActive \? localCameraStream : null/);
  assert.match(voiceClientSource, /cameraStream: preferredPublication\.source === Track\.Source\.ScreenShare/);
  assert.match(voiceClientSource, /const shouldSubscribeCamera = !isSpecificRemoteShareFocused \|\| isFocused;/);
  assert.match(stageSource, /activeStage\.secondaryStream/);
  assert.match(stageSource, /voice-room-stage__secondary/);
  assert.match(viewerSource, /secondaryStream/);
  assert.match(workspaceSource, /secondaryStream=\{selectedStream\?\.cameraStream \|\| null\}/);
  assert.match(workspaceSource, /secondaryStream=\{localSharePreview\?\.secondaryStream \|\| null\}/);
  assert.match(stageCss, /\.voice-room-stage__secondary/);
  assert.match(viewerCss, /\.stream-viewer__secondary/);
});

test("voice stage toolbar does not render a duplicate center camera button", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const mobileSource = readRepoFile("src/components/MobileVoiceRoom.jsx");

  assert.doesNotMatch(stageSource, /key: "camera"[\s\S]*?label: "Включить камеру"/);
  assert.match(profileSource, /aria-label=\{isCameraShareActive \? "Остановить камеру" : "Открыть камеру"\}/);
  assert.match(mobileSource, /aria-label=\{isCameraShareActive \? "Управление камерой" : "Открыть камеру"\}/);
});

test("voice stage does not keep a separate eye preview control", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");

  assert.doesNotMatch(stageSource, /case "preview":/);
  assert.doesNotMatch(stageSource, /3\.5-6 9\.5-6/);
  assert.doesNotMatch(stageSource, /icon: "preview"/);
});

test("voice leave notifies the server before slow local media cleanup", () => {
  const voiceClientSource = readRepoFile("src/webrtc/livekitVoiceRoomClient.js");
  const leaveStart = voiceClientSource.indexOf("async leaveChannel({ preserveMic = false } = {})");
  const leaveEnd = voiceClientSource.indexOf("async startDirectCall", leaveStart);
  const leaveSource = voiceClientSource.slice(leaveStart, leaveEnd);

  assert.ok(leaveStart >= 0, "leaveChannel implementation is present");
  assert.ok(leaveEnd > leaveStart, "leaveChannel block is bounded");
  assert.ok(
    leaveSource.indexOf('signalConnection.invoke("LeaveChannel", String(currentUser.id))') <
      leaveSource.indexOf("await stopRoom({ preserveChannel: true });"),
    "server leave must happen before LiveKit room cleanup"
  );
});

test("poll votes persist locally and expose anonymous mode", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const composerSource = readRepoFile("src/components/TextChatPollComposerModal.jsx");

  assert.match(composerSource, /anonymous: true/);
  assert.match(composerSource, /title: "Анонимное голосование"/);
  assert.match(messageListSource, /function readStoredPollVoteState/);
  assert.match(messageListSource, /function writeStoredPollVoteState/);
  assert.match(messageListSource, /nd:poll-vote:/);
  assert.match(messageListSource, /messageId=\{messageItem\.id\}[\s\S]*?currentUserId=\{currentUserId\}/);
  assert.doesNotMatch(messageListSource, /window\.prompt/);
  assert.match(messageListSource, /message-poll-card__add-option-form/);
  assert.match(messageListSource, /message-poll-card__add-option-input/);
});

test("poll votes are submitted to the server and merged through message updates", () => {
  const controllerSource = readRepoFile("src/features/text-chat/TextChatController.jsx");
  const viewSource = readRepoFile("src/features/text-chat/TextChatView.jsx");
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.match(controllerSource, /const submitPollVote = useCallback\(async \(messageId, optionIds\) =>/);
  assert.match(controllerSource, /\/messages\/\$\{encodeURIComponent\(messageId\)\}\/poll-vote/);
  assert.match(controllerSource, /setMessagesByChannel\(\(previous\) => updateChannelMessagesState\(previous, scopedChannelId/);
  assert.match(viewSource, /const stableSubmitPollVote = useStableCallback\(submitPollVote\);/);
  assert.match(viewSource, /onSubmitPollVote=\{stableSubmitPollVote\}/);
  assert.match(messageListSource, /onSubmitPollVote/);
  assert.match(messageListSource, /await onSubmitPollVote\(messageId, selectedOptionIds\)/);
});

test("poll composer backdrop fully covers and blurs the app", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const backdropRule = textChatCss.match(/\.poll-composer-backdrop \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(backdropRule, /position: fixed;/);
  assert.match(backdropRule, /inset: 0;/);
  assert.match(backdropRule, /min-width: 100vw;/);
  assert.match(backdropRule, /min-height: 100dvh;/);
  assert.match(backdropRule, /background: rgba\(3, 5, 12, 0\.72\);/);
  assert.match(backdropRule, /backdrop-filter: blur\(16px\);/);
  assert.match(backdropRule, /isolation: isolate;/);
  assert.match(backdropRule, /overscroll-behavior: contain;/);
});

test("manual profile status is editable, persisted, and rendered under the nickname", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const slotSource = readRepoFile("src/features/menu-main/MenuMainProfilePanelSlot.jsx");
  const profileCss = readRepoFile("src/css/MenuProfile.css");

  assert.match(controllerSource, /MAX_PROFILE_STATUS_LENGTH/);
  assert.match(controllerSource, /profileStatus: user\?\.profile_status \|\| user\?\.profileStatus \|\| ""/);
  assert.match(controllerSource, /profileStatus: nextProfileStatus/);
  assert.match(controllerSource, /profile_status: data\?\.profile_status \?\? data\?\.profileStatus \?\? nextProfileStatus/);
  assert.match(settingsSource, /onUpdateProfileDraft\?\.\("profileStatus", event\.target\.value\)/);
  assert.match(settingsSource, /maxLength=\{maxProfileStatusLength\}/);
  assert.match(slotSource, /profileStatus=\{profileCustomStatus\}/);
  assert.match(profileSource, /className="profile__custom-status"/);
  assert.match(profileCss, /\.profile__custom-status \{/);
});

test("interface accent color is customizable through appearance settings", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const rendererSource = readRepoFile("src/features/menu-main/MenuMainSettingsRenderer.jsx");
  const storageSource = readRepoFile("src/features/menu-main/menuMainWorkspaceStorage.js");
  const themeSource = readRepoFile("src/utils/uiTheme.mjs");

  assert.match(storageSource, /nd:ui-accent:/);
  assert.match(themeSource, /export function normalizeUiAccentColor/);
  assert.match(themeSource, /export function applyUiAccentPreference/);
  assert.match(controllerSource, /const \[uiAccentColor, setUiAccentColor\]/);
  assert.match(controllerSource, /localStorage\.setItem\(uiAccentStorageKey, normalizeUiAccentColor\(uiAccentColor\)\)/);
  assert.match(controllerSource, /applyUiAccentPreference\(uiAccentColor, \{ root, body \}\)/);
  assert.match(rendererSource, /uiAccentColor=\{uiAccentColor\}/);
  assert.match(settingsSource, /type="color"[\s\S]*?value=\{uiAccentColor \|\| "#8b7cff"\}/);
});

test("media-only message layout stays stable after reactions are added", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const mediaOnlyStart = messageListSource.indexOf("const isMediaOnlyMessage =");
  const emojiOnlyStart = messageListSource.indexOf("const isInlineEmojiOnlyMessage =", mediaOnlyStart);
  const mediaOnlySource = messageListSource.slice(mediaOnlyStart, emojiOnlyStart);

  assert.match(mediaOnlySource, /hasRenderableAttachments/);
  assert.doesNotMatch(mediaOnlySource, /!reactions\.length/);
});
