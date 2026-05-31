import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

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

test("shared location is rounded before realtime publication", () => {
  const hookSource = readRepoFile("src/hooks/useLocationSharingPreference.js");
  const hubSource = readRepoFile("BackNoDiscord/BackNoDiscord/ChatHub.cs");

  assert.match(hookSource, /const LOCATION_PRIVACY_DECIMALS = 2;/);
  assert.match(hookSource, /Number\(numericValue\.toFixed\(LOCATION_PRIVACY_DECIMALS\)\)/);
  assert.match(hookSource, /normalizeSharedLocationCoordinate\(position\?\.coords\?\.latitude\)/);
  assert.match(hookSource, /invoke\?\.\("UpdateLocation", latitude, longitude\)/);
  assert.match(hubSource, /NormalizeSharedLocationCoordinate\(latitude\)/);
  assert.match(hubSource, /Math\.Round\(value, 2, MidpointRounding\.AwayFromZero\)/);
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
  const channelCss = readRepoFile("src/css/ListChannels.css");
  const profileCss = readRepoFile("src/css/MenuProfile.css");

  assert.match(mainCss, /@keyframes voice-speaking-card-pulse/);
  assert.match(mainCss, /@keyframes voice-speaking-avatar-pulse/);
  assert.match(channelCss, /@keyframes participant-speaking-avatar-pulse/);
  assert.match(profileCss, /\.avatar-shell--speaking::after \{[\s\S]*?content: none;/);
  assert.match(profileCss, /@keyframes profile-speaking-avatar-pulse/);
});
