import assert from "node:assert/strict";
import test from "node:test";
import { readRepoFile, readRepoFileIfExists } from "./readRepoFile.mjs";

test("voice channel settings use the channel context menu instead of hover gear", () => {
  const voiceSource = readRepoFile("src/components/VoiceChannelList.jsx");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const renderVoiceChannelsStart = workspaceSource.indexOf("const renderVoiceChannels =");
  const renderVoiceChannelsEnd = workspaceSource.indexOf("const renderMixedChannelRows =", renderVoiceChannelsStart);
  const renderVoiceChannelsSource = workspaceSource.slice(renderVoiceChannelsStart, renderVoiceChannelsEnd);

  assert.match(voiceSource, /onChannelContextMenu/);
  assert.doesNotMatch(voiceSource, /className="channel-edit-button"/);
  assert.doesNotMatch(renderVoiceChannelsSource, /onRenameChannel=\{onOpenChannelSettings\}/);
  assert.match(workspaceSource, /const openChannelSettingsFromContextMenu = \(\) => \{/);
  assert.match(workspaceSource, />\s*Настройки канала\s*<\/button>/);
});

test("voice channel timer stays visible without a hover settings slot", () => {
  const css = readRepoFile("src/css/ListChannels.css");
  const timerRule = css.match(/\.voice-channel__timer \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(css, /\.voice-channel__button \{[\s\S]*?padding: 0 12px 0 0;/);
  assert.match(timerRule, /margin-left: 8px;/);
  assert.match(timerRule, /width: 56px;/);
  assert.match(timerRule, /text-align: left;/);
  assert.doesNotMatch(timerRule, /visibility: hidden;/);
  assert.doesNotMatch(css, /\.voice-channel__row > \.channel-edit-button/);
  assert.doesNotMatch(css, /\.voice-channel__row:has\(> \.channel-edit-button\)/);
});

test("text channel settings button is only rendered for channel managers", () => {
  const source = readRepoFile("src/components/ServerWorkspace.jsx");
  const renderTextChannelItemStart = source.indexOf("const renderTextChannelItem =");
  const renderVoiceChannelsStart = source.indexOf("const renderVoiceChannels =", renderTextChannelItemStart);
  const renderTextChannelItemSource = source.slice(renderTextChannelItemStart, renderVoiceChannelsStart);

  assert.match(renderTextChannelItemSource, /\{canManageChannels \? \(/);
  assert.match(renderTextChannelItemSource, /className="channel-edit-button"/);
  assert.doesNotMatch(renderTextChannelItemSource, /disabled=\{!canManageChannels\}/);
});

test("default channel section headers do not render add buttons", () => {
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const defaultTextHeaderSource = workspaceSource.slice(
    workspaceSource.indexOf('openDefaultCategoryContextMenu(event, "text")'),
    workspaceSource.indexOf("renderMixedChannelRows(visibleDefaultTextChannels"),
  );
  const defaultVoiceHeaderSource = workspaceSource.slice(
    workspaceSource.indexOf('openDefaultCategoryContextMenu(event, "voice")'),
    workspaceSource.indexOf("renderMixedChannelRows(visibleDefaultVoiceChannels"),
  );

  assert.doesNotMatch(defaultTextHeaderSource, /onAddTextChannel|channel-add-button|>\+<\/button>/);
  assert.doesNotMatch(defaultVoiceHeaderSource, /onAddVoiceChannel|channel-add-button|>\+<\/button>/);
  assert.doesNotMatch(workspaceSource, /onAddTextChannel|onAddVoiceChannel/);
  assert.doesNotMatch(controllerSource, /onAddTextChannel=\{|onAddVoiceChannel=\{/);
});

test("server summary menu uses bootstrap icons instead of symbol glyphs", () => {
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const menuSource = workspaceSource.slice(
    workspaceSource.indexOf('className="server-summary-menu"'),
    workspaceSource.indexOf("{isServerInviteModalOpen", workspaceSource.indexOf('className="server-summary-menu"')),
  );

  [
    "person-plus-fill",
    "gear-fill",
    "people-fill",
    "plus-circle-fill",
    "folder-plus",
    "bell-fill",
    "pencil-square",
    "eye-slash-fill",
    "eye-fill",
    "clipboard-fill",
  ].forEach((iconName) => {
    assert.match(workspaceSource, new RegExp(`["']${iconName}["']`));
  });
  assert.match(workspaceSource, /function ServerSummaryMenuIcon/);
  assert.doesNotMatch(menuSource, /[♣◆＋▣●✎]/);
  assert.doesNotMatch(menuSource, />ID<\/span>/);
});

test("desktop login card stays near the auth sphere center", () => {
  const authCss = readRepoFile("src/css/Auth.css");

  assert.match(authCss, /@media \(min-width: 641px\)[\s\S]*?\.auth-page--login \.auth-card,[\s\S]*?transform: translateY\(56px\);/);
  assert.doesNotMatch(authCss, /\.auth-page--login \.auth-card\.auth-card--login\s*\{[\s\S]*?transform: translateY\(150px\);[\s\S]*?\}/);
});

test("password login surfaces backend totp challenge instead of hiding the field", () => {
  const authSource = readRepoFile("src/components/Auth.jsx");
  const loginHandlerSource = authSource.slice(
    authSource.indexOf("const handleLogin = async"),
    authSource.indexOf("const handleRequestLoginCode = async"),
  );

  assert.match(loginHandlerSource, /totpCode: typeof backendFieldErrors\.totpCode === "string" \? backendFieldErrors\.totpCode : ""/);
  assert.match(authSource, /\{loginErrors\.totpCode \|\| loginForm\.totpCode \? \(/);
});

test("media preview delete button requires delete handler", () => {
  const previewSource = readRepoFile("src/components/TextChatMediaPreview.jsx");
  const viewSource = readRepoFile("src/features/text-chat/TextChatView.jsx");
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.match(previewSource, /onClick=\{handlePreviewMenuToggle\}/);
  assert.match(previewSource, /onMouseEnter=\{handlePreviewMenuOpen\}/);
  assert.match(previewSource, /className="media-preview__icon-button media-preview__menu-button"/);
  assert.match(previewSource, /className="media-preview__menu"/);
  assert.doesNotMatch(previewSource, /title="Меню"/);
  assert.match(previewSource, />\s*Удалить\s*</);
  assert.doesNotMatch(previewSource, /media-preview__icon-button media-preview__icon-button--danger/);
  assert.doesNotMatch(previewSource, /aria-label="Удалить текущее вложение"[\s\S]*?<BootstrapIcon kind="trash3" \/>/);
  assert.match(viewSource, /onDeleteActive=\{mediaPreview\?\.canDelete \? handleDeleteMediaPreviewItem : null\}/);
  assert.match(messageListSource, /canDeleteAttachments=\{Boolean\(messageAuthorUserId\) && isOwnMessage\}/);
  assert.match(messageListSource, /canDelete: canDeleteAttachments/);
});

test("company info panel exposes copyable work contacts instead of site details", () => {
  const panelsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const settingsCss = readRepoFile("src/css/MenuSettings.css");

  assert.match(panelsSource, /COMPANY_WORK_EMAIL = "andrey1689123pro@gmail\.com"/);
  assert.match(panelsSource, /COMPANY_TELEGRAM_HANDLE = "zzzCHUL"/);
  assert.match(panelsSource, /copyCompanyContact/);
  assert.match(panelsSource, /globalThis\.navigator\.clipboard\.writeText/);
  assert.match(panelsSource, /Скопировано/);
  assert.doesNotMatch(panelsSource, /<dt>Сайт<\/dt>[\s\S]*?https:\/\/lanaya\.space/);
  assert.doesNotMatch(panelsSource, /<dt>ИНН<\/dt>[\s\S]*?504417743063/);
  assert.match(settingsCss, /\.company-info-panel__photo/);
  assert.match(settingsCss, /\.company-info-panel__toast/);
});

test("media preview photo actions use bootstrap icons without a theme shell", () => {
  const previewSource = readRepoFile("src/components/TextChatMediaPreview.jsx");
  const mediaPreviewCss = readRepoFileIfExists("src/css/TextChatMediaPreview.css");

  assert.match(previewSource, /BootstrapIcon/);
  assert.match(previewSource, /kind="trash3"/);
  assert.match(previewSource, /kind="download"/);
  assert.match(previewSource, /kind="threeDotsVertical"/);
  assert.match(previewSource, /\{isImagePreview \? "Фото" : "Видео"\}/);
  assert.match(previewSource, />\s*Копировать\s*</);
  assert.match(previewSource, />\s*Переслать\s*</);
  assert.match(previewSource, />\s*Сохранить как\.\.\.\s*</);
  assert.doesNotMatch(previewSource, /kind="collection"/);
  assert.doesNotMatch(previewSource, /Скачать все вложения/);
  assert.match(mediaPreviewCss, /\.media-preview__icon-button \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
  assert.match(mediaPreviewCss, /\.media-preview__menu-wrap::before \{[\s\S]*?height: 12px;[\s\S]*?pointer-events: none;/);
  assert.match(mediaPreviewCss, /\.media-preview__menu-wrap:hover::before,[\s\S]*?\.media-preview__menu-wrap--open::before \{[\s\S]*?pointer-events: auto;/);
  assert.match(mediaPreviewCss, /\.media-preview__menu-wrap:hover \.media-preview__menu,[\s\S]*?\.media-preview__menu-wrap--open \.media-preview__menu \{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/);
  assert.match(mediaPreviewCss, /\.media-preview__menu-button \{[\s\S]*?writing-mode: vertical-rl;/);
  assert.match(mediaPreviewCss, /html\[data-ui-theme="light"\] \.media-preview__icon-button \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
});

test("media preview video volume controls expose a working speaker slider", () => {
  const previewSource = readRepoFile("src/components/TextChatMediaPreview.jsx");
  const mediaPreviewCss = readRepoFileIfExists("src/css/TextChatMediaPreview.css");

  assert.match(previewSource, /function VideoVolumeIcon\(\{ muted \}\)/);
  assert.match(previewSource, /<VideoVolumeIcon muted=\{currentVideoControlState\.muted \|\| currentVideoControlState\.volume <= 0\} \/>/);
  assert.match(previewSource, /onInput=\{handleVideoVolumeChange\}/);
  assert.match(previewSource, /"--media-preview-volume"/);
  assert.doesNotMatch(previewSource, /media-preview__video-icon--volume/);
  assert.match(mediaPreviewCss, /\.media-preview__video-volume-icon \{[\s\S]*?fill: currentColor;/);
  assert.match(mediaPreviewCss, /\.media-preview__video-volume-slider \{[\s\S]*?--media-preview-volume/);
  assert.match(mediaPreviewCss, /\.media-preview__video-volume-slider::-webkit-slider-thumb \{[\s\S]*?width: 12px;[\s\S]*?height: 12px;/);
  assert.match(mediaPreviewCss, /\.media-preview__video-volume-slider::-moz-range-thumb \{[\s\S]*?width: 12px;[\s\S]*?height: 12px;/);
});

test("media preview can browse previous message media without forward wraparound", () => {
  const actionsSource = readRepoFile("src/hooks/useTextChatMessageActions.js");
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.doesNotMatch(actionsSource, /activeIndex[\s\S]*?direction[\s\S]*?itemCount[\s\S]*?% itemCount/);
  assert.match(actionsSource, /const nextIndex = Math\.min\(Math\.max\(currentIndex \+ direction, 0\), itemCount - 1\);/);
  assert.match(messageListSource, /mediaPreviewGalleryItemsByMessageId/);
  assert.match(messageListSource, /messages\.forEach\(\(messageItem, messageIndex\) =>/);
  assert.match(messageListSource, /cumulativePreviewItems/);
});

test("shared location is reduced to a privacy cell before realtime publication", () => {
  const hookSource = readRepoFile("src/hooks/useLocationSharingPreference.js");
  const friendsSource = readRepoFile("src/components/FriendsWorkspace.jsx");
  const hubSource = readRepoFile("BackNoDiscord/BackNoDiscord/ChatHub.cs");
  const userControllerSource = readRepoFile("BackNoDiscord/BackNoDiscord/Controllers/UserController.cs");
  const friendsControllerSource = readRepoFile("BackNoDiscord/BackNoDiscord/Controllers/FriendsController.cs");
  const dbContextSource = readRepoFile("BackNoDiscord/BackNoDiscord/DbContext.cs");
  const schemaInitializerSource = readRepoFile("BackNoDiscord/BackNoDiscord/Infrastructure/DatabaseSchemaInitializer.cs");

  assert.match(hookSource, /enabled: false,/);
  assert.match(dbContextSource, /public bool location_sharing_enabled \{ get; set; \} = false;/);
  assert.match(dbContextSource, /entity\.Property\(x => x\.location_sharing_enabled\)\.HasDefaultValue\(false\);/);
  assert.match(schemaInitializerSource, /location_sharing_enabled boolean NOT NULL DEFAULT false/);
  assert.match(hookSource, /const LOCATION_PRIVACY_DECIMALS = 1;/);
  assert.match(hookSource, /Number\(numericValue\.toFixed\(LOCATION_PRIVACY_DECIMALS\)\)/);
  assert.match(hookSource, /normalizeSharedLocationCoordinate\(position\?\.coords\?\.latitude\)/);
  assert.match(hookSource, /formatSharedLocationCell\(latitude, longitude\)/);
  assert.match(hookSource, /invoke\?\.\("UpdateLocationCell", \{ cell: locationCell \}\)/);
  assert.match(hookSource, /setStatus\(getGeolocationErrorMessage\(error\)\);/);
  assert.match(friendsSource, /setLocationStatus\(getGeolocationErrorMessage\(error\)\);/);
  assert.match(hookSource, /window\.localStorage\?\.removeItem\(SELF_LOCATION_STORAGE_KEY\)/);
  assert.doesNotMatch(hookSource, /safeWriteJson\(SELF_LOCATION_STORAGE_KEY/);
  assert.doesNotMatch(hookSource, /invoke\?\.\("UpdateLocation", latitude, longitude\)/);
  assert.doesNotMatch(hubSource, /public async Task UpdateLocation\(double latitude, double longitude\)/);
  assert.match(hubSource, /public sealed record LocationCellInput\(string\? Cell\);/);
  assert.match(hubSource, /public async Task UpdateLocationCell\(LocationCellInput\? input\)/);
  assert.match(hubSource, /TryParseLocationCell\(input\?\.Cell, out var latitude, out var longitude\)/);
  assert.match(hubSource, /Math\.Round\(value, LocationPrivacyDecimals, MidpointRounding\.AwayFromZero\)/);
  assert.doesNotMatch(hubSource, /latitude\s*=\s*safeLatitude/);
  assert.doesNotMatch(hubSource, /longitude\s*=\s*safeLongitude/);
  assert.doesNotMatch(userControllerSource, /latitude\s*=\s*user\.last_location_latitude/);
  assert.doesNotMatch(userControllerSource, /longitude\s*=\s*user\.last_location_longitude/);
  assert.doesNotMatch(friendsControllerSource, /latitude\s*=\s*canShowLocation/);
  assert.doesNotMatch(friendsControllerSource, /longitude\s*=\s*canShowLocation/);
});

test("friends map avoids layout invalidation on every user list render", () => {
  const friendsSource = readRepoFile("src/components/FriendsWorkspace.jsx");
  const markerEffectStart = friendsSource.indexOf("const map = mapInstanceRef.current;", friendsSource.indexOf("const centerOnSelf ="));
  const markerEffectEnd = friendsSource.indexOf("return (", markerEffectStart);
  const markerEffectSource = friendsSource.slice(markerEffectStart, markerEffectEnd);

  assert.match(friendsSource, /const visibleUsersSignature = useMemo/);
  assert.match(friendsSource, /visibleUsersRef\.current = visibleUsers;/);
  assert.match(friendsSource, /new ResizeObserver\(handleMapResize\)/);
  assert.match(markerEffectSource, /const mapUsers = visibleUsersRef\.current;/);
  assert.match(markerEffectSource, /\}, \[visibleUsersSignature\]\);/);
  assert.doesNotMatch(markerEffectSource, /map\.invalidateSize\(\)/);
});

test("message timestamps render in the bottom message footer", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.doesNotMatch(messageListSource, /<span className="message-meta">[\s\S]*?<MessageTimestamp messageItem=\{messageItem\} \/>[\s\S]*?<\/span>/);
  assert.match(messageListSource, /const showBottomFooter = !useInlineFooter[\s\S]*!usesEmbeddedLocationFooter;/);
  assert.match(messageListSource, /import \{ formatDayLabel, formatFileSize, formatTime \}/);
});

test("message timestamps show only time while dates render as day dividers", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const messageLayoutCss = readRepoFile("src/css/TextChatLayoutMessages.css");
  const messageTimestampStart = messageListSource.indexOf("function MessageTimestamp");
  const messageTimestampEnd = messageListSource.indexOf("function MessageDeliveryStatus", messageTimestampStart);
  const messageTimestampSource = messageListSource.slice(messageTimestampStart, messageTimestampEnd);
  const dateTextRule = messageLayoutCss.match(/\.message-date-divider span \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(messageTimestampSource, /const timestampLabel = formatTime\(messageItem\?\.timestamp\);/);
  assert.doesNotMatch(messageTimestampSource, /formatTimestamp/);
  assert.match(messageListSource, /function MessageDateDivider\(\{ timestamp, placement = "start" \}\)/);
  assert.match(messageListSource, /const dayLabel = formatDayLabel\(timestamp\);/);
  assert.match(messageListSource, /const shouldShowStartDayDivider = !previousMessageDayKey \|\| previousMessageDayKey !== messageDayKey;/);
  assert.match(messageListSource, /<MessageDateDivider timestamp=\{messageItem\.timestamp\} placement="start" \/>/);
  assert.doesNotMatch(messageListSource, /shouldShowEndDayDivider/);
  assert.doesNotMatch(messageListSource, /<MessageDateDivider timestamp=\{messageItem\.timestamp\} placement="end" \/>/);
  assert.match(messageLayoutCss, /\.message-date-divider::before,[\s\S]*?\.message-date-divider::after \{[\s\S]*?height: 1px;/);
  assert.match(dateTextRule, /background: transparent;/);
  assert.match(dateTextRule, /border: 0;/);
  assert.match(dateTextRule, /box-shadow: none;/);
});

test("direct chat topbar renders user presence on a second line", () => {
  const friendsSource = readRepoFile("src/components/FriendsWorkspace.jsx");
  const friendsCss = readRepoFile("src/css/FriendsWorkspace.css");
  const topbarStart = friendsSource.indexOf('className="chat__topbar friends-direct-chat-topbar"');
  const topbarEnd = friendsSource.indexOf('className="chat__topbar-actions friends-direct-chat-topbar__actions"', topbarStart);
  const topbarSource = friendsSource.slice(topbarStart, topbarEnd);

  assert.match(topbarSource, /friends-direct-chat-topbar__avatar/);
  assert.match(topbarSource, /currentDirectTopbarAvatar/);
  assert.match(topbarSource, /friends-direct-chat-topbar__presence/);
  assert.match(topbarSource, /formatUserPresenceStatus\(currentDirectFriend\)/);
  assert.doesNotMatch(topbarSource, /chat__topbar-copy-name--online/);
  assert.match(topbarSource, /currentConversationTarget \? \(/);
  assert.match(topbarSource, /участников/);
  assert.match(friendsCss, /\.friends-direct-chat-topbar \.chat__topbar-copy \{[\s\S]*?flex-direction: column;[\s\S]*?align-items: flex-start;/);
  assert.match(friendsCss, /\.friends-direct-chat-topbar__presence \{[\s\S]*?display: block;/);
});

test("personal chat memoization ignores volatile presence fields", () => {
  const textChatSource = readRepoFile("src/components/TextChat.jsx");
  const comparatorStart = textChatSource.indexOf("function areUserLikeEntriesEqual");
  const comparatorEnd = textChatSource.indexOf("function areRoleEntriesEqual", comparatorStart);
  const comparatorSource = textChatSource.slice(comparatorStart, comparatorEnd);

  assert.match(comparatorSource, /directChannelId/);
  assert.match(comparatorSource, /isBlocked/);
  assert.match(comparatorSource, /blockedYou/);
  assert.doesNotMatch(comparatorSource, /lastSeenAt|last_seen_at/);
  assert.doesNotMatch(comparatorSource, /isOnline|is_online|online/);
});

test("voice channel status editing is not rendered in the channel list", () => {
  const voiceChannelSource = readRepoFile("src/components/VoiceChannelList.jsx");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const channelActionsSource = readRepoFile("src/features/menu-main/useMenuMainChannelActions.js");

  assert.doesNotMatch(voiceChannelSource, /canEditChannelStatus/);
  assert.doesNotMatch(voiceChannelSource, /statusEditor/);
  assert.doesNotMatch(voiceChannelSource, /voice-channel__status-button/);
  assert.doesNotMatch(voiceChannelSource, /Выбрать статус канала/);
  assert.doesNotMatch(workspaceSource, /canEditChannelStatus=\{canEditVoiceChannelStatus\}/);
  assert.doesNotMatch(workspaceSource, /onUpdateChannelStatus=/);
  assert.match(channelActionsSource, /canEditVoiceChannelStatus = false/);
  assert.match(channelActionsSource, /delete safePatch\.status;/);
});

test("mobile direct chat topbar keeps avatar and renders user presence below the title", () => {
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const mobileMenuCss = readRepoFile("src/css/MenuMainMobile.css");
  const mobileStart = workspaceSource.indexOf("export const MobileDirectChat =");
  const mobileExportEnd = workspaceSource.indexOf("export default", mobileStart);
  const mobileEnd = mobileExportEnd === -1 ? workspaceSource.length : mobileExportEnd;
  const mobileSource = workspaceSource.slice(mobileStart, mobileEnd);

  assert.match(mobileSource, /chat__topbar-mobile-avatar/);
  assert.match(mobileSource, /mobileDirectAvatar/);
  assert.match(mobileSource, /chat__topbar-presence/);
  assert.match(mobileSource, /formatUserPresenceStatus\(currentDirectFriend\)/);
  assert.match(mobileMenuCss, /\.chat__topbar--mobile-direct \.chat__topbar-copy \{[\s\S]*?flex-direction: column;[\s\S]*?align-items: flex-start;/);
  assert.match(mobileMenuCss, /\.chat__topbar-presence \{[\s\S]*?display: block;/);
});

test("appearance settings nav item uses a single-word label and plain star icon", () => {
  const modelSource = readRepoFile("src/utils/menuMainModel.js");
  const overlaysSource = readRepoFile("src/components/MenuMainOverlays.jsx");
  const iconStart = overlaysSource.indexOf("appearance_accessibility: (");
  const iconEnd = overlaysSource.indexOf("memory: (", iconStart);
  const iconSource = overlaysSource.slice(iconStart, iconEnd);

  assert.match(modelSource, /\{ id: "appearance_accessibility", label: "Оформление", section: "Приложение" \}/);
  assert.match(iconSource, /M12 4\.5 13\.8 9l4\.7\.35-3\.6 3\.05 1\.1 4\.6-4-2\.45L8 17l1\.1-4\.6-3\.6-3\.05L10\.2 9 12 4\.5Z/);
  assert.doesNotMatch(iconSource, /M4\.5 19\.5h15/);
});

test("text chat does not render a floating date pinned to the top center", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const textChatCss = readRepoFile("src/css/TextChat.css");

  assert.doesNotMatch(messageListSource, /messages-floating-date/);
  assert.doesNotMatch(textChatCss, /\.messages-floating-date/);
});

test("role assignment errors use in-app status instead of alert", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");

  assert.doesNotMatch(controllerSource, /window\.alert/);
  assert.match(controllerSource, /pushWorkspaceStatusToast\(error instanceof Error\s*\?\s*error\.message\s*:\s*"Не удалось назначить роль\.",\s*"danger"\)/);
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

test("text chat scroll positions persist per user and channel", () => {
  const scrollManagerSource = readRepoFile("src/hooks/useTextChatScrollManager.js");

  assert.match(scrollManagerSource, /const TEXT_CHAT_SCROLL_STATE_ENABLED = true;/);
  assert.match(scrollManagerSource, /writeTextChatScrollState\(payload\.userId, payload\.channelId, payload\.state\)/);
  assert.match(scrollManagerSource, /readTextChatScrollState\(currentUserId, scopedChannelId\)/);
  assert.match(scrollManagerSource, /scheduleScrollStateWrite\(\{\s*anchorMessageId,/);
});

test("avatar crop editor exposes vertical positioning control", () => {
  const editorSource = readRepoFile("src/components/MediaFrameEditorModal.jsx");
  const editorCss = readRepoFile("src/css/MediaFrameEditorModal.css");

  assert.match(editorSource, /const handleVerticalPositionChange = \(event\) => \{/);
  assert.match(editorSource, /ariaLabel="Положение аватара вверх и вниз"/);
  assert.match(editorSource, /value=\{normalizedDraftFrame\.y\}/);
  assert.match(editorSource, />\s*Сохранить\s*</);
  assert.match(editorCss, /\.media-frame-editor__dialog--avatar \{[\s\S]*?overflow-y: auto;/);
  assert.match(editorCss, /\.media-frame-editor__avatar-stage \{[\s\S]*?min-height: clamp\(/);
});

test("avatar frame survives text chat profile updates", () => {
  const mediaFramesSource = readRepoFile("src/utils/mediaFrames.js");
  const profileCss = readRepoFile("src/css/MenuProfile.css");
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const textChatControllerSource = readRepoFile("src/features/text-chat/TextChatController.jsx");

  assert.match(mediaFramesSource, /"--media-frame-zoom": frame\.zoom/);
  assert.match(mediaFramesSource, /transform: "scale\(var\(--media-frame-zoom, 1\)\)"/);
  assert.doesNotMatch(profileCss, /\.avatar-shell--speaking \.avatar \{[\s\S]*?animation:/);
  assert.match(messageListSource, /frame=\{messageItem\.avatarFrame/);
  assert.match(textChatControllerSource, /import \{ parseMediaFrame \} from "\.\.\/\.\.\/utils\/mediaFrames";/);
  assert.match(textChatControllerSource, /const nextAvatarFrame = parseMediaFrame\(payload\?\.avatar_frame, payload\?\.avatarFrame\);/);
  assert.match(textChatControllerSource, /avatarFrame: resolvedAvatarFrame/);
});

test("microphone test and auto sensitivity are wired to the voice client", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const processingSource = readRepoFile("src/features/menu-main/useMenuMainVoiceProcessing.js");
  const voiceClientSource = readRepoFile("src/webrtc/livekitVoiceRoomClient.js");
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const storageSource = readRepoFile("src/features/menu-main/menuMainWorkspaceStorage.js");

  assert.match(controllerSource, /setIsMicMuted\(false\);\s*setIsMicTestActive\(true\);/);
  assert.match(controllerSource, /if\s*\(isMicTestActive\)\s*\{\s*setIsMicTestActive\(false\);\s*setIsMicMuted\(false\);/);
  assert.match(controllerSource, /voiceClient\.startMicrophoneTestPlayback\?\.\(\)/);
  assert.match(controllerSource, /voiceClient\.stopMicrophoneTestPlayback\?\.\(\)/);
  assert.match(voiceClientSource, /async startMicrophoneTestPlayback\(\) \{\s*microphoneMonitorActive = true;\s*await ensureAudioPipeline\(\);\s*await connectMicrophoneMonitor\(\);/);
  assert.match(voiceClientSource, /microphoneMonitorAudioElement\.muted = false;/);
  assert.match(controllerSource, /const\s+activeMicSettingsBars\s*=\s*getMeterActiveBars\(micLevel,\s*32\);/);
  assert.match(settingsSource, /Array\.from\(\{ length: 32 \}\)/);
  assert.match(storageSource, /nd:auto-input-sensitivity:/);
  assert.match(storageSource, /nd:manual-input-sensitivity-db:/);
  assert.match(settingsSource, /Порог срабатывания микрофона: \{Math\.round\(manualInputSensitivityDb\)\} dB/);
  assert.match(settingsSource, /formatValue=\{\(value\) => `\$\{Math\.round\(value\)\} dB`\}/);
  assert.match(processingSource, /client\.setAutoInputSensitivity\?\.\(currentVoiceProcessingState\.autoInputSensitivity\)/);
  assert.match(processingSource, /client\.setManualInputSensitivityDb\?\.\(currentVoiceProcessingState\.manualInputSensitivityDb\)/);
  assert.match(processingSource, /voiceClientRef\.current\.setAutoInputSensitivity\?\.\(autoInputSensitivity\)/);
  assert.match(processingSource, /voiceClientRef\.current\.setManualInputSensitivityDb\?\.\(manualInputSensitivityDb\)/);
  assert.match(voiceClientSource, /let autoInputSensitivityEnabled = true;/);
  assert.match(voiceClientSource, /let manualInputSensitivityDb = -42;/);
  assert.match(voiceClientSource, /async setAutoInputSensitivity\(enabled\)/);
  assert.match(voiceClientSource, /async setManualInputSensitivityDb\(value\)/);
  assert.match(voiceClientSource, /const adaptiveOpenThreshold = autoInputSensitivityEnabled/);
});

test("self voice mute sync ignores stale local echo from rapid toggles", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const syncHookSource = readRepoFile("src/features/menu-main/useMenuMainSelfVoiceStateSync.js");
  const voiceClientSource = readRepoFile("src/webrtc/livekitVoiceRoomClient.js");
  const voiceHubSource = readRepoFile("BackNoDiscord/BackNoDiscord/VoiceHub.cs");

  assert.match(syncHookSource, /latestSelfVoiceStateVersionRef/);
  assert.match(syncHookSource, /clientStateVersion: latestSelfVoiceStateVersionRef\.current/);
  assert.match(syncHookSource, /const isSelfVoiceStateEchoStale = useCallback/);
  assert.match(controllerSource, /isSelfVoiceStateEchoStale\(clientStateVersion\)/);
  assert.match(controllerSource, /if\s*\(!isStaleLocalEcho\s*\|\|\s*normalizedMicForced\)\s*\{[\s\S]*?setIsMicMuted/);
  assert.match(controllerSource, /if\s*\(!isStaleLocalEcho\s*\|\|\s*normalizedSoundForced\)\s*\{[\s\S]*?setIsSoundMuted/);
  assert.match(voiceClientSource, /clientStateVersion: Number\(payload\?\.clientStateVersion \?\? payload\?\.ClientStateVersion \?\? 0\)/);
  assert.match(voiceClientSource, /UpdateVoiceState", String\(currentUser\.id\), Boolean\(isMicMuted\), Boolean\(isDeafened\), Number\(clientStateVersion \|\| 0\)/);
  assert.match(voiceHubSource, /UpdateVoiceState\(string targetUserId, bool isMicMuted, bool isDeafened, long clientStateVersion = 0\)/);
  assert.match(voiceHubSource, /ClientStateVersion = isSelfUpdate \? clientStateVersion : 0/);
});

test("self headphones mute only unmutes microphone when it muted microphone automatically", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const mobileSource = readRepoFile("src/components/MobileVoiceRoom.jsx");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const overlaysSource = readRepoFile("src/components/MenuMainOverlays.jsx");

  assert.match(controllerSource, /const\s+micMutedBySoundMuteRef\s*=\s*useRef\(false\);/);
  assert.match(controllerSource, /micMutedBySoundMuteRef\.current\s*=\s*false;[\s\S]*?return nextValue;/);
  assert.match(controllerSource, /const\s+shouldAutoMuteMic\s*=\s*nextValue\s*&&\s*!isMicMuted;/);
  assert.match(controllerSource, /micMutedBySoundMuteRef\.current\s*=\s*shouldAutoMuteMic;/);
  assert.match(controllerSource, /if\s*\(\s*shouldAutoMuteMic\s*\)\s*\{[\s\S]*?setIsMicMuted\(true\);[\s\S]*?\}/);
  assert.match(controllerSource, /if\s*\(!nextValue\s*&&\s*micMutedBySoundMuteRef\.current\)\s*\{[\s\S]*?micMutedBySoundMuteRef\.current\s*=\s*false;[\s\S]*?setIsMicMuted\(false\);[\s\S]*?\}/);
  assert.match(controllerSource, /const\s+shouldMutePublishedMic\s*=\s*isMicMuted\s*\|\|\s*\(?Boolean\(currentVoiceChannel\)\s*&&\s*isMicTestActive\)?;/);
  assert.match(controllerSource, /const\s+normalizedMicMuted\s*=\s*Boolean\(nextMicMuted\);/);
  assert.match(stageSource, /const isEffectiveMicMuted = Boolean\(isMicMuted\);/);
  assert.match(mobileSource, /const isEffectiveMicMuted = Boolean\(isMicMuted\);/);
  assert.doesNotMatch(profileSource, /isMicMuted \|\| isSoundMuted \? "profile__mini-icon--slashed"/);
  assert.match(overlaysSource, /const isEffectiveMicMuted = Boolean\(isMicMuted\);/);
});

test("voice settings microphone meter stays compact", () => {
  const profileDeviceCss = readRepoFile("src/css/MenuProfileDeviceMenu.css");
  const mainCss = readRepoFile("src/css/MenuMain.css");

  assert.match(profileDeviceCss, /\.device-menu__meter span \{\s*height: 7px;/);
  assert.match(mainCss, /\.voice-settings-card--voice \.voice-settings-meter \{\s*margin-top: 22px;\s*gap: 12px;/);
});

test("voice settings hide denoiser engine choices but keep input profiles", () => {
  const panelsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const rendererSource = readRepoFile("src/features/menu-main/MenuMainSettingsRenderer.jsx");

  assert.doesNotMatch(panelsSource, /Движок шумоподавления|name="denoiserMode"|onDenoiserModeChange/);
  assert.doesNotMatch(rendererSource, /denoiserModeOptions|audioDenoiserMode|onDenoiserModeChange/);
  assert.match(panelsSource, /Профиль ввода/);
  assert.match(panelsSource, /name="noiseProfile"/);
});

test("profile device menu styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const profileDeviceCss = readRepoFile("src/css/MenuProfileDeviceMenu.css");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");

  assert.match(profileSource, /import "\.\.\/css\/MenuProfileDeviceMenu\.css";/);
  assert.match(profileDeviceCss, /\.device-menu \{/);
  assert.match(profileDeviceCss, /\.device-menu__panel \{/);
  assert.match(profileDeviceCss, /html\[data-ui-theme="light"\] \.device-menu__panel/);
  assert.doesNotMatch(mainCss, /device-menu/);
});

test("voice profile option styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const voiceProfileCss = readRepoFileIfExists("src/css/MenuVoiceProfileSettings.css");
  const panelsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");

  assert.match(panelsSource, /import "\.\.\/css\/MenuVoiceProfileSettings\.css";/);
  assert.match(voiceProfileCss, /\.voice-profile-list \{/);
  assert.match(voiceProfileCss, /\.voice-profile-option \{/);
  assert.match(voiceProfileCss, /html\[data-ui-theme="light"\] \.voice-profile-option__copy strong/);
  assert.doesNotMatch(mainCss, /^\s*\.voice-profile-list[^\n{]*\{/m);
  assert.doesNotMatch(mainCss, /^\s*\.voice-profile-option[^\n{]*\{/m);
  assert.doesNotMatch(mainCss, /^html\[data-ui-theme="light"\] \.voice-profile-option/m);
});

test("server invite feedback styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const feedbackCss = readRepoFileIfExists("src/css/MenuMainInviteFeedback.css");
  const overlaySource = readRepoFile("src/features/menu-main/MenuMainOverlayLayer.jsx");

  assert.match(overlaySource, /import "\.\.\/\.\.\/css\/MenuMainInviteFeedback\.css";/);
  assert.match(feedbackCss, /\.server-invite-feedback \{/);
  assert.match(feedbackCss, /\.server-invite-feedback--mobile \{/);
  assert.doesNotMatch(mainCss, /^\s*\.server-invite-feedback[^\n{]*\{/m);
});

test("account session styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const sessionsCss = readRepoFileIfExists("src/css/AccountSessionsPanel.css");
  const sessionsSource = readRepoFile("src/features/account-security/AccountSessionsPanel.jsx");

  assert.match(sessionsSource, /import "\.\.\/\.\.\/css\/AccountSessionsPanel\.css";/);
  assert.match(sessionsCss, /\.device-sessions-panel \{/);
  assert.match(sessionsCss, /\.device-session-card \{/);
  assert.match(sessionsCss, /html\[data-ui-theme="light"\] \.device-session-card/);
  assert.match(sessionsCss, /html\[data-ui-theme="light"\] \.device-session-card__copy strong/);
  assert.match(sessionsCss, /html\[data-ui-theme="light"\] \.device-session-card__meta b/);
  assert.match(sessionsCss, /html\[data-ui-theme="light"\] \.device-session-card__badge/);
  assert.doesNotMatch(mainCss, /^\s*\.device-sessions-panel[^\n{]*\{/m);
  assert.doesNotMatch(mainCss, /^\s*\.device-session-card[^\n{]*\{/m);
  assert.doesNotMatch(mainCss, /^html\[data-ui-theme="light"\] \.device-session-card/m);
});

test("account settings card styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const accountCss = readRepoFileIfExists("src/css/MenuAccountSettings.css");
  const panelsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");

  assert.match(panelsSource, /import "\.\.\/css\/MenuAccountSettings\.css";/);
  assert.match(accountCss, /\.account-settings-card \{/);
  assert.match(accountCss, /\.account-settings-card__grid \{/);
  assert.match(accountCss, /html\[data-ui-theme="light"\] \.account-settings-card/);
  assert.doesNotMatch(mainCss, /^\s*\.account-settings-card[^\n{]*\{/m);
  assert.doesNotMatch(mainCss, /^html\[data-ui-theme="light"\] \.account-settings-card/m);
});

test("server management settings are hidden without permissions", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");

  assert.match(controllerSource, /if\s*\(item\.id\s*===\s*"server"\s*&&\s*!canManageServer\)\s*\{/);
  assert.match(controllerSource, /if\s*\(item\.id\s*===\s*"roles"\s*&&\s*!canManageRoles\)\s*\{/);
  assert.doesNotMatch(controllerSource, /SETTINGS_NAV_ITEMS\.find\(\(item\) => item\.id === settingsTab\)/);
});

test("server audit log has a dedicated role permission and settings page", () => {
  const modelSource = readRepoFile("src/utils/menuMainModel.js");
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const rendererSource = readRepoFile("src/features/menu-main/MenuMainSettingsRenderer.jsx");
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const auditSettingsSource = readRepoFile("src/components/ServerAuditLogSettings.jsx");
  const backendPermissionSource = readRepoFile("BackNoDiscord/BackNoDiscord/Security/ServerPermissionEvaluator.cs");
  const backendControllerSource = readRepoFile("BackNoDiscord/BackNoDiscord/Controllers/ServerInvitesController.cs");

  assert.match(modelSource, /view_audit_log: "Просмотр журнала действий"/);
  assert.match(modelSource, /\{ id: "audit_log", label: "Журнал действий", section: "Текущий сервер" \}/);
  assert.match(controllerSource, /const canViewAuditLog=useMemo\(\(\)=>canManageServer\|\|hasServerPermission\(activeServer,currentUserId,"view_audit_log"\)/);
  assert.match(controllerSource, /item\.id==="audit_log"&&!canViewAuditLog\)\{return false;[\s\S]*?\}return true;/);
  assert.match(controllerSource, /settingsTab!=="audit_log"/);
  assert.match(rendererSource, /case "audit_log":/);
  assert.match(rendererSource, /<ServerAuditLogSettings/);
  assert.doesNotMatch(settingsSource, /<h4>Журнал действий<\/h4>/);
  assert.match(auditSettingsSource, /export default function ServerAuditLogSettings/);
  assert.match(backendPermissionSource, /CanViewAuditLog/);
  assert.match(backendControllerSource, /ServerPermissionEvaluator\.CanViewAuditLog\(snapshot, currentUser\.UserId\)/);
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

test("speaking indicators stay out of the bottom profile avatar", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const stageCss = readRepoFile("src/css/VoiceRoomStage.css");
  const channelCss = readRepoFile("src/css/ListChannels.css");
  const profileCss = readRepoFile("src/css/MenuProfile.css");

  assert.match(`${mainCss}\n${stageCss}`, /@keyframes voice-speaking-card-pulse/);
  assert.match(`${mainCss}\n${stageCss}`, /@keyframes voice-speaking-avatar-pulse/);
  assert.match(channelCss, /\.participant-item__avatar-shell \{[\s\S]*?border: 0;/);
  assert.match(channelCss, /\.participant-item--speaking \.participant-item__avatar-shell \{[\s\S]*?box-shadow: 0 0 0 2px rgba\(86, 220, 124, 0\.86\), 0 0 0 4px rgba\(86, 220, 124, 0\.14\);/);
  assert.doesNotMatch(channelCss, /@keyframes participant-speaking-avatar-pulse/);
  assert.doesNotMatch(channelCss, /\.participant-item--speaking \.participant-item__avatar-shell \{[^}]*animation:/);
  assert.match(stageCss, /\.voice-room-stage__card--speaking,[\s\S]*?\.voice-room-stage__strip-card--speaking \{[\s\S]*?border-color: rgba\(80, 214, 137, 0\.72\);/);
  assert.doesNotMatch(profileCss, /\.avatar-shell--speaking \.avatar \{[\s\S]*?animation: profile-speaking-avatar-pulse/);
  assert.doesNotMatch(profileCss, /@keyframes profile-speaking-avatar-pulse/);
  assert.match(profileCss, /\.menu__profile--voice-connected \.avatar-shell::after \{[\s\S]*?background: #65e48f;/);
});

test("light theme text tools menu is opaque and readable", () => {
  const composerPopoversCss = readRepoFileIfExists("src/css/TextChatComposerPopovers.css");

  assert.match(composerPopoversCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu \{[\s\S]*?background: #ffffff;/);
  assert.match(composerPopoversCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu \{[\s\S]*?backdrop-filter: none;/);
  assert.match(composerPopoversCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu__action b/);
  assert.match(composerPopoversCss, /html\[data-ui-theme="light"\] \.composer-text-tools-menu__action small/);
});

test("message search input text is readable on dark chat topbar", () => {
  const mobileMenuCss = readRepoFile("src/css/MenuMainMobile.css");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const searchIconSource = readRepoFile("public/icons/search.svg");

  assert.match(mobileMenuCss, /\.chat__topbar-search \{[\s\S]*?color: #c8cfdd;/);
  assert.match(mobileMenuCss, /\.chat__topbar-search \{[\s\S]*?caret-color: #c8cfdd;/);
  assert.match(mobileMenuCss, /\.chat__topbar-search \{[\s\S]*?font-weight: 500;/);
  assert.match(mobileMenuCss, /\.chat__topbar \{[\s\S]*?min-height: 58px;/);
  assert.match(mobileMenuCss, /\.chat__topbar \{[\s\S]*?padding: 8px 24px 8px 18px;/);
  assert.match(mobileMenuCss, /\.chat__topbar-symbol \{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/);
  assert.match(mobileMenuCss, /\.chat__topbar-copy \.chat__topbar-name \{[\s\S]*?color: #eef2f8;[\s\S]*?font-size: 21px;[\s\S]*?font-weight: 600;/);
  assert.match(mobileMenuCss, /\.chat__topbar-search-wrap \{[\s\S]*?width: min\(300px, 24vw\);/);
  assert.match(mobileMenuCss, /\.chat__topbar-search::placeholder \{[\s\S]*?color: #aeb6c6;/);
  assert.match(workspaceSource, /className="bi bi-hash"/);
  assert.match(searchIconSource, /class="bi bi-search"/);
  assert.doesNotMatch(workspaceSource, /Текстовый канал сервера/);
  assert.doesNotMatch(workspaceSource, /Форум сервера/);
});

test("release performance gate keeps small bundle budget drift from blocking deploys", () => {
  const perfAuditSource = readRepoFile("scripts/perf-audit.mjs");

  assert.match(perfAuditSource, /const bundleBudgetGraceBytes = 8 \* 1024;/);
  assert.match(perfAuditSource, /const maxBytesWithGrace = maxBytes \+ bundleBudgetGraceBytes;/);
  assert.match(perfAuditSource, /if \(asset\.bytes > maxBytesWithGrace\) \{/);
  assert.match(perfAuditSource, /release grace/);
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

test("admin report events open a detailed decision dialog", () => {
  const adminCss = readRepoFile("src/css/AdminSecurity.css");
  const dialogSource = readRepoFile("src/components/AdminReportDecisionDialog.jsx");
  const panelsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");

  assert.match(panelsSource, /const \[selectedReportEvent, setSelectedReportEvent\] = useState\(null\);/);
  assert.match(panelsSource, /<AdminReportDecisionDialog/);
  assert.match(panelsSource, /onClick=\{\(\) => setSelectedReportEvent\(event\)\}/);
  assert.doesNotMatch(panelsSource, /onClick=\{\(\) => dismissReport\(event\)\}/);
  assert.match(dialogSource, /className="admin-report-dialog__backdrop"/);
  assert.match(dialogSource, /От кого жалоба/);
  assert.match(dialogSource, /На кого жалоба/);
  assert.match(dialogSource, /Забанить нарушителя/);
  assert.match(dialogSource, /Отклонить и уведомить/);
  assert.match(adminCss, /\.admin-report-dialog__backdrop \{/);
  assert.match(adminCss, /\.admin-risk-event-list \{[\s\S]*?max-height:/);
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
  const rendererSource = readRepoFile("src/features/menu-main/MenuMainSettingsRenderer.jsx");
  const auditSettingsSource = readRepoFile("src/components/ServerAuditLogSettings.jsx");
  const mutationStart = menuSource.search(/const\s+mutateServerRoles\s*=\s*async/);
  const createRoleStart = menuSource.search(/const\s+createServerRole\s*=/);
  const mutationSource = menuSource.slice(mutationStart, createRoleStart);

  assert.match(mutationSource, /await\s*refreshServerAuditLog\(requestServer\.id\)/);
  assert.match(menuSource, /onRefreshAuditLog\s*:\s*\(\)\s*=>\s*refreshServerAuditLog\(activeServer\?\.id\)/);
  assert.match(rendererSource, /onRefreshAuditLog=\{onRefreshAuditLog\}/);
  assert.match(auditSettingsSource, /const formatAuditDetails = \(entry\) =>/);
  assert.match(auditSettingsSource, /"server\.roles\.create": "Роль создана"/);
  assert.match(auditSettingsSource, /"server\.member\.role\.update": "Роль участника изменена"/);
  assert.match(auditSettingsSource, /onClick=\{refreshAuditLog\}/);
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

test("voice message controls stay bright and aligned", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");

  assert.match(textChatCss, /\.voice-message__bar \{[\s\S]*?background: rgba\(122, 196, 255, 0\.62\);/);
  assert.match(textChatCss, /\.voice-message__time \{[\s\S]*?color: rgba\(114, 190, 255, 0\.98\);/);
  assert.match(textChatCss, /\.voice-message__speed \{[\s\S]*?right: 42px;[\s\S]*?top: 17px;[\s\S]*?background: rgba\(72, 154, 224, 0\.88\);/);
  assert.match(textChatCss, /\.msg-content--voice-only \.message-bottom-row--voice \.message-read-status \{[\s\S]*?align-self: center;[\s\S]*?height: 16px;[\s\S]*?transform: none;/);
  assert.match(textChatCss, /\.msg-content--voice-only \.message-bottom-row--voice \.message-read-status__check \{[\s\S]*?width: 8px;[\s\S]*?height: 12px;/);
});

test("server message authors do not render text role badges after nicknames", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const textChatCss = readRepoFile("src/css/TextChat.css");

  assert.match(messageListSource, /const authorRoleColorByUserId = useMemo/);
  assert.match(messageListSource, /style=\{authorRoleColor \? \{ color: authorRoleColor \} : undefined\}/);
  assert.doesNotMatch(messageListSource, /authorRoleBadge/);
  assert.doesNotMatch(messageListSource, /message-author__role-badge/);
  assert.doesNotMatch(textChatCss, /\.message-author__role-badge/);
});

test("voice stage toolbar buttons avoid native title tooltips", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const stageCss = readRepoFile("src/css/VoiceRoomStage.css");
  const mobileStageSource = readRepoFile("src/components/MobileVoiceRoom.jsx");

  assert.doesNotMatch(stageSource, /title=\{label\}/);
  assert.doesNotMatch(stageSource, /title="Открыть сцену на весь экран"/);
  assert.match(stageSource, /aria-label=\{label\}/);
  assert.match(stageSource, /aria-label="Открыть сцену на весь экран"/);
  assert.match(stageCss, /\.voice-room-stage__toolbar-button::after \{[\s\S]*?content: attr\(aria-label\);/);
  assert.match(stageCss, /\.voice-room-stage__toolbar-button:hover::after,[\s\S]*?\.voice-room-stage__toolbar-button:focus-visible::after/);
  assert.doesNotMatch(mobileStageSource, /\stitle=/);
});

test("active voice stream chrome auto-hides after pointer inactivity", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const stageCss = readRepoFile("src/css/VoiceRoomStage.css");

  assert.match(stageSource, /stageChromeHideTimeoutRef/);
  assert.match(stageSource, /setStageChromeVisible\(false\);[\s\S]*?\}, 3000\);/);
  assert.match(stageSource, /onPointerMove=\{revealStageChrome\}/);
  assert.match(stageSource, /onPointerLeave=\{scheduleStageChromeHide\}/);
  assert.match(stageSource, /voice-room-stage__hero--chrome-visible/);
  assert.doesNotMatch(stageCss, /\.voice-room-stage--active-stream \.voice-room-stage__hero-top,[\s\S]*?display: none;/);
  assert.match(stageCss, /\.voice-room-stage__hero--chrome-visible \.voice-room-stage__hero-controls/);
  assert.match(stageCss, /\.voice-room-stage__hero--chrome-visible \.voice-room-stage__hero-top/);
  assert.doesNotMatch(stageSource, /voice-room-stage__hero-bottom/);
  assert.match(stageSource, /voice-room-stage__hero-stream-meta/);
  assert.match(stageSource, /VoiceStageIcon name="volume"/);
  assert.match(stageSource, /\(activeStage\.mode === "camera" \? "Камера" : "Экран"\)[\s\S]*?\{activeStage\.name\}/);
  assert.match(stageSource, /voice-room-stage__pill--quality/);
  assert.match(stageSource, /voice-room-stage__pill--live/);
  assert.doesNotMatch(stageSource, /voice-room-stage__hero-badge-avatar/);
  assert.doesNotMatch(stageSource, /voice-room-stage__hero-chat-icon/);
  assert.doesNotMatch(stageCss, /\.voice-room-stage__hero-badge-avatar/);
  assert.doesNotMatch(stageCss, /\.voice-room-stage__hero-chat-icon/);
  assert.match(stageSource, /кадров в секунду/);
  assert.match(stageCss, /\.voice-room-stage__hero-top \{[\s\S]*?background: rgba\(13, 14, 18, 0\.98\);/);
});

test("voice participant live badge uses lowercase on-air copy", () => {
  const voiceChannelSource = readRepoFile("src/components/VoiceChannelList.jsx");
  const listCss = readRepoFile("src/css/ListChannels.css");

  assert.match(voiceChannelSource, />\s*в эфире\s*<\/button>/);
  assert.doesNotMatch(voiceChannelSource, />\s*Стрим\s*<\/button>/);
  assert.match(listCss, /\.participant-live-badge \{[\s\S]*?text-transform: none;/);
  assert.match(listCss, /\.participant-live-badge \{[\s\S]*?letter-spacing: 0;/);
  assert.match(listCss, /\.participant-live-badge \{[\s\S]*?width: 64px;[\s\S]*?height: 20px;/);
  assert.match(listCss, /\.participant-live-badge \{[\s\S]*?font-size: 13px;/);
  assert.match(listCss, /\.participant-live-badge \{[\s\S]*?overflow: hidden;[\s\S]*?white-space: nowrap;/);
});

test("voice channel active card keeps participants outside the highlight without rendering status", () => {
  const voiceChannelSource = readRepoFile("src/components/VoiceChannelList.jsx");
  const listCss = readRepoFile("src/css/ListChannels.css");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const modelSource = readRepoFile("src/utils/menuMainModel.js");
  const serverStateSource = readRepoFile("BackNoDiscord/BackNoDiscord/Services/ServerStateService.cs");
  const serverInviteSource = readRepoFile("BackNoDiscord/BackNoDiscord/Services/ServerInviteService.cs");

  assert.doesNotMatch(voiceChannelSource, /normalizeVoiceChannelStatus/);
  assert.doesNotMatch(voiceChannelSource, /VOICE_CHANNEL_STATUS_CHAR_LIMIT/);
  assert.doesNotMatch(voiceChannelSource, /serverName = ""/);
  assert.doesNotMatch(voiceChannelSource, /voice-channel__status-button/);
  assert.doesNotMatch(workspaceSource, /serverName=\{activeServer\?\.name \|\| ""\}/);
  assert.doesNotMatch(workspaceSource, /onUpdateChannelStatus=/);
  assert.match(modelSource, /normalizedChannel\.status = normalizeVoiceChannelStatus\(channel\?\.status \?\? channel\?\.Status \?\? ""\);/);
  assert.match(serverStateSource, /channel\.Status = NormalizeVoiceChannelStatus\(channel\.Status\);/);
  assert.match(serverInviteSource, /public string Status \{ get; set; \} = string\.Empty;/);
  assert.doesNotMatch(listCss, /\.list__items--active \{[^}]*background:/);
  assert.match(listCss, /\.list__items--active \{[^}]*padding: 0;/);
  assert.match(listCss, /\.list__items--active > \.voice-channel__row \{[^}]*background:/);
  assert.match(listCss, /\.list__items--active > \.voice-channel__row \{[^}]*background: rgba\(255, 255, 255, 0\.085\);/);
  assert.match(listCss, /\.list__items--active > \.voice-channel__row \{[^}]*padding: 0;/);
  assert.match(listCss, /\.list__items--active > \.voice-channel__row \{[^}]*grid-template-columns: 42px minmax\(0, 1fr\);/);
  assert.match(voiceChannelSource, /className="voice-channel__icon-svg"/);
  assert.match(listCss, /\.voice-channel__icon \{[\s\S]*?width: 32px;[\s\S]*?height: 32px;[\s\S]*?flex: 0 0 32px;[\s\S]*?margin-left: 6px;/);
  assert.match(listCss, /\.list__items--active \.voice-channel__icon \{[\s\S]*?align-self: center;[\s\S]*?margin-top: 0;[\s\S]*?margin-left: 6px;/);
  assert.doesNotMatch(listCss, /\.list__items--active \.voice-channel__icon \{[\s\S]*?margin-top: 18px;/);
  assert.match(listCss, /\.voice-channel__icon-svg \{[\s\S]*?width: 22px;[\s\S]*?height: 22px;/);
  assert.match(listCss, /\.voice-channel__icon-svg \{[\s\S]*?fill: currentColor;/);
  assert.match(listCss, /html\[data-ui-theme="light"\] \.voice-channel__icon \{[\s\S]*?color: #1f2937;/);
  assert.match(listCss, /\.voice-channel__timer \{[\s\S]*?margin-left: auto;[\s\S]*?margin-right: 8px;[\s\S]*?text-align: right;/);
  assert.match(listCss, /\.participant-list \{[\s\S]*?padding: 0 0 10px 44px;/);
});

test("mobile voice room styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const mobileVoiceCss = readRepoFileIfExists("src/css/MobileVoiceRoom.css");
  const mobileVoiceSource = readRepoFile("src/components/MobileVoiceRoom.jsx");

  assert.doesNotMatch(mainCss, /\.mobile-voice-room/);
  assert.match(mobileVoiceCss, /\.mobile-voice-room/);
  assert.match(mobileVoiceSource, /import "\.\.\/css\/MobileVoiceRoom\.css";/);
});

test("profile voice action opens soundpad with a visible effects glyph", () => {
  const panelSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const slotSource = readRepoFile("src/features/menu-main/MenuMainProfilePanelSlot.jsx");
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const profileVoiceCss = readRepoFile("src/css/MenuMainProfileVoice.css");
  const mobileCss = readRepoFile("src/css/MenuMainMobile.css");

  assert.match(panelSource, /onOpenSoundboard,/);
  assert.match(panelSource, /onClick=\{onOpenSoundboard\} aria-label="Soundpad" data-tooltip="Soundpad"/);
  assert.match(panelSource, /onClick=\{onScreenShareAction\}[\s\S]*?onClick=\{isCameraShareActive \? onStopCameraShare : onOpenCamera\}[\s\S]*?onClick=\{onOpenSoundboard\}/);
  assert.match(panelSource, /ProfileQuickSoundpadIcon/);
  assert.match(panelSource, /ProfileLeaveCallIcon/);
  assert.match(panelSource, /viewBox="0 0 16 16"[\s\S]*?fillRule="evenodd"/);
  assert.match(mobileCss, /\.profile__leave-call-icon \{[\s\S]*?width: 22px;[\s\S]*?transform: rotate\(135deg\);/);
  assert.match(panelSource, /className="profile__connection-actions"[\s\S]*?className="profile__leave-call-button ui-tooltip-anchor"[\s\S]*?onClick=\{onLeaveVoiceChannel\}/);
  assert.match(panelSource, /profile__quick-glyph profile__quick-glyph--soundpad/);
  assert.doesNotMatch(panelSource, /profile__quick-button profile__quick-button--danger[\s\S]*?onClick=\{onLeaveVoiceChannel\}/);
  assert.match(slotSource, /onOpenSoundboard=\{openSoundboard\}/);
  assert.match(controllerSource, /openSoundboard:stableOpenSoundboard/);
  assert.match(profileVoiceCss, /\.profile__quick-glyph--soundpad \{/);
  assert.match(mobileCss, /\.profile__connection-card \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto;/);
  assert.match(mobileCss, /\.profile__quick-actions \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(mobileCss, /\.profile__leave-call-button:hover,[\s\S]*?background: #da3b45;/);
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

test("profile user reports use a modal dialog instead of an inline alert panel", () => {
  const profileSource = readRepoFile("src/components/TextChatProfileModal.jsx");
  const modalSource = readRepoFile("src/components/TextChatReportModal.jsx");
  const profileCss = readRepoFile("src/css/TextChatProfileModal.css");
  const reportModalCss = readRepoFileIfExists("src/css/TextChatReportModal.css");
  const profileBackdropZIndex = Number(profileCss.match(/\.chat-profile-modal-backdrop\s*\{[\s\S]*?z-index:\s*(\d+);/)?.[1] || 0);
  const reportModalZIndex = Number(reportModalCss.match(/\.chat-report-modal\s*\{[\s\S]*?z-index:\s*(\d+);/)?.[1] || 0);

  assert.match(profileSource, /import TextChatReportModal from "\.\/TextChatReportModal";/);
  assert.match(profileSource, /<TextChatReportModal[\s\S]*ariaLabel="Жалоба на пользователя"[\s\S]*title="Пожаловаться на пользователя"/);
  assert.match(profileSource, /onClick=\{\(\) => setReportOpen\(true\)\}/);
  assert.ok(reportModalZIndex > profileBackdropZIndex);
  assert.doesNotMatch(profileSource, /className="chat-profile-modal__report"/);
  assert.doesNotMatch(profileSource, /className="chat-profile-modal__report-actions"/);
  assert.match(modalSource, /title = "Пожаловаться"/);
  assert.match(modalSource, /ariaLabel = "Жалоба на сообщение"/);
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

test("conversation cards do not shift position on hover", () => {
  const friendsCss = readRepoFileIfExists("src/css/FriendsWorkspace.css");
  const conversationCardRule = friendsCss.match(/\.friends-conversation-card \{[\s\S]*?\n\}/)?.[0] || "";
  const hoverRule = friendsCss.match(/\.friends-conversation-card:hover \{[\s\S]*?\n\}/)?.[0] || "";

  assert.doesNotMatch(conversationCardRule, /transform 140ms ease/);
  assert.doesNotMatch(hoverRule, /transform:\s*translate/);
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

test("direct call overlay styles stay split from the main menu stylesheet", () => {
  const overlayLayerSource = readRepoFile("src/features/menu-main/MenuMainOverlayLayer.jsx");
  const friendsSource = readRepoFile("src/components/FriendsWorkspace.jsx");
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const directCallCss = readRepoFileIfExists("src/css/DirectCallOverlay.css");

  assert.match(overlayLayerSource, /import\("\.\.\/\.\.\/css\/DirectCallOverlay\.css"\)/);
  assert.match(friendsSource, /import "\.\.\/css\/DirectCallOverlay\.css";/);
  assert.doesNotMatch(mainCss, /\.direct-call-overlay/);
  assert.doesNotMatch(mainCss, /\.direct-call-inline/);
  assert.match(directCallCss, /\.direct-call-overlay/);
  assert.match(directCallCss, /\.direct-call-inline/);
});

test("direct call overlay stays compact on desktop", () => {
  const directCallCss = readRepoFileIfExists("src/css/DirectCallOverlay.css");

  assert.match(directCallCss, /\.direct-call-overlay\s*\{[\s\S]*?align-items: center;[\s\S]*?justify-content: center;[\s\S]*?padding: 28px;/);
  assert.match(directCallCss, /\.direct-call-overlay__workspace\s*\{[\s\S]*?width: min\(940px, calc\(100vw - 56px\)\);[\s\S]*?max-height: calc\(100vh - 56px\);/);
  assert.match(directCallCss, /\.direct-call-overlay__stage\s*\{[\s\S]*?min-height: clamp\(300px, 42vh, 440px\);/);
  assert.match(directCallCss, /\.direct-call-overlay__avatar\s*\{[\s\S]*?width: clamp\(112px, 14vw, 168px\);[\s\S]*?height: clamp\(112px, 14vw, 168px\);/);
});

test("direct call ringtone only uses bundled audio files", () => {
  const directCallSoundsSource = readRepoFile("src/utils/directCallSounds.js");

  assert.match(directCallSoundsSource, /direct-call-incoming\.wav/);
  assert.match(directCallSoundsSource, /direct-call-outgoing\.wav/);
  assert.doesNotMatch(directCallSoundsSource, /createOscillator|createPreferredAudioContext|startSynthTone|fallbackDelayMs/);
});

test("direct message chat sounds use the shared system sound volume", () => {
  const textChatSource = readRepoFile("src/features/text-chat/TextChatController.jsx");

  assert.match(textChatSource, /readSystemSoundVolumeRatio/);
  assert.doesNotMatch(textChatSource, /volume: type === "send" \? 0\.34 : 0\.4/);
  assert.doesNotMatch(textChatSource, /\], \{ volume: 0\.4, poolSize: 3 \}/);
});

test("system sound volume defaults to 80 percent for new users", () => {
  const soundVolumeSource = readRepoFile("src/utils/systemSoundVolume.js");
  const notificationSoundSource = readRepoFile("src/features/menu-main/useMenuMainNotificationSound.js");

  assert.match(soundVolumeSource, /export const DEFAULT_SYSTEM_SOUND_VOLUME = 80;/);
  assert.match(notificationSoundSource, /systemSoundVolume: DEFAULT_SYSTEM_SOUND_VOLUME/);
  assert.match(soundVolumeSource, /: DEFAULT_SYSTEM_SOUND_VOLUME;/);
});

test("system sound controls cover app events without controlling participant audio", () => {
  const systemSoundsSource = readRepoFile("src/utils/systemSounds.js");
  const notificationSettingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const directCallLifecycleSource = readRepoFile("src/features/menu-main/useMenuMainDirectCallLifecycle.js");

  assert.match(systemSoundsSource, /id: "shareStart"/);
  assert.match(systemSoundsSource, /id: "shareStop"/);
  assert.match(systemSoundsSource, /id: "directCallIncoming"/);
  assert.match(systemSoundsSource, /id: "directCallOutgoing"/);
  assert.match(notificationSettingsSource, /Не влияет на голоса участников/);
  assert.match(controllerSource, /isSystemSoundEventEnabled\(type\)/);
  assert.match(directCallLifecycleSource, /directCallIncoming/);
  assert.match(directCallLifecycleSource, /directCallOutgoing/);
});

test("text chat location picker styles stay split from the main chat stylesheet", () => {
  const pickerSource = readRepoFile("src/components/TextChatLocationPickerModal.jsx");
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const pickerCss = readRepoFileIfExists("src/css/TextChatLocationPicker.css");

  assert.match(pickerSource, /createPortal\(modal, document\.body\)/);
  assert.match(pickerSource, /import "\.\.\/css\/TextChatLocationPicker\.css";/);
  assert.doesNotMatch(textChatCss, /\.location-picker-modal/);
  assert.doesNotMatch(textChatCss, /\.location-picker-map/);
  assert.match(pickerCss, /\.location-picker-modal/);
  assert.match(pickerCss, /\.location-picker-map/);
});

test("location maps avoid CORS-only tile loading and use a quick geolocation pass", () => {
  const friendsSource = readRepoFile("src/components/FriendsWorkspace.jsx");
  const composerSource = readRepoFile("src/components/TextChatComposer.jsx");

  assert.match(friendsSource, /LANAYA_WORLD_BASE_TILE_URL/);
  assert.doesNotMatch(friendsSource, /crossOrigin:\s*true/);
  assert.match(friendsSource, /function|const constrainLanayaWorldMinZoom/);
  assert.match(friendsSource, /map\.getBoundsZoom\(LANAYA_WORLD_BOUNDS, true, LANAYA_WORLD_MIN_VISIBLE_ZOOM_PADDING\)/);
  assert.match(friendsSource, /map\.setMinZoom\(nextMinZoom\)/);
  assert.match(friendsSource, /map\.on\("resize", handleMapResize\)/);
  assert.match(composerSource, /LOCATION_FAST_GEOLOCATION_OPTIONS/);
  assert.match(composerSource, /LOCATION_ACCURACY_TIMEOUT_MS = 3200;/);
  assert.match(composerSource, /maximumAge:\s*60000/);
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
  assert.match(controllerSource, /name\s*:\s*normalizeServerNameInput\(value,\s*server\.name\s*\|\|\s*"Сервер"\)/);
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

test("local stream banner shows a friendly screen or window title", () => {
  const voiceClientUtilsSource = readRepoFile("src/webrtc/voiceClientUtils.js");
  const voiceClientSource = readRepoFile("src/webrtc/livekitVoiceRoomClient.js");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");

  assert.match(voiceClientUtilsSource, /const normalizeDisplayCaptureSourceTitle = \(sourceTitle = "", sourceId = ""\) =>/);
  assert.match(voiceClientUtilsSource, /return `Экран \$\{screenNumber\}`;/);
  assert.match(voiceClientUtilsSource, /return "Окно";/);
  assert.match(voiceClientSource, /normalizeDisplayCaptureSourceTitle\(/);
  assert.doesNotMatch(profileSource, /\$\{normalizedSourceTitle \|\| "Экран"\} \+ камера/);
  assert.match(profileSource, /normalizedSourceTitle \|\| \(isScreenShareActive \? "Экран в эфире" : "Камера в эфире"\)/);
});

test("active stream chrome keeps the segmented Discord-style controls", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const stageCss = readRepoFile("src/css/VoiceRoomStage.css");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const mobileSource = readRepoFile("src/components/MobileVoiceRoom.jsx");

  assert.match(stageSource, /key: "camera"[\s\S]*?label: isCameraShareActive \? "Остановить камеру" : "Включить камеру"/);
  assert.match(stageSource, /voice-room-stage__stream-toolbar-layout/);
  assert.match(stageSource, /VoiceStageIcon name="users-add"/);
  assert.match(stageSource, /voice-room-stage__stream-toolbar-center/);
  assert.match(stageSource, /const activeStageStopAction = activeStage\?\.kind === "local"/);
  assert.match(stageSource, /onMenuClick: onOpenVoiceSettings/);
  assert.match(stageSource, /onMenuClick: onOpenCameraSettings/);
  assert.match(stageSource, /onMenuClick: onOpenScreenShareSettings/);
  assert.match(stageSource, /key: "effects"[\s\S]*?onClick: onOpenSoundboard/);
  assert.match(stageSource, /renderFullscreenButton\("voice-room-stage__toolbar-button voice-room-stage__toolbar-button--ghost"\)/);
  assert.match(stageCss, /\.voice-room-stage--active-stream \{[\s\S]*?gap: 0;[\s\S]*?padding: 0;/);
  assert.match(stageCss, /\.voice-room-stage--active-stream \.voice-room-stage__hero \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(stageCss, /\.voice-room-stage__stream-toolbar-layout \{[\s\S]*?grid-template-columns: minmax\(44px, 1fr\) auto minmax\(44px, 1fr\);/);
  assert.match(stageCss, /\.voice-room-stage__stream-toolbar-center > \.voice-room-stage__toolbar-button--danger \{[\s\S]*?width: 78px;[\s\S]*?height: 58px;/);
  assert.match(stageCss, /\.voice-room-stage__hero-controls \.voice-room-stage__toolbar-group \{[\s\S]*?min-height: 58px;/);
  assert.match(stageCss, /\.voice-room-stage__toolbar-split \{[\s\S]*?width: 82px;/);
  assert.match(stageCss, /\.voice-room-stage__toolbar-split-divider \{[\s\S]*?width: 1px;[\s\S]*?background: rgba\(255, 255, 255, 0\.055\);[\s\S]*?box-shadow: none;/);
  assert.doesNotMatch(stageSource, /voice-room-stage__hero-person/);
  assert.doesNotMatch(stageCss, /\.voice-room-stage__hero-person/);
  assert.match(stageCss, /\.voice-room-stage__hero-top \{[\s\S]*?min-height: 52px;[\s\S]*?background: rgba\(13, 14, 18, 0\.98\);/);
  assert.match(stageSource, /VoiceStageIcon name="volume" className="voice-room-stage__hero-channel-icon"/);
  assert.match(stageSource, /case "leave":[\s\S]*?viewBox="0 0 24 24"[\s\S]*?fill="currentColor"/);
  assert.doesNotMatch(stageSource, /label: activeStage\.kind === "local" \? "Скрыть предпросмотр" : "Закрыть эфир"/);
  assert.match(profileSource, /aria-label=\{isCameraShareActive \? "Остановить камеру" : "Открыть камеру"\}/);
  assert.match(mobileSource, /aria-label=\{isCameraShareActive \? "Управление камерой" : "Открыть камеру"\}/);
});

test("voice stage idle toolbar matches stream controls without activities shortcut", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const stageCss = readRepoFile("src/css/VoiceRoomStage.css");
  const idleToolbarStart = stageSource.search(/\) : \(\s*<div className="voice-room-stage__toolbar" role="toolbar" aria-label="Управление голосовой комнатой">/);
  const idleToolbarEnd = stageSource.indexOf("voice-room-stage__toolbar-group voice-room-stage__toolbar-group--danger", idleToolbarStart);
  const idleToolbarSource = stageSource.slice(idleToolbarStart, idleToolbarEnd);

  assert.ok(idleToolbarStart >= 0, "idle toolbar source is present");
  assert.ok(idleToolbarEnd > idleToolbarStart, "idle toolbar source is bounded");
  assert.match(idleToolbarSource, /key: "mic"[\s\S]*?menuLabel: "Настройки микрофона"[\s\S]*?onMenuClick: onOpenVoiceSettings/);
  assert.match(idleToolbarSource, /key: "camera"[\s\S]*?menuLabel: "Настройки камеры"[\s\S]*?onMenuClick: onOpenCameraSettings/);
  assert.match(idleToolbarSource, /key: "screen"[\s\S]*?menuLabel: "Настройки трансляции"[\s\S]*?onMenuClick: onOpenScreenShareSettings/);
  assert.match(idleToolbarSource, /key: "effects"[\s\S]*?onClick: onOpenSoundboard/);
  assert.match(idleToolbarSource, /key: "more"[\s\S]*?onClick: onOpenVoiceSettings/);
  assert.doesNotMatch(idleToolbarSource, /key: "activities"/);
  assert.doesNotMatch(idleToolbarSource, /key: "headphones"/);
  assert.match(stageCss, /\.voice-room-stage__toolbar-group \{[\s\S]*?gap: 0;[\s\S]*?min-height: 58px;/);
  assert.match(stageCss, /\.voice-room-stage__toolbar-split \{[\s\S]*?width: 82px;/);
});

test("voice stage soundboard panel uploads short sounds and plays one at a time", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const overlaySource = readRepoFile("src/features/menu-main/MenuMainOverlayLayer.jsx");
  const hookSource = readRepoFile("src/features/menu-main/useMenuMainSoundboard.js");
  const panelSource = readRepoFile("src/features/menu-main/SoundboardPanel.jsx");
  const panelCss = readRepoFile("src/css/SoundboardPanel.css");
  const viewerSource = readRepoFile("src/components/ScreenShareViewer.jsx");

  assert.match(stageSource, /onOpenSoundboard/);
  assert.match(workspaceSource, /onOpenSoundboard=\{onOpenSoundboard\}/);
  assert.doesNotMatch(controllerSource, /useMenuMainSoundboard/);
  assert.match(controllerSource, /const\s+stableOpenSoundboard\s*=\s*useStableEvent\(\(\)\s*=>\s*setSoundboardOpen\(true\)\)/);
  assert.doesNotMatch(overlaySource, /import SoundboardPanel from "\.\/SoundboardPanel";/);
  assert.match(overlaySource, /const SoundboardPanel = lazy\(\(\) => import\("\.\/SoundboardPanel"\)\);/);
  assert.match(overlaySource, /\{sb && \(\s*<Suspense>\s*<SoundboardPanel/);
  assert.match(overlaySource, /<SoundboardPanel[\s\S]*?u=\{user\}/);
  assert.doesNotMatch(overlaySource, /open=\{soundboardOpen\}/);
  assert.match(hookSource, /const SOUNDBOARD_MAX_DURATION_SECONDS = 20;/);
  assert.match(hookSource, /audio\.duration > SOUNDBOARD_MAX_DURATION_SECONDS/);
  assert.match(hookSource, /activeAudioRef\.current\.pause\(\)/);
  assert.match(hookSource, /activeAudioRef\.current\.currentTime = 0/);
  assert.match(panelSource, /placeholder="Найдите идеальный звук"/);
  assert.match(hookSource, /readSystemSoundVolumeRatio\(user\)/);
  assert.match(hookSource, /sound\.volume/);
  assert.match(panelSource, /useMenuMainSoundboard\(\{[\s\S]*?user: u/);
  assert.match(panelSource, /accept="audio\/mpeg,audio\/wav,audio\/ogg,audio\/mp4,audio\/webm,audio\/\*"/);
  assert.match(panelSource, /Загрузить звук/);
  assert.match(panelSource, /soundboardEditor/);
  assert.match(panelSource, /soundboard-editor-modal/);
  assert.match(panelSource, /Редактировать звук/);
  assert.match(panelSource, /Громкость звука/);
  assert.match(panelSource, /Обрезка звука/);
  assert.match(panelSource, /Название звука/);
  assert.match(panelSource, /Соответствующее эмодзи/);
  assert.match(panelCss, /\.soundboard-panel-backdrop \{[\s\S]*?align-items: flex-end;/);
  assert.match(panelCss, /\.soundboard-panel-backdrop \{[\s\S]*?padding: 24px 420px 86px 24px;/);
  assert.match(panelCss, /\.soundboard-panel \{[\s\S]*?width: min\(560px, calc\(100vw - 32px\)\);/);
  assert.match(panelCss, /\.soundboard-panel \{[\s\S]*?max-height: min\(430px, calc\(100vh - 116px\)\);/);
  assert.match(panelCss, /\.soundboard-editor-modal \{/);
  assert.match(panelCss, /\.soundboard-panel__grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(viewerSource, /onOpenSoundboard/);
  assert.match(viewerSource, /icon="effects"[\s\S]*?onClick=\{onOpenSoundboard \|\| onOpenTextChat \|\| \(\(\) => \{\}\)\}/);
  assert.doesNotMatch(viewerSource, /icon="activities"[\s\S]*?label="Активности"/);
});

test("standalone stream viewer uses Discord-style top and bottom chrome", () => {
  const viewerSource = readRepoFile("src/components/ScreenShareViewer.jsx");
  const viewerCss = readRepoFile("src/css/ScreenShareViewer.css");
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const friendsSource = readRepoFile("src/components/FriendsWorkspace.jsx");

  assert.match(viewerSource, /stream-viewer__topbar/);
  assert.match(viewerSource, /stream-viewer__stream-meta/);
  assert.match(viewerSource, /stream-viewer__control-layout/);
  assert.match(viewerSource, /stream-viewer__control-center/);
  assert.match(viewerSource, /stream-viewer__control-group/);
  assert.match(viewerSource, /stream-viewer__control-button--menu/);
  assert.match(viewerSource, /label=\{isMicMuted \? "Включить микрофон" : "Выключить микрофон"\}/);
  assert.match(viewerSource, /label=\{isScreenShareActive \? "Остановить трансляцию экрана" : "Начать трансляцию экрана"\}/);
  assert.match(viewerSource, /stream-viewer__pill--quality/);
  assert.doesNotMatch(viewerSource, />\s*На весь экран\s*</);
  assert.doesNotMatch(viewerSource, />\s*Закрыть\s*</);
  assert.match(viewerCss, /\.stream-viewer__topbar \{[\s\S]*?top: 0;[\s\S]*?min-height: 52px;[\s\S]*?background: rgba\(13, 14, 18, 0\.98\);/);
  assert.match(viewerCss, /\.stream-viewer__control-layout \{[\s\S]*?grid-template-columns: minmax\(44px, 1fr\) auto minmax\(44px, 1fr\);/);
  assert.match(viewerCss, /\.stream-viewer__control-group \{[\s\S]*?min-height: 58px;/);
  assert.match(viewerCss, /\.stream-viewer__control-button--menu \{[\s\S]*?width: 82px;/);
  assert.match(workspaceSource, /channelName=\{currentVoiceChannelName \|\| selectedVoiceChannel\?\.name \|\| ""\}/);
  assert.match(workspaceSource, /onToggleMic=\{onToggleMic\}/);
  assert.match(workspaceSource, /onScreenShareAction=\{onScreenShareAction\}/);
  assert.match(workspaceSource, /onLeave=\{onLeave\}/);
  assert.doesNotMatch(workspaceSource, /import ScreenShareViewer from "\.\/ScreenShareViewer";/);
  assert.match(workspaceSource, /const loadScreenShareViewer = \(\) => recoverChunkImport\(\(\) => import\("\.\/ScreenShareViewer"\)\);/);
  assert.match(workspaceSource, /const ScreenShareViewer = lazy\(loadScreenShareViewer\);/);
  assert.match(workspaceSource, /<Suspense fallback=\{null\}>\s*<ScreenShareViewer/);
  assert.doesNotMatch(friendsSource, /import ScreenShareViewer from "\.\/ScreenShareViewer";/);
  assert.match(friendsSource, /const loadScreenShareViewer = \(\) => recoverChunkImport\(\(\) => import\("\.\/ScreenShareViewer"\)\);/);
});

test("clicking own stream opens local preview instead of remote loading state", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const menuControllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const selfShareBranch = stageSource.slice(
    stageSource.indexOf("if (participant.isSelf && participant.share) {"),
    stageSource.indexOf("if (participant.isLive && isInlineStreamActive) {"),
  );
  const watchStreamStart = menuControllerSource.search(/const\s+handleWatchStream\s*=/);
  const previewStreamStart = menuControllerSource.search(/const\s+handlePreviewStream\s*=/);
  const watchStreamHandler = menuControllerSource.slice(watchStreamStart, previewStreamStart);

  assert.match(selfShareBranch, /setInlineStreamUserIds\(\(previous\) => \{[\s\S]*?next\.add\(participantCardId\);[\s\S]*?return next;[\s\S]*?\}\);[\s\S]*?return;/);
  assert.doesNotMatch(selfShareBranch, /onPreviewStream\?\.\(participant\.userId\)/);
  assert.match(watchStreamHandler, /normalizedUserId\s*===\s*String\(\s*currentUserId\s*\|\|\s*""\s*\)/);
  assert.match(watchStreamHandler, /setFocusedRemoteShareUser\?\.\(""\)/);
  assert.match(watchStreamHandler, /openLocalSharePreview\(\);[\s\S]*?return;/);
  assert.doesNotMatch(watchStreamHandler, /requestScreenShare\(normalizedUserId\)[\s\S]*?normalizedUserId === String\(currentUserId/);
});

test("double clicking a stream card opens the active stream viewer", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const doubleClickHandler = stageSource.slice(
    stageSource.indexOf("const handleCardDoubleClick = (participant) => {"),
    stageSource.indexOf("const renderParticipantMeta = (participant) => {"),
  );

  assert.ok(doubleClickHandler.length > 0, "double click handler is present before participant meta rendering");
  assert.match(doubleClickHandler, /if \(participant\.isLive\) \{[\s\S]*?onWatchStream\?\.\(participant\.userId\);[\s\S]*?return;[\s\S]*?\}/);
  assert.match(doubleClickHandler, /if \(participant\.isSelf && participant\.share\) \{[\s\S]*?onWatchStream\?\.\(participant\.userId\);[\s\S]*?return;[\s\S]*?\}/);
  assert.match(stageSource, /onDoubleClick=\{\(\) => handleCardDoubleClick\(participant\)\}/);
});

test("local screen and camera shares render as separate live preview cards", () => {
  const stageSource = readRepoFile("src/components/VoiceRoomStage.jsx");
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");

  assert.match(controllerSource, /onLocalPreviewStreamChanged\s*:\s*\(\{\s*stream,\s*mode,\s*sourceTitle,\s*secondaryStream,\s*secondaryMode,\s*secondaryTitle\s*\}\)\s*=>/);
  assert.match(controllerSource, /secondaryStream\s*:\s*normalizedSecondaryStream/);
  assert.match(stageSource, /\(participants \|\| \[\]\)\.flatMap\(\(participant\) =>/);
  assert.match(stageSource, /localPreview\?\.secondaryStream/);
  assert.match(stageSource, /stageCardId: `\$\{userId\}:screen`/);
  assert.match(stageSource, /stageTitle: "Стрим"/);
  assert.match(stageSource, /stageCardId: `\$\{userId\}:camera`/);
  assert.match(stageSource, /stageTitle: "Вебкамера"/);
  assert.match(stageSource, /isInlineStreamActive \? \([\s\S]*?<VoiceStageMedia[\s\S]*?className="voice-room-stage__card-video"[\s\S]*?mirrored=\{participant\.isSelf && participant\.share\.mode === "camera"\}/);
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
  const pollComposerCss = readRepoFile("src/css/TextChatPollComposerModal.css");
  const composerSource = readRepoFile("src/components/TextChatPollComposerModal.jsx");
  const backdropRule = pollComposerCss.match(/\.poll-composer-backdrop \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(composerSource, /import \{ createPortal \} from "react-dom";/);
  assert.match(composerSource, /createPortal\(modal, document\.body\)/);
  assert.match(backdropRule, /position: fixed;/);
  assert.match(backdropRule, /inset: 0;/);
  assert.match(backdropRule, /min-width: 100vw;/);
  assert.match(backdropRule, /min-height: 100dvh;/);
  assert.match(backdropRule, /background: rgba\(3, 5, 12, 0\.72\);/);
  assert.match(backdropRule, /backdrop-filter: blur\(16px\);/);
  assert.match(backdropRule, /isolation: isolate;/);
  assert.match(backdropRule, /overscroll-behavior: contain;/);
});

test("poll composer modal styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const pollComposerCss = readRepoFile("src/css/TextChatPollComposerModal.css");
  const composerSource = readRepoFile("src/components/TextChatPollComposerModal.jsx");

  assert.match(composerSource, /import "\.\.\/css\/TextChatPollComposerModal\.css";/);
  assert.match(pollComposerCss, /\.poll-composer-modal \{/);
  assert.match(pollComposerCss, /html\[data-ui-theme="light"\] \.poll-composer-modal/);
  assert.doesNotMatch(textChatCss, /^\.poll-composer-backdrop \{/m);
  assert.doesNotMatch(textChatCss, /^\.poll-composer__/m);
});

test("manual profile status is editable, persisted, and rendered under the nickname", () => {
  const controllerSource = readRepoFile("src/features/menu-main/MenuMainController.jsx");
  const settingsSource = readRepoFile("src/components/MenuSettingsPanels.jsx");
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const slotSource = readRepoFile("src/features/menu-main/MenuMainProfilePanelSlot.jsx");
  const profileCss = readRepoFile("src/css/MenuProfile.css");

  assert.match(controllerSource, /MAX_PROFILE_STATUS_LENGTH/);
  assert.match(controllerSource, /profileStatus\s*:\s*user\?\.profile_status\s*\|\|\s*user\?\.profileStatus\s*\|\|\s*""/);
  assert.match(controllerSource, /profileStatus\s*:\s*nextProfileStatus/);
  assert.match(controllerSource, /profile_status\s*:\s*data\?\.profile_status\s*\?\?\s*data\?\.profileStatus\s*\?\?\s*nextProfileStatus/);
  assert.match(settingsSource, /onUpdateProfileDraft\?\.\("profileStatus", event\.target\.value\)/);
  assert.match(settingsSource, /maxLength=\{maxProfileStatusLength\}/);
  assert.match(slotSource, /profileStatus=\{profileCustomStatus\}/);
  assert.match(profileSource, /className="profile__custom-status"/);
  assert.match(profileSource, /title=\{visibleProfileStatus\}/);
  assert.match(profileSource, /className="profile__status-track"/);
  assert.match(profileCss, /\.profile__custom-status \{/);
  assert.match(profileCss, /\.profile__status-track \{[\s\S]*?animation: profileActivityMarquee 20s linear infinite;/);
});

test("integration activity visually replaces manual profile status in the bottom profile panel", () => {
  const profileSource = readRepoFile("src/components/MenuProfilePanel.jsx");
  const activeContactsSource = readRepoFile("src/features/menu-main/menuMainActiveContacts.js");

  assert.match(profileSource, /const voiceProfileStatus = currentVoiceChannel/);
  assert.match(profileSource, /isDirectCallChannelId\(currentVoiceChannel\)\s*\?\s*"В личном звонке"/);
  assert.match(profileSource, /`В голосовом канале: \$\{currentVoiceChannelName\}`/);
  assert.match(profileSource, /const visibleProfileStatus = activityStatus \? "" : voiceProfileStatus \|\| profileStatus;/);
  assert.match(profileSource, /const showProfileStatus = Boolean\(visibleProfileStatus\);/);
  assert.match(profileSource, /\{showProfileStatus \? \(/);
  assert.match(profileSource, /\{activityStatus \? \(/);
  assert.match(activeContactsSource, /const status = activityStatus \|\| voiceStatus \|\| onlineStatus;/);
  assert.match(activeContactsSource, /activity: 0,[\s\S]*?voice: 1,[\s\S]*?online: 2,/);
});

test("bottom profile card aligns with the text composer height and uses tighter corners", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const identityRowRule = mainCss.match(/\.profile__identity-row \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(textChatCss, /\.message-composer \{[\s\S]*?min-height: 58px;/);
  assert.match(identityRowRule, /min-height: 58px;/);
  assert.match(identityRowRule, /border-radius: 14px;/);
  assert.match(identityRowRule, /top: 7px;/);
});

test("server channel sidebar padding is separated from the bottom profile panel", () => {
  const workspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const shellCss = readRepoFile("src/css/MenuMainShell.css");
  const sidebarStart = workspaceSource.indexOf('<aside className="sidebar__channels sidebar__channels--servers">');
  const profileStart = workspaceSource.indexOf("{includeProfilePanel ? profilePanel : null}", sidebarStart);
  const bodyStart = workspaceSource.indexOf('className="sidebar__channels-body"', sidebarStart);
  const bodyEnd = workspaceSource.indexOf("</div>\n\n    {includeProfilePanel ? profilePanel : null}", bodyStart);

  assert.ok(sidebarStart >= 0, "server channel sidebar is rendered");
  assert.ok(bodyStart > sidebarStart, "server channel sidebar has a body wrapper");
  assert.ok(bodyEnd > bodyStart, "server channel sidebar body closes before profile");
  assert.ok(profileStart > bodyEnd, "bottom profile panel is outside the padded body");
  assert.match(shellCss, /\.sidebar__channels--servers \{[\s\S]*?padding: 0;/);
  assert.match(shellCss, /\.sidebar__channels--servers \.sidebar__channels-body \{[\s\S]*?padding: 18px 7px 16px;/);
  assert.match(shellCss, /\.sidebar__channels--servers > \.menu__profile-wrapper \{[\s\S]*?margin: 0;/);
});

test("bottom profile voice controls stay compact and use one icon color", () => {
  const profileVoiceCss = readRepoFile("src/css/MenuMainProfileVoice.css");
  const miniIconRule = profileVoiceCss.match(/\.profile__mini-icon \{[\s\S]*?\n\}/)?.[0] || "";
  const miniArrowRule = profileVoiceCss.match(/\.profile__mini-arrow \{[\s\S]*?\n\}/)?.[0] || "";
  const chevronRule = profileVoiceCss.match(/\.profile__mini-chevron \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(miniIconRule, /height: 30px;/);
  assert.match(miniIconRule, /min-height: 30px;/);
  assert.match(miniArrowRule, /height: 30px;/);
  assert.match(miniArrowRule, /min-height: 30px;/);
  assert.match(miniArrowRule, /color: currentColor;/);
  assert.match(chevronRule, /background-color: currentColor;/);
});

test("active voice channel keeps title sizing stable and timer visible", () => {
  const listChannelsCss = readRepoFile("src/css/ListChannels.css");

  assert.match(listChannelsCss, /\.list__items--active > \.voice-channel__row \{[\s\S]*?min-height: 38px;[\s\S]*?padding: 0;/);
  assert.match(listChannelsCss, /\.list__items--active \.voice-channel__icon \{[\s\S]*?align-self: center;[\s\S]*?margin-top: 0;/);
  assert.match(listChannelsCss, /\.list__items--active \.voice-channel__title \{[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 450;/);
  assert.doesNotMatch(listChannelsCss, /\.list__items--active \.voice-channel__title \{[\s\S]*?font-size: 17px;/);
  assert.doesNotMatch(listChannelsCss, /\.list__items:hover \.voice-channel__row:has\(> \.channel-edit-button\) \.voice-channel__timer/);
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
  assert.match(controllerSource, /const\s*\[uiAccentColor,\s*setUiAccentColor\]/);
  assert.match(controllerSource, /localStorage\.setItem\(uiAccentStorageKey,\s*normalizeUiAccentColor\(uiAccentColor\)\)/);
  assert.match(controllerSource, /applyUiAccentPreference\(uiAccentColor,\s*\{\s*root,\s*body\s*\}\)/);
  assert.match(rendererSource, /uiAccentColor=\{uiAccentColor\}/);
  assert.match(settingsSource, /type="color"[\s\S]*?value=\{uiAccentColor \|\| "#8b7cff"\}/);
});

test("custom accent color paints shared purple control surfaces", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const deviceMenuCss = readRepoFile("src/css/MenuProfileDeviceMenu.css");
  const mediaFrameCss = readRepoFile("src/css/MediaFrameEditorModal.css");
  const serverCss = readRepoFile("src/css/ServerWorkspace.css");
  const pollCss = readRepoFile("src/css/TextChatPollComposerModal.css");
  const voiceProfileCss = readRepoFile("src/css/MenuVoiceProfileSettings.css");

  assert.match(mainCss, /\.voice-settings-field input\[type="range"\],[\s\S]*?accent-color: var\(--app-accent/);
  assert.match(mainCss, /\.voice-settings-card--voice \.slider-with-tooltip__input::-webkit-slider-runnable-track \{[\s\S]*?linear-gradient\(90deg, var\(--app-accent/);
  assert.match(mainCss, /\.voice-settings-meter__bars span\.is-active \{[\s\S]*?background: var\(--app-accent/);
  assert.match(mainCss, /\.voice-switch--active \{[\s\S]*?background: var\(--app-accent/);
  assert.match(mainCss, /\.settings-inline-button,[\s\S]*?\.voice-settings-meter__button \{[\s\S]*?background: linear-gradient\(180deg, color-mix\(in srgb, var\(--app-accent/);
  assert.match(mainCss, /\.settings-role-permission input,[\s\S]*?accent-color: var\(--app-accent/);
  assert.match(mainCss, /\.settings-checkbox input \{[\s\S]*?accent-color: var\(--app-accent/);
  assert.match(mainCss, /\.stream-modal__check input \{[\s\S]*?accent-color: var\(--app-accent/);

  assert.match(deviceMenuCss, /\.device-menu__submenu-option\.is-active \.device-menu__submenu-radio \{[\s\S]*?background: var\(--app-accent/);
  assert.match(deviceMenuCss, /\.device-menu__toggle--active \.device-menu__toggle-switch \{[\s\S]*?background: var\(--app-accent/);
  assert.match(deviceMenuCss, /\.device-menu__slider input \{[\s\S]*?accent-color: var\(--app-accent/);
  assert.match(deviceMenuCss, /\.device-menu__meter span\.is-active \{[\s\S]*?background: var\(--app-accent/);

  assert.match(mediaFrameCss, /\.media-frame-editor__slider-field input \{[\s\S]*?accent-color: var\(--app-accent/);
  assert.match(serverCss, /\.channel-settings-switch\.is-active \{[\s\S]*?background: var\(--app-accent/);
  assert.match(serverCss, /\.channel-settings-range input\[type="range"\]::-webkit-slider-runnable-track \{[\s\S]*?linear-gradient\(90deg, var\(--app-accent/);
  assert.match(serverCss, /\.channel-settings-permissions input \{[\s\S]*?accent-color: var\(--app-accent/);
  assert.match(pollCss, /\.poll-composer__toggle input:checked \+ \.poll-composer__toggle-track \{[\s\S]*?background: var\(--app-accent/);
  assert.match(voiceProfileCss, /\.voice-profile-option input:checked \{[\s\S]*?border-color: var\(--app-accent/);
});

test("media-only message layout stays stable after reactions are added", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const mediaOnlyStart = messageListSource.indexOf("const isMediaOnlyMessage =");
  const emojiOnlyStart = messageListSource.indexOf("const isInlineEmojiOnlyMessage =", mediaOnlyStart);
  const mediaOnlySource = messageListSource.slice(mediaOnlyStart, emojiOnlyStart);

  assert.match(mediaOnlySource, /hasRenderableAttachments/);
  assert.doesNotMatch(mediaOnlySource, /!reactions\.length/);
});

test("seven visual attachments use the dedicated no-gap mosaic", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const collectionStart = messageListSource.indexOf("const MessageAttachmentCollection =");
  const collectionEnd = messageListSource.indexOf("MessageAttachmentCollection.displayName", collectionStart);
  const collectionSource = messageListSource.slice(collectionStart, collectionEnd);

  assert.match(collectionSource, /const useSevenTileLayout = \(/);
  assert.match(collectionSource, /visualAttachments\.length === 7/);
  assert.match(collectionSource, /useDenseGalleryLayout = \([\s\S]*visualAttachments\.length >= 8/);
  assert.match(collectionSource, /useSevenTileLayout \? "message-attachment-grid--seven-tile"/);
});

test("dense media gallery remainder rows fill available columns through twenty attachments", () => {
  const attachmentsCss = readRepoFile("src/css/TextChatAttachments.css");
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.match(messageListSource, /if \(attachmentCount <= 20\) \{[\s\S]*?return 5;/);
  [
    ["4", "1", /dense-gallery-cols-4\.message-attachment-grid--dense-gallery-rem-1[\s\S]*grid-column: 1 \/ span 4;/],
    ["4", "2", /dense-gallery-cols-4\.message-attachment-grid--dense-gallery-rem-2[\s\S]*grid-column: 1 \/ span 2;[\s\S]*dense-gallery-cols-4\.message-attachment-grid--dense-gallery-rem-2[\s\S]*grid-column: 3 \/ span 2;/],
    ["4", "3", /dense-gallery-cols-4\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 1 \/ span 2;[\s\S]*dense-gallery-cols-4\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 3;[\s\S]*dense-gallery-cols-4\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 4;/],
    ["5", "1", /dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-1[\s\S]*grid-column: 1 \/ span 5;/],
    ["5", "2", /dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-2[\s\S]*grid-column: 1 \/ span 3;[\s\S]*dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-2[\s\S]*grid-column: 4 \/ span 2;/],
    ["5", "3", /dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 1 \/ span 2;[\s\S]*dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 3 \/ span 2;[\s\S]*dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 5;/],
    ["5", "4", /dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 1 \/ span 2;[\s\S]*dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 3;[\s\S]*dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 4;[\s\S]*dense-gallery-cols-5\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 5;/],
    ["6", "1", /dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-1[\s\S]*grid-column: 1 \/ span 6;/],
    ["6", "2", /dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-2[\s\S]*grid-column: 1 \/ span 3;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-2[\s\S]*grid-column: 4 \/ span 3;/],
    ["6", "3", /dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 1 \/ span 2;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 3 \/ span 2;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-3[\s\S]*grid-column: 5 \/ span 2;/],
    ["6", "4", /dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 1 \/ span 2;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 3 \/ span 2;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 5;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-4[\s\S]*grid-column: 6;/],
    ["6", "5", /dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-5[\s\S]*grid-column: 1 \/ span 2;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-5[\s\S]*grid-column: 3;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-5[\s\S]*grid-column: 4;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-5[\s\S]*grid-column: 5;[\s\S]*dense-gallery-cols-6\.message-attachment-grid--dense-gallery-rem-5[\s\S]*grid-column: 6;/],
  ].forEach(([columns, remainder, rulePattern]) => {
    const selector = `.message-attachment-grid--dense-gallery-cols-${columns}.message-attachment-grid--dense-gallery-rem-${remainder}`;
    assert.match(attachmentsCss, rulePattern, `${selector} should fill the last row`);
  });
});

test("account banned screen uses strict photo-backed card without character art", () => {
  const screenSource = readRepoFile("src/components/AccountBannedScreen.jsx");
  const screenCss = readRepoFile("src/css/AccountBannedScreen.css");

  assert.doesNotMatch(screenSource, /ban-page__video|ban-card__character|ban-girl|GoldenDustGlow2/);
  assert.doesNotMatch(screenCss, /\.ban-page__video|\.ban-card__character|\.ban-girl/);
  assert.match(screenCss, /url\("\/image\/account-banned-background\.jpg"\) center \/ cover no-repeat/);
  assert.match(screenCss, /\.ban-card \{[\s\S]*?border-radius: 8px;/);
  assert.match(screenCss, /\.ban-card \{[\s\S]*?background: rgba\(12, 15, 22, 0\.86\);/);
});

test("partial message updates preserve existing media attachments", () => {
  const controllerSource = readRepoFile("src/features/text-chat/TextChatController.jsx");

  assert.match(controllerSource, /function mergeIncomingMessageUpdate/);
  assert.match(controllerSource, /normalizeAttachmentItems\(previousMessage\)/);
  assert.match(controllerSource, /mergeIncomingMessageUpdate\(messageItem, normalizedMessage, updatedMessage\)/);
});

test("empty attachment arrays in partial message updates do not clear existing media", () => {
  const controllerSource = readRepoFile("src/features/text-chat/TextChatController.jsx");
  const updatePayloadStart = controllerSource.indexOf("function hasAttachmentUpdatePayload");
  const mergeStart = controllerSource.indexOf("function mergeIncomingMessageUpdate", updatePayloadStart);
  const updatePayloadSource = controllerSource.slice(updatePayloadStart, mergeStart);

  assert.match(updatePayloadSource, /hasMeaningfulAttachmentArray/);
  assert.doesNotMatch(updatePayloadSource, /Array\.isArray\(messageItem\.attachments\) \|\| Array\.isArray\(messageItem\.Attachments\)/);
});

test("batch upload sheet styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const batchUploadCss = readRepoFileIfExists("src/css/TextChatBatchUploadSheet.css");
  const batchUploadSource = readRepoFile("src/components/TextChatBatchUploadSheet.jsx");

  assert.match(batchUploadSource, /import "\.\.\/css\/TextChatBatchUploadSheet\.css";/);
  assert.match(batchUploadCss, /\.batch-upload-sheet-backdrop \{/);
  assert.match(batchUploadCss, /\.batch-upload-sheet \{/);
  assert.match(batchUploadCss, /html\[data-ui-theme="light"\] \.batch-upload-sheet/);
  assert.doesNotMatch(textChatCss, /batch-upload-sheet/);
});

test("chat profile modal styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const profileCss = readRepoFileIfExists("src/css/TextChatProfileModal.css");
  const profileSource = readRepoFile("src/components/TextChatProfileModal.jsx");

  assert.match(profileSource, /import "\.\.\/css\/TextChatProfileModal\.css";/);
  assert.match(profileSource, /profileSummaryRows/);
  assert.match(profileSource, /Сводка/);
  assert.match(profileSource, /profileSummaryNote/);
  assert.match(profileSource, /chat-profile-modal__side-widget-note/);
  assert.match(profileCss, /\.chat-profile-modal__quick-card span \{[\s\S]*?font-size: 13px;/);
  assert.match(profileCss, /\.chat-profile-modal__quick-card strong \{[\s\S]*?font-size: 16px;/);
  assert.match(profileCss, /\.chat-profile-modal__side-widget-note \{/);
  assert.match(profileCss, /\.chat-profile-modal-backdrop \{/);
  assert.match(profileCss, /\.chat-profile-modal \{/);
  assert.match(profileCss, /html\[data-ui-theme="light"\] \.chat-profile-modal/);
  assert.doesNotMatch(textChatCss, /chat-profile-modal/);
});

test("forward modal styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const forwardCss = readRepoFileIfExists("src/css/TextChatForwardModal.css");
  const forwardSource = readRepoFile("src/components/TextChatForwardModal.jsx");

  assert.match(forwardSource, /import "\.\.\/css\/TextChatForwardModal\.css";/);
  assert.match(forwardCss, /\.forward-modal__backdrop \{/);
  assert.match(forwardCss, /html\[data-ui-theme="light"\] \.forward-modal/);
  assert.doesNotMatch(textChatCss, /^\.forward-modal/m);
  assert.doesNotMatch(forwardSource, />\s*\?\s*<\/button>/);
});

test("media preview styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const mediaPreviewCss = readRepoFileIfExists("src/css/TextChatMediaPreview.css");
  const mediaPreviewSource = readRepoFile("src/components/TextChatMediaPreview.jsx");

  assert.match(mediaPreviewSource, /import "\.\.\/css\/TextChatMediaPreview\.css";/);
  assert.match(mediaPreviewCss, /\.media-preview \{/);
  assert.match(mediaPreviewCss, /\.media-preview__dialog \{/);
  assert.match(mediaPreviewCss, /html\[data-ui-theme="light"\] \.media-preview/);
  assert.doesNotMatch(textChatCss, /^\s*\.media-preview[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^html\[data-ui-theme="light"\] \.media-preview/m);
  assert.doesNotMatch(textChatCss, /^body\.media-preview-open/m);
});

test("message context menu styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const contextMenuCss = readRepoFileIfExists("src/css/TextChatContextMenu.css");
  const contextMenuSource = readRepoFile("src/components/TextChatContextMenu.jsx");

  assert.match(contextMenuSource, /import \{ createPortal \} from "react-dom";/);
  assert.match(contextMenuSource, /import "\.\.\/css\/TextChatContextMenu\.css";/);
  assert.match(contextMenuSource, /createPortal\(menuElement, document\.body\)/);
  assert.match(contextMenuCss, /\.message-context-menu-stack \{/);
  assert.match(contextMenuCss, /\.message-context-menu \{/);
  assert.match(contextMenuCss, /\.message-context-menu-stack \{[\s\S]*?z-index: 2147482400;/);
  assert.match(contextMenuCss, /@media \(max-width: 640px\) and \(hover: none\) and \(pointer: coarse\)/);
  assert.match(contextMenuCss, /html\[data-ui-theme="light"\] \.message-context-menu/);
  assert.doesNotMatch(textChatCss, /^\s*\.message-context-menu[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^html\[data-ui-theme="light"\] \.message-context-menu/m);
});

test("message attachments explicitly forward right clicks to the message context menu", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.match(messageListSource, /onOpenContextMenu,\n\s+isOwnMessage = false,/);
  assert.match(messageListSource, /const handleAttachmentContextMenu = \(event\) => \{\n\s+event\.stopPropagation\(\);\n\s+onOpenContextMenu\?\.\(event, messageItem, isOwnMessage\);/);
  assert.match(messageListSource, /className="message-inline-emoji message-inline-emoji--button"[\s\S]*?onContextMenu=\{handleAttachmentContextMenu\}/);
  assert.match(messageListSource, /className=\{`message-media message-media--button[\s\S]*?onContextMenu=\{handleAttachmentContextMenu\}/);
  assert.match(messageListSource, /className=\{`message-media message-media--video message-media--button[\s\S]*?onContextMenu=\{handleAttachmentContextMenu\}/);
  assert.match(messageListSource, /className=\{`message-attachment \$\{isDocumentAttachment[\s\S]*?onContextMenu=\{handleAttachmentContextMenu\}/);
  assert.match(messageListSource, /onOpenContextMenu=\{onOpenContextMenu\}[\s\S]*?isOwnMessage=\{isOwnMessage\}/);
});

test("message bubble content opens the message context menu directly on right click", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

  assert.match(messageListSource, /const handleMessageContextMenu = \(event\) => \{\n\s+event\.stopPropagation\(\);\n\s+onOpenContextMenu\(event, messageItem, isOwnMessage\);\n\s+\};/);
  assert.match(messageListSource, /className=\{`msg-content[\s\S]*?onContextMenu=\{handleMessageContextMenu\}/);
});

test("direct message bubble tail uses a straight single-edge shape", () => {
  const messageLayoutCss = readRepoFile("src/css/TextChatLayoutMessages.css");
  const tailRule = messageLayoutCss.match(/\.msg-content--dm:not\([\s\S]*?::before\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(tailRule, /width: 18px;/);
  assert.match(tailRule, /height: 16px;/);
  assert.match(tailRule, /clip-path: polygon\(44% 0, 100% 0, 100% 100%, 0 100%\);/);
  assert.doesNotMatch(tailRule, /20% 80%|35% 45%/);
});

test("chat report modal styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const reportModalCss = readRepoFileIfExists("src/css/TextChatReportModal.css");
  const reportModalSource = readRepoFile("src/components/TextChatReportModal.jsx");

  assert.match(reportModalSource, /import "\.\.\/css\/TextChatReportModal\.css";/);
  assert.match(reportModalCss, /\.chat-report-modal \{/);
  assert.match(reportModalCss, /\.chat-report-modal__dialog \{/);
  assert.match(reportModalCss, /html\[data-ui-theme="light"\] \.chat-report-modal__dialog/);
  assert.doesNotMatch(textChatCss, /^\s*\.chat-report-modal[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^html\[data-ui-theme="light"\] \.chat-report-modal/m);
});

test("text chat panel styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const panelsCss = readRepoFileIfExists("src/css/TextChatPanels.css");
  const panelsSource = readRepoFile("src/components/TextChatPanels.jsx");

  assert.match(panelsSource, /import "\.\.\/css\/TextChatPanels\.css";/);
  assert.match(panelsCss, /\.message-search-panel \{/);
  assert.match(panelsCss, /\.chat-pins \{/);
  assert.match(panelsCss, /html\[data-ui-theme="light"\] \.chat-pins/);
  assert.doesNotMatch(textChatCss, /^\s*\.message-search-panel[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^\s*\.chat-pins[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^html\[data-ui-theme="light"\] \.chat-pins/m);
});

test("server channel message timestamps align to message content width", () => {
  const messageLayoutCss = readRepoFile("src/css/TextChatLayoutMessages.css");
  const serverMessageContentRule = messageLayoutCss.match(/\.message-item:not\(\.message-item--dm\) \.msg-content \{[\s\S]*?\n\}/)?.[0] || "";
  const serverCaptionedVisualRule = messageLayoutCss.match(/\.message-item:not\(\.message-item--dm\) \.msg-content--visual-attachments:not\(\.msg-content--media-only\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(serverMessageContentRule, /width: fit-content;/);
  assert.match(serverMessageContentRule, /max-width: min\(100%, 840px\);/);
  assert.doesNotMatch(serverMessageContentRule, /width: 100%;/);
  assert.match(serverCaptionedVisualRule, /width: fit-content;/);
  assert.match(serverCaptionedVisualRule, /max-width: min\(100%, 520px\);/);
  assert.match(serverCaptionedVisualRule, /justify-self: start;/);
});

test("text chat exposes a full history attachments panel from the topbar", () => {
  const textChatViewSource = readRepoFile("src/features/text-chat/TextChatView.jsx");
  const textChatPanelsSource = readRepoFile("src/components/TextChatPanels.jsx");
  const serverWorkspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const friendsWorkspaceSource = readRepoFile("src/components/FriendsWorkspace.jsx");

  assert.match(textChatViewSource, /ChatAttachmentsPanel/);
  assert.match(textChatViewSource, /attachmentsPanelOpen/);
  assert.match(textChatViewSource, /onOpenMediaPreview/);
  assert.match(textChatPanelsSource, /export function ChatAttachmentsPanel/);
  assert.match(textChatPanelsSource, /Фото и видео/);
  assert.match(textChatPanelsSource, /Файлы/);
  assert.match(serverWorkspaceSource, /onToggleAttachmentsPanel/);
  assert.match(friendsWorkspaceSource, /onToggleAttachmentsPanel/);
});

test("text chat composer popover styles stay split from the main text chat stylesheet", () => {
  const textChatCss = readRepoFile("src/css/TextChat.css");
  const composerPopoversCss = readRepoFileIfExists("src/css/TextChatComposerPopovers.css");
  const composerSource = readRepoFile("src/components/TextChatComposer.jsx");

  assert.match(composerSource, /import "\.\.\/css\/TextChatComposerPopovers\.css";/);
  assert.match(composerPopoversCss, /\.composer-text-tools-menu \{/);
  assert.match(composerPopoversCss, /\.composer-emoji-picker \{/);
  assert.match(composerPopoversCss, /\.mention-suggestions \{/);
  assert.match(composerPopoversCss, /html\[data-ui-theme="light"\] \.composer-emoji-picker/);
  assert.doesNotMatch(textChatCss, /^\s*\.composer-text-tools-menu[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^\s*\.composer-emoji-picker[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^\s*\.mention-suggestions[^\n{]*\{/m);
  assert.doesNotMatch(textChatCss, /^html\[data-ui-theme="light"\] \.composer-emoji-picker/m);
});

test("media frame editor styles stay split from the main menu stylesheet", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");
  const editorCss = readRepoFileIfExists("src/css/MediaFrameEditorModal.css");
  const editorSource = readRepoFile("src/components/MediaFrameEditorModal.jsx");

  assert.match(editorSource, /import "\.\.\/css\/MediaFrameEditorModal\.css";/);
  assert.match(editorCss, /\.media-frame-editor \{/);
  assert.match(editorCss, /\.media-frame-editor__dialog \{/);
  assert.match(editorCss, /\.media-frame-editor__slider-field input::-webkit-slider-thumb/);
  assert.doesNotMatch(mainCss, /media-frame-editor/);
});

test("stream mini player controls avoid delayed native title tooltips", () => {
  const serverWorkspaceSource = readRepoFile("src/components/ServerWorkspace.jsx");
  const miniPlayerStart = serverWorkspaceSource.indexOf("function StreamMiniPlayer");
  const miniPlayerEnd = serverWorkspaceSource.indexOf("function ForumChannelView", miniPlayerStart);
  const miniPlayerSource = serverWorkspaceSource.slice(miniPlayerStart, miniPlayerEnd);

  assert.ok(miniPlayerStart >= 0, "stream mini player source is present");
  assert.ok(miniPlayerEnd > miniPlayerStart, "stream mini player source is bounded");
  assert.match(miniPlayerSource, /aria-label="Открыть стрим"/);
  assert.match(miniPlayerSource, /aria-label=\{actionLabel \|\| "Действие со стримом"\}/);
  assert.doesNotMatch(miniPlayerSource, /\s+title=\{/);
  assert.doesNotMatch(miniPlayerSource, /\s+title="/);
});
