import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const distAssetsDir = path.join(repoRoot, "dist", "assets");
const registryPath = path.join(repoRoot, "docs", "performance", "registry.md");
const sloDocPath = path.join(repoRoot, "docs", "performance", "slo.md");
const reportOutputPath = path.join(repoRoot, ".tmp", "perf-audit-report.json");
const menuMainControllerPath = path.join(repoRoot, "src", "features", "menu-main", "MenuMainController.jsx");
const menuMainOverlayLayerPath = path.join(repoRoot, "src", "features", "menu-main", "MenuMainOverlayLayer.jsx");
const menuMainProfilePanelSlotPath = path.join(repoRoot, "src", "features", "menu-main", "MenuMainProfilePanelSlot.jsx");
const menuMainSettingsRendererPath = path.join(repoRoot, "src", "features", "menu-main", "MenuMainSettingsRenderer.jsx");
const serverWorkspacePath = path.join(repoRoot, "src", "components", "ServerWorkspace.jsx");
const batchUploadSheetPath = path.join(repoRoot, "src", "components", "TextChatBatchUploadSheet.jsx");
const textChatMessageListPath = path.join(repoRoot, "src", "components", "TextChatMessageList.jsx");
const textChatAttachmentPickerPath = path.join(repoRoot, "src", "hooks", "useTextChatAttachmentPickerFlow.js");
const textChatVirtualizerPath = path.join(repoRoot, "src", "hooks", "useTextChatVirtualizer.js");

const textChatBudgets = {
  minVirtualizationThreshold: 50,
  maxMediaPrefetchImageLimit: 4,
  maxInitialBatchUploadItems: 12,
  maxBatchUploadRenderChunkSize: 24,
  maxPendingMediaPreviewHydrationItems: 6,
  maxPendingDocumentPreviewHydrationItems: 4,
};

const bundleBudgets = {
  maxMenuMainJsBytes: 950 * 1024,
  maxLiveKitJsBytes: 540 * 1024,
  maxVoiceJsBytes: 140 * 1024,
  maxMenuMainCssBytes: 660 * 1024,
};
const bundleBudgetGraceBytes = 8 * 1024;

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatBundleBudget(maxBytes) {
  return `${formatKb(maxBytes)} (+${formatKb(bundleBudgetGraceBytes)} release grace)`;
}

function formatRepoPath(value) {
  return value.split(path.sep).join("/");
}

async function listDistAssets() {
  try {
    const items = await fs.readdir(distAssetsDir, { withFileTypes: true });
    const assets = [];

    for (const item of items) {
      if (!item.isFile()) {
        continue;
      }

      const fullPath = path.join(distAssetsDir, item.name);
      const stats = await fs.stat(fullPath);
      assets.push({
        name: item.name,
        path: fullPath,
        bytes: stats.size,
        extension: path.extname(item.name).toLowerCase(),
      });
    }

    return assets.sort((left, right) => right.bytes - left.bytes);
  } catch {
    return [];
  }
}

function parseRegistrySections(markdown) {
  const normalized = String(markdown || "");
  const issuePattern = /^##\s+(PERF-\d+)\s+[-–]\s+(.+)$/gm;
  const matches = [...normalized.matchAll(issuePattern)];

  return matches.map((match, index) => {
    const blockStart = match.index ?? 0;
    const blockEnd = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const block = normalized.slice(blockStart, blockEnd);
    const priorityMatch = block.match(/^- Приоритет:\s*(P\d+)/m);
    const statusMatch = block.match(/^- Статус:\s*(.+)$/m);
    const areaMatch = block.match(/^- Зона:\s*(.+)$/m);

    return {
      id: match[1],
      title: match[2].trim(),
      priority: priorityMatch?.[1]?.trim() || "unknown",
      status: statusMatch?.[1]?.trim() || "unknown",
      area: areaMatch?.[1]?.trim() || "unknown",
    };
  });
}

function countBy(items, key) {
  return items.reduce((accumulator, item) => {
    const value = String(item?.[key] || "unknown");
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

async function readRegistryIssues() {
  try {
    const content = await fs.readFile(registryPath, "utf8");
    return parseRegistrySections(content);
  } catch {
    return [];
  }
}

function readNumericConst(source, name) {
  const match = String(source || "").match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

async function auditTextChatHotPath() {
  const violations = [];
  let messageListSource = "";
  let virtualizerSource = "";
  let attachmentPickerSource = "";
  let batchUploadSheetSource = "";

  try {
    messageListSource = await fs.readFile(textChatMessageListPath, "utf8");
  } catch {
    violations.push({
      id: "TEXT_CHAT_MESSAGE_LIST_MISSING",
      message: "TextChatMessageList.jsx was not readable.",
    });
  }

  try {
    virtualizerSource = await fs.readFile(textChatVirtualizerPath, "utf8");
  } catch {
    violations.push({
      id: "TEXT_CHAT_VIRTUALIZER_MISSING",
      message: "useTextChatVirtualizer.js was not readable.",
    });
  }

  try {
    attachmentPickerSource = await fs.readFile(textChatAttachmentPickerPath, "utf8");
  } catch {
    violations.push({
      id: "TEXT_CHAT_ATTACHMENT_PICKER_MISSING",
      message: "useTextChatAttachmentPickerFlow.js was not readable.",
    });
  }

  try {
    batchUploadSheetSource = await fs.readFile(batchUploadSheetPath, "utf8");
  } catch {
    violations.push({
      id: "TEXT_CHAT_BATCH_UPLOAD_SHEET_MISSING",
      message: "TextChatBatchUploadSheet.jsx was not readable.",
    });
  }

  const virtualizationThreshold = readNumericConst(virtualizerSource, "MIN_MESSAGES_FOR_VIRTUALIZATION");
  if (
    virtualizationThreshold != null
    && virtualizationThreshold < textChatBudgets.minVirtualizationThreshold
  ) {
    violations.push({
      id: "TEXT_CHAT_VIRTUALIZATION_TOO_EARLY",
      message: `MIN_MESSAGES_FOR_VIRTUALIZATION must be at least ${textChatBudgets.minVirtualizationThreshold}. Current: ${virtualizationThreshold}.`,
    });
  }

  const mediaPrefetchImageLimit = readNumericConst(messageListSource, "MEDIA_PREFETCH_IMAGE_LIMIT");
  if (
    mediaPrefetchImageLimit != null
    && mediaPrefetchImageLimit > textChatBudgets.maxMediaPrefetchImageLimit
  ) {
    violations.push({
      id: "TEXT_CHAT_MEDIA_PREFETCH_TOO_AGGRESSIVE",
      message: `MEDIA_PREFETCH_IMAGE_LIMIT must be <= ${textChatBudgets.maxMediaPrefetchImageLimit}. Current: ${mediaPrefetchImageLimit}.`,
    });
  }

  if (messageListSource.includes(".decode?.(") || messageListSource.includes(".decode().")) {
    violations.push({
      id: "TEXT_CHAT_FEED_FORCED_IMAGE_DECODE",
      message: "Do not force image.decode() in the feed prefetch path.",
    });
  }

  const initialBatchUploadItems = readNumericConst(batchUploadSheetSource, "INITIAL_VISIBLE_BATCH_ITEMS");
  if (
    initialBatchUploadItems != null
    && initialBatchUploadItems > textChatBudgets.maxInitialBatchUploadItems
  ) {
    violations.push({
      id: "TEXT_CHAT_BATCH_UPLOAD_INITIAL_RENDER_TOO_LARGE",
      message: `INITIAL_VISIBLE_BATCH_ITEMS must be <= ${textChatBudgets.maxInitialBatchUploadItems}. Current: ${initialBatchUploadItems}.`,
    });
  }

  const batchUploadRenderChunkSize = readNumericConst(batchUploadSheetSource, "BATCH_RENDER_CHUNK_SIZE");
  if (
    batchUploadRenderChunkSize != null
    && batchUploadRenderChunkSize > textChatBudgets.maxBatchUploadRenderChunkSize
  ) {
    violations.push({
      id: "TEXT_CHAT_BATCH_UPLOAD_RENDER_CHUNK_TOO_LARGE",
      message: `BATCH_RENDER_CHUNK_SIZE must be <= ${textChatBudgets.maxBatchUploadRenderChunkSize}. Current: ${batchUploadRenderChunkSize}.`,
    });
  }

  if (!attachmentPickerSource.includes("function scheduleAfterNextPaint")) {
    violations.push({
      id: "TEXT_CHAT_UPLOAD_NO_POST_PAINT_SCHEDULER",
      message: "Upload preview and queue work must be scheduled after the pending shell can paint.",
    });
  }

  if (!attachmentPickerSource.includes("schedulePendingSelectionPreviewHydration")) {
    violations.push({
      id: "TEXT_CHAT_UPLOAD_PREVIEW_NOT_CHUNKED",
      message: "Pending upload preview hydration must stay chunked outside the initial render path.",
    });
  }

  if (!attachmentPickerSource.includes("scheduleSelectedFilesQueue")) {
    violations.push({
      id: "TEXT_CHAT_UPLOAD_QUEUE_NOT_DEFERRED",
      message: "Selected files queue commit must stay deferred behind the pending upload shell.",
    });
  }

  if (!attachmentPickerSource.includes("normalizedLayout === \"document\" ? 4 : 6")) {
    violations.push({
      id: "TEXT_CHAT_UPLOAD_PREVIEW_LIMIT_MISSING",
      message: "Pending upload preview hydration must cap document/media preview work to 4/6 items.",
    });
  }

  return {
    budgets: textChatBudgets,
    values: {
      virtualizationThreshold,
      mediaPrefetchImageLimit,
      initialBatchUploadItems,
      batchUploadRenderChunkSize,
    },
    violations,
  };
}

async function auditVoiceJoinHotPath() {
  const violations = [];
  let source = "";
  let serverWorkspaceSource = "";
  let overlayLayerSource = "";
  let profilePanelSlotSource = "";
  let settingsRendererSource = "";

  try {
    source = await fs.readFile(menuMainControllerPath, "utf8");
  } catch {
    violations.push({
      id: "VOICE_JOIN_CONTROLLER_MISSING",
      message: "MenuMainController.jsx was not readable.",
    });
  }

  try {
    serverWorkspaceSource = await fs.readFile(serverWorkspacePath, "utf8");
  } catch {
    violations.push({
      id: "VOICE_STAGE_WORKSPACE_MISSING",
      message: "ServerWorkspace.jsx was not readable.",
    });
  }

  try {
    overlayLayerSource = await fs.readFile(menuMainOverlayLayerPath, "utf8");
  } catch {
    violations.push({
      id: "VOICE_OVERLAY_LAYER_MISSING",
      message: "MenuMainOverlayLayer.jsx was not readable.",
    });
  }

  try {
    profilePanelSlotSource = await fs.readFile(menuMainProfilePanelSlotPath, "utf8");
  } catch {
    violations.push({
      id: "VOICE_PROFILE_PANEL_SLOT_MISSING",
      message: "MenuMainProfilePanelSlot.jsx was not readable.",
    });
  }

  try {
    settingsRendererSource = await fs.readFile(menuMainSettingsRendererPath, "utf8");
  } catch {
    violations.push({
      id: "SETTINGS_RENDERER_MISSING",
      message: "MenuMainSettingsRenderer.jsx was not readable.",
    });
  }

  const joinStart = source.indexOf("const joinVoiceChannel = async");
  const leaveStart = source.indexOf("const leaveVoiceChannel =", joinStart);
  const joinSource = joinStart >= 0 && leaveStart > joinStart ? source.slice(joinStart, leaveStart) : "";

  if (!joinSource) {
    violations.push({
      id: "VOICE_JOIN_HANDLER_MISSING",
      message: "joinVoiceChannel handler was not found.",
    });
  }

  const pendingUiIndex = joinSource.indexOf("activatePendingVoiceUi();");
  const ensureClientIndex = joinSource.indexOf("await ensureVoiceClientReady()");
  const joinChannelIndex = joinSource.indexOf("await voiceClientRef.current.joinChannel");
  const stageLazyLoaded = serverWorkspaceSource.includes("const VoiceRoomStage = lazy(loadVoiceRoomStage)");
  const settingsLazyLoaded = source.includes("import(\"./MenuMainSettingsRenderer\")");
  const settingsRendererScoped = settingsRendererSource.includes("VoiceSettingsPanel") && settingsRendererSource.includes("MenuMainSettingsContent");
  const profilePanelMemoized = profilePanelSlotSource.includes("import { memo }") && profilePanelSlotSource.includes("export default memo(MenuMainProfilePanelSlot)");
  const directCallOverlayIsolated = overlayLayerSource.includes("DirectCallOverlayView") && overlayLayerSource.includes("showDirectCallOverlay");

  if (pendingUiIndex < 0) {
    violations.push({
      id: "VOICE_JOIN_NO_OPTIMISTIC_UI",
      message: "Voice join must switch the visible voice UI immediately after click.",
    });
  }

  if (ensureClientIndex >= 0 && pendingUiIndex > ensureClientIndex) {
    violations.push({
      id: "VOICE_JOIN_UI_WAITS_FOR_CLIENT_INIT",
      message: "Voice join UI must render before ensureVoiceClientReady awaits SignalR/client initialization.",
    });
  }

  if (joinChannelIndex >= 0 && pendingUiIndex > joinChannelIndex) {
    violations.push({
      id: "VOICE_JOIN_UI_WAITS_FOR_MEDIA_JOIN",
      message: "Voice join UI must render before SignalR/LiveKit/microphone join completes.",
    });
  }

  if (!settingsLazyLoaded) {
    violations.push({
      id: "SETTINGS_RENDERER_NOT_LAZY",
      message: "Settings renderer must stay lazy-loaded to keep the initial MenuMain path lighter.",
    });
  }

  if (!settingsRendererScoped) {
    violations.push({
      id: "SETTINGS_RENDERER_SCOPE_MISSING",
      message: "Settings UI should remain scoped in MenuMainSettingsRenderer instead of moving back into MenuMainController.",
    });
  }

  if (!profilePanelMemoized) {
    violations.push({
      id: "VOICE_PROFILE_PANEL_NOT_MEMOIZED",
      message: "Profile/voice panel slot must stay memoized to limit voice state rerenders.",
    });
  }

  if (!directCallOverlayIsolated) {
    violations.push({
      id: "DIRECT_CALL_OVERLAY_NOT_ISOLATED",
      message: "Direct call overlay must stay in MenuMainOverlayLayer instead of being inlined into the main controller render.",
    });
  }

  return {
    values: {
      pendingUiBeforeClientInit: pendingUiIndex >= 0 && (ensureClientIndex < 0 || pendingUiIndex < ensureClientIndex),
      pendingUiBeforeMediaJoin: pendingUiIndex >= 0 && (joinChannelIndex < 0 || pendingUiIndex < joinChannelIndex),
      stageLazyLoaded,
      settingsLazyLoaded,
      settingsRendererScoped,
      profilePanelMemoized,
      directCallOverlayIsolated,
    },
    violations,
  };
}

function findLargestAsset(assets, predicate) {
  return assets.filter(predicate).sort((left, right) => right.bytes - left.bytes)[0] || null;
}

function auditBundleBudgets(assets) {
  const violations = [];
  const menuMainJs = findLargestAsset(assets, (item) => /^MenuMain-[\w-]+\.js$/i.test(item.name));
  const liveKitJs = findLargestAsset(assets, (item) => /^livekit-[\w-]+\.js$/i.test(item.name));
  const voiceJs = findLargestAsset(assets, (item) => /^voice-[\w-]+\.js$/i.test(item.name));
  const menuMainCss = findLargestAsset(assets, (item) => /^MenuMain-[\w-]+\.css$/i.test(item.name));
  const settingsChunk = findLargestAsset(assets, (item) => /^MenuMainSettingsRenderer-[\w-]+\.js$/i.test(item.name));
  const voiceStageChunk = findLargestAsset(assets, (item) => /^VoiceRoomStage-[\w-]+\.js$/i.test(item.name));

  const checks = [
    ["BUNDLE_MENUMAIN_JS_TOO_LARGE", "MenuMain JS chunk", menuMainJs, bundleBudgets.maxMenuMainJsBytes],
    ["BUNDLE_LIVEKIT_JS_TOO_LARGE", "LiveKit JS chunk", liveKitJs, bundleBudgets.maxLiveKitJsBytes],
    ["BUNDLE_VOICE_JS_TOO_LARGE", "Voice JS chunk", voiceJs, bundleBudgets.maxVoiceJsBytes],
    ["BUNDLE_MENUMAIN_CSS_TOO_LARGE", "MenuMain CSS chunk", menuMainCss, bundleBudgets.maxMenuMainCssBytes],
  ];

  checks.forEach(([id, label, asset, maxBytes]) => {
    const maxBytesWithGrace = maxBytes + bundleBudgetGraceBytes;

    if (!asset) {
      violations.push({
        id: `${id}_MISSING`,
        message: `${label} was not found in dist/assets. Run npm run build:frontend before audit.`,
      });
      return;
    }

    if (asset.bytes > maxBytesWithGrace) {
      violations.push({
        id,
        message: `${label} must be <= ${formatBundleBudget(maxBytes)}. Current: ${formatKb(asset.bytes)}.`,
      });
    }
  });

  if (!settingsChunk) {
    violations.push({
      id: "BUNDLE_SETTINGS_CHUNK_MISSING",
      message: "MenuMainSettingsRenderer must remain split into its own lazy chunk.",
    });
  }

  if (!voiceStageChunk) {
    violations.push({
      id: "BUNDLE_VOICE_STAGE_CHUNK_MISSING",
      message: "VoiceRoomStage must remain split into its own lazy chunk.",
    });
  }

  return {
    budgets: bundleBudgets,
    values: {
      menuMainJsBytes: menuMainJs?.bytes ?? null,
      liveKitJsBytes: liveKitJs?.bytes ?? null,
      voiceJsBytes: voiceJs?.bytes ?? null,
      menuMainCssBytes: menuMainCss?.bytes ?? null,
      settingsChunkPresent: Boolean(settingsChunk),
      voiceStageChunkPresent: Boolean(voiceStageChunk),
    },
    violations,
  };
}

async function main() {
  const assets = await listDistAssets();
  const issues = await readRegistryIssues();
  const textChatHotPath = await auditTextChatHotPath();
  const voiceJoinHotPath = await auditVoiceJoinHotPath();
  const jsAssets = assets.filter((item) => item.extension === ".js");
  const cssAssets = assets.filter((item) => item.extension === ".css");
  const bundleHotPath = auditBundleBudgets(assets);

  const report = {
    generatedAt: new Date().toISOString(),
    slo: {
      docPath: formatRepoPath(path.relative(repoRoot, sloDocPath)),
      textChatBudgets,
      bundleBudgets,
    },
    dist: {
      exists: assets.length > 0,
      assetCount: assets.length,
      jsBytes: jsAssets.reduce((sum, item) => sum + item.bytes, 0),
      cssBytes: cssAssets.reduce((sum, item) => sum + item.bytes, 0),
      topAssets: assets.slice(0, 10).map((item) => ({
        name: item.name,
        bytes: item.bytes,
      })),
    },
    registry: {
      issueCount: issues.length,
      byPriority: countBy(issues, "priority"),
      byStatus: countBy(issues, "status"),
      byArea: countBy(issues, "area"),
      openIssues: issues.filter((issue) => issue.status !== "done"),
    },
    textChatHotPath,
    voiceJoinHotPath,
    bundleHotPath,
  };

  await fs.mkdir(path.dirname(reportOutputPath), { recursive: true });
  await fs.writeFile(reportOutputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Performance audit summary");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`SLO doc: ${report.slo.docPath}`);
  console.log(`Registry issues: ${report.registry.issueCount}`);

  if (issues.length) {
    console.log(`By priority: ${JSON.stringify(report.registry.byPriority)}`);
    console.log(`By status: ${JSON.stringify(report.registry.byStatus)}`);
    if (report.registry.openIssues.length) {
      console.log("Open registry issues:");
      report.registry.openIssues.forEach((issue) => {
        console.log(`- ${issue.id} [${issue.priority}/${issue.status}/${issue.area}]: ${issue.title}`);
      });
    } else {
      console.log("Open registry issues: none");
    }
  } else {
    console.log("By priority: {}");
    console.log("By status: {}");
    console.log("Open registry issues: none");
  }

  if (!assets.length) {
    console.log("Dist assets: not found. Run `npm run build:frontend` first.");
  } else {
    console.log(`JS total: ${formatMb(report.dist.jsBytes)} (${formatKb(report.dist.jsBytes)})`);
    console.log(`CSS total: ${formatMb(report.dist.cssBytes)} (${formatKb(report.dist.cssBytes)})`);
    console.log("Top assets:");
    report.dist.topAssets.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} - ${formatMb(item.bytes)} (${formatKb(item.bytes)})`);
    });
  }

  console.log(`Text chat virtualization threshold: ${textChatHotPath.values.virtualizationThreshold ?? "unknown"}`);
  console.log(`Text chat media prefetch image limit: ${textChatHotPath.values.mediaPrefetchImageLimit ?? "unknown"}`);
  console.log(`Batch upload initial items: ${textChatHotPath.values.initialBatchUploadItems ?? "unknown"}`);
  console.log(`Batch upload render chunk: ${textChatHotPath.values.batchUploadRenderChunkSize ?? "unknown"}`);
  console.log(
    `Text chat budgets: virtualization threshold >= ${textChatBudgets.minVirtualizationThreshold}, media prefetch image limit <= ${textChatBudgets.maxMediaPrefetchImageLimit}`
  );
  console.log(`Voice join UI before client init: ${voiceJoinHotPath.values.pendingUiBeforeClientInit ? "yes" : "no"}`);
  console.log(`Voice join UI before media join: ${voiceJoinHotPath.values.pendingUiBeforeMediaJoin ? "yes" : "no"}`);
  console.log(`Voice stage lazy loaded: ${voiceJoinHotPath.values.stageLazyLoaded ? "yes" : "no"}`);
  console.log(`Settings renderer lazy loaded: ${voiceJoinHotPath.values.settingsLazyLoaded ? "yes" : "no"}`);
  console.log(`Settings renderer scoped: ${voiceJoinHotPath.values.settingsRendererScoped ? "yes" : "no"}`);
  console.log(`Voice profile panel memoized: ${voiceJoinHotPath.values.profilePanelMemoized ? "yes" : "no"}`);
  console.log(`Direct call overlay isolated: ${voiceJoinHotPath.values.directCallOverlayIsolated ? "yes" : "no"}`);
  console.log(`MenuMain JS budget: ${formatKb(bundleHotPath.values.menuMainJsBytes || 0)} / ${formatBundleBudget(bundleBudgets.maxMenuMainJsBytes)}`);
  console.log(`LiveKit JS budget: ${formatKb(bundleHotPath.values.liveKitJsBytes || 0)} / ${formatBundleBudget(bundleBudgets.maxLiveKitJsBytes)}`);
  console.log(`Voice JS budget: ${formatKb(bundleHotPath.values.voiceJsBytes || 0)} / ${formatBundleBudget(bundleBudgets.maxVoiceJsBytes)}`);
  console.log(`MenuMain CSS budget: ${formatKb(bundleHotPath.values.menuMainCssBytes || 0)} / ${formatBundleBudget(bundleBudgets.maxMenuMainCssBytes)}`);

  const violations = [
    ...textChatHotPath.violations,
    ...voiceJoinHotPath.violations,
    ...bundleHotPath.violations,
  ];

  if (violations.length) {
    console.error("Performance budget violations:");
    violations.forEach((violation) => {
      console.error(`- ${violation.id}: ${violation.message}`);
    });
    process.exitCode = 1;
  } else {
    console.log("Performance budgets: passed");
  }

  console.log(`JSON report: ${path.relative(repoRoot, reportOutputPath)}`);
}

main().catch((error) => {
  console.error("Failed to run perf audit:", error);
  process.exitCode = 1;
});
