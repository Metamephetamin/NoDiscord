import assert from "node:assert/strict";
import test from "node:test";
import { readRepoFile } from "./readRepoFile.mjs";

test("reply jump message refs use normalized string ids", () => {
  const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");
  const registerStart = messageListSource.indexOf("const registerMessageNode = useCallback");
  const registerEnd = messageListSource.indexOf("const renderedAttachmentsByMessageId", registerStart);
  const registerMessageNodeSource = messageListSource.slice(registerStart, registerEnd);

  assert.notEqual(registerStart, -1);
  assert.notEqual(registerEnd, -1);
  assert.match(registerMessageNodeSource, /const normalizedMessageId = String\(messageId \|\| ""\);/);
  assert.match(registerMessageNodeSource, /registerMeasuredNode\?\.\(normalizedMessageId, node\);/);
  assert.match(registerMessageNodeSource, /messageRefs\.current\.set\(normalizedMessageId, node\);/);
  assert.match(registerMessageNodeSource, /messageRefs\.current\.delete\(normalizedMessageId\);/);
});

test("message jumps do not use zero offset estimates for missing messages", () => {
  const virtualizerSource = readRepoFile("src/hooks/useTextChatVirtualizer.js");
  const estimateStart = virtualizerSource.indexOf("const estimateOffsetForMessageId = useCallback");
  const estimateEnd = virtualizerSource.indexOf("const topSpacerHeight", estimateStart);
  const estimateSource = virtualizerSource.slice(estimateStart, estimateEnd);

  const scrollManagerSource = readRepoFile("src/hooks/useTextChatScrollManager.js");
  const scrollToMessageStart = scrollManagerSource.indexOf("const scrollToMessage = useCallback");
  const scrollToMessageEnd = scrollManagerSource.indexOf("useEffect(() => () => {", scrollToMessageStart);
  const scrollToMessageSource = scrollManagerSource.slice(scrollToMessageStart, scrollToMessageEnd);

  assert.notEqual(estimateStart, -1);
  assert.notEqual(estimateEnd, -1);
  assert.match(estimateSource, /return null;/);
  assert.match(
    scrollToMessageSource,
    /if \(Number\.isFinite\(estimatedOffset\)\) \{\s*const targetTop = getTargetScrollTopForBlock\(list, estimatedOffset, 96, block\);\s*scrollToPosition\(targetTop/,
  );
});

test("pinned messages render as one switchable bar instead of navigation jump pill", () => {
  const panelsSource = readRepoFile("src/components/TextChatPanels.jsx");
  const pinnedPanelStart = panelsSource.indexOf("export function PinnedMessagesPanel");
  const pinnedPanelEnd = panelsSource.indexOf("export function ChatSelectionBar", pinnedPanelStart);
  const pinnedPanelSource = panelsSource.slice(pinnedPanelStart, pinnedPanelEnd);
  const navStart = panelsSource.indexOf("export function ChatNavigationBar");
  const navEnd = panelsSource.indexOf("export function ChatActionStatus", navStart);
  const navSource = panelsSource.slice(navStart, navEnd);

  assert.notEqual(pinnedPanelStart, -1);
  assert.notEqual(pinnedPanelEnd, -1);
  assert.match(pinnedPanelSource, /const \[activePinnedIndex, setActivePinnedIndex\] = useState\(0\);/);
  assert.match(pinnedPanelSource, /className="chat-pins__rail"/);
  assert.match(pinnedPanelSource, /setActivePinnedIndex\(pinnedIndex\)/);
  assert.match(pinnedPanelSource, /onOpenMessage\?\.\(activePinnedMessage\.id/);
  assert.doesNotMatch(pinnedPanelSource, /pinnedMessages\.map\(\(pinnedMessage\) =>/);
  assert.doesNotMatch(navSource, /latestPinned/);
  assert.doesNotMatch(navSource, /onOpenPinned/);
});

test("text chat view owns its shell CSS contract", () => {
  const viewSource = readRepoFile("src/features/text-chat/TextChatView.jsx");
  const layoutCss = readRepoFile("src/css/TextChatLayoutMessages.css");
  const panelCss = readRepoFile("src/css/TextChatPanelsAndOverlays.css");
  const containerRule = layoutCss.match(/\.textchat-container \{[\s\S]*?\n\}/)?.[0] || "";
  const messageShellRule = layoutCss.match(/\.messages-list-shell \{[\s\S]*?\n\}/)?.[0] || "";
  const inputAreaRule = panelCss.match(/\.input-area \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(viewSource, /import "\.\.\/\.\.\/css\/TextChat\.css";/);
  assert.match(containerRule, /display: flex;/);
  assert.match(containerRule, /flex-direction: column;/);
  assert.match(containerRule, /overflow: hidden;/);
  assert.match(messageShellRule, /flex: 1/);
  assert.match(messageShellRule, /min-height: 0;/);
  assert.match(inputAreaRule, /flex: 0 0 auto;/);
  assert.match(inputAreaRule, /position: relative;/);
  assert.match(inputAreaRule, /z-index: 2;/);
});
