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
