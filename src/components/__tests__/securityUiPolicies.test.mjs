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

  assert.match(previewSource, /\{onDeleteActive \? \(/);
  assert.match(viewSource, /onDeleteActive=\{mediaPreview\?\.canDelete \? handleDeleteMediaPreviewItem : null\}/);
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

  assert.match(modelSource, /export const MAX_SERVER_NAME_LENGTH = 48;/);
  assert.match(modelSource, /export const normalizeServerNameInput = \(value, fallback = "Сервер"\) =>/);
  assert.match(modelSource, /name: normalizeServerNameInput\(String\(server\?\.name \|\| `Сервер \$\{index \+ 1\}`\)/);
  assert.match(controllerSource, /normalizeServerNameInput\(createServerName/);
  assert.match(controllerSource, /name: normalizeServerNameInput\(value, server\.name \|\| "Сервер"\)/);
  assert.match(settingsSource, /maxLength=\{MAX_SERVER_NAME_LENGTH\}/);
});

test("stream fullscreen button toggles fullscreen mode", () => {
  const streamSource = readRepoFile("src/components/ScreenShareViewer.jsx");

  assert.match(streamSource, /toggleFullscreen/);
  assert.match(streamSource, /document\.fullscreenElement/);
  assert.match(streamSource, /document\.exitFullscreen\?\.\(\)/);
  assert.doesNotMatch(streamSource, /const requestFullscreen = async/);
});

test("poll votes persist locally and expose anonymous mode", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const composerSource = readRepoFile("src/components/TextChatPollComposerModal.jsx");

  assert.match(composerSource, /anonymous: true/);
  assert.match(composerSource, /title: "Анонимное голосование"/);
  assert.match(messageListSource, /function readStoredPollVoteState/);
  assert.match(messageListSource, /function writeStoredPollVoteState/);
  assert.match(messageListSource, /nd:poll-vote:/);
  assert.match(messageListSource, /messageId=\{messageItem\.id\} currentUserId=\{currentUserId\}/);
  assert.doesNotMatch(messageListSource, /window\.prompt/);
  assert.match(messageListSource, /message-poll-card__add-option-form/);
  assert.match(messageListSource, /message-poll-card__add-option-input/);
});
