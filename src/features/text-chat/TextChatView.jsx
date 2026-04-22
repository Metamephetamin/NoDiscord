import { Profiler, Suspense, lazy, useCallback, useEffect, useRef } from "react";
import TextChatContextMenu from "../../components/TextChatContextMenu";
import TextChatProfileModal from "../../components/TextChatProfileModal";
import TextChatUserContextMenu from "../../components/TextChatUserContextMenu";
import TextChatComposer from "../../components/TextChatComposer";
import TextChatMessageList from "../../components/TextChatMessageList";
import { ChatActionStatus, ChatNavigationBar, ChatSelectionBar, JumpToLatestButton, MessageSearchPanel, PinnedMessagesPanel } from "../../components/TextChatPanels";
import useTextChatScrollManager from "../../hooks/useTextChatScrollManager";
import { PERF_ENABLED, recordReactCommit } from "../../utils/perf";

const TextChatForwardModal = lazy(() => import("../../components/TextChatForwardModal"));
const TextChatMediaPreview = lazy(() => import("../../components/TextChatMediaPreview"));

function useStableCallback(callback) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args) => callbackRef.current?.(...args), []);
}

export default function TextChatView(props) {
  const {
    searchQuery,
    searchResults,
    scopedChannelId,
    navigationRequest,
    onNavigationIndexChange,
    mentionMessages,
    replyMessages,
    actionFeedback,
    pinnedMessages,
    setPinnedMessages,
    selectionMode,
    selectedMessageIds,
    directTargets,
    serverMembers,
    serverRoles,
    openForwardModal,
    clearSelectionMode,
    messages,
    hasMoreHistory,
    isLoadingOlderHistory,
    onLoadOlderHistory,
    visibleMessages,
    visibleStartIndex,
    messagesListRef,
    messagesEndRef,
    messageRefs,
    virtualizationEnabled,
    topSpacerHeight,
    bottomSpacerHeight,
    registerMeasuredNode,
    estimateMessageOffsetById,
    decryptedAttachmentsByMessageId,
    selectedMessageIdSet,
    highlightedMessageId,
    setHighlightedMessageId,
    isDirectChat,
    currentUserId,
    user,
    toggleMessageSelection,
    openMessageContextMenu,
    openUserContextMenu,
    openMediaPreview,
    handleToggleReaction,
    handleComposerPaste,
    selectedFiles,
    uploadingFile,
    composerDropActive,
    replyState,
    messageEditState,
    voiceRecordingState,
    voiceRecordingDurationMs,
    speechRecognitionActive,
    speechMicLevel,
    speechCaptureState,
    composerEmojiButtonRef,
    composerEmojiPickerOpen,
    composerEmojiPickerRef,
    mentionSuggestionsOpen,
    mentionSuggestions,
    mentionSuggestionsRef,
    selectedMentionSuggestionIndex,
    textareaRef,
    message,
    batchUploadOptions,
    preferExplicitSend,
    handleFileChange,
    queueFiles,
    removePendingUpload,
    cancelLocalEchoUpload,
    retryLocalEchoUpload,
    removeLocalEchoUpload,
    retryPendingUpload,
    clearPendingUploads,
    toggleBatchUploadGrouping,
    toggleBatchUploadSendAsDocuments,
    toggleBatchUploadRememberChoice,
    onComposerDragEnter,
    onComposerDragOver,
    onComposerDragLeave,
    onComposerDrop,
    stopReplyingToMessage,
    stopEditingMessage,
    handleCancelVoiceRecording,
    handleVoiceRecordPointerDown,
    handleVoiceRecordPointerMove,
    handleVoiceRecordPointerUp,
    handleVoiceRecordPointerCancel,
    handleSpeechRecognitionPointerDown,
    handleSpeechRecognitionPointerMove,
    handleSpeechRecognitionPointerUp,
    handleSpeechRecognitionPointerCancel,
    handleSpeechRecognitionToggle,
    syncComposerSelection,
    setComposerEmojiPickerOpen,
    insertComposerEmoji,
    sendAnimatedEmoji,
    sendPoll,
    sendLocation,
    handleInsertMentionByUserId,
    applyMentionSuggestion,
    setSelectedMentionSuggestionIndex,
    setMentionSuggestionsOpen,
    setMessage,
    stopSpeechRecognition,
    startEditingLatestOwnMessage,
    send,
    errorMessage,
    mediaPreview,
    mediaPreviewVideoRef,
    setMediaPreview,
    handleDownloadAttachment,
    handleDownloadAllMediaPreviewItems,
    handleOpenMediaPreviewFullscreen,
    updateMediaPreviewIndex,
    updateMediaPreviewZoom,
    updateMediaPreviewPan,
    resetMediaPreviewZoom,
    contextMenuRef,
    messageContextMenu,
    contextMenuActions,
    userContextMenuRef,
    userContextMenu,
    userContextMenuSections,
    closeUserContextMenu,
    profileModal,
    closeProfileModal,
    handleProfileModalDirectChat,
    handleProfileModalStartCall,
    handleProfileModalAddFriend,
    handleProfileModalCopyUserId,
    primaryReactions,
    stickerReactions,
    reactionStickerPanelOpen,
    setReactionStickerPanelOpen,
    isContextReactionActive,
    forwardModal,
    forwardableMessages,
    availableForwardTargets,
    closeForwardModal,
    setForwardModal,
    toggleForwardTarget,
    handleForwardSubmit,
  } = props;

  const stableToggleMessageSelection = useStableCallback(toggleMessageSelection);
  const stableOpenMessageContextMenu = useStableCallback(openMessageContextMenu);
  const stableOpenUserContextMenu = useStableCallback(openUserContextMenu);
  const stableOpenMediaPreview = useStableCallback(openMediaPreview);
  const stableHandleToggleReaction = useStableCallback(handleToggleReaction);
  const stableOpenForwardModal = useStableCallback(openForwardModal);
  const {
    floatingDateLabel,
    pendingNewMessagesCount,
    firstUnreadMessageId,
    canReturnToJumpPoint,
    showJumpToLatestButton,
    scrollToLatest,
    forceScrollToLatest,
    scrollToMessage,
    jumpToFirstUnread,
    returnToJumpPoint,
  } = useTextChatScrollManager({
    messages,
    visibleMessages,
    scopedChannelId,
    currentUserId,
    isDirectChat,
    messagesListRef,
    messagesEndRef,
    messageRefs,
    setHighlightedMessageId,
    estimateMessageOffsetById,
    hasMoreHistory,
    isLoadingOlderHistory,
    onLoadOlderHistory,
  });
  const stableScrollToMessage = useStableCallback(scrollToMessage);
  const handleSearchPanelOpenMessage = useStableCallback((messageId) => {
    scrollToMessage(messageId, {
      behavior: "auto",
      block: "center",
      rememberCurrent: true,
      highlight: true,
      highlightDurationMs: 2800,
    });
  });
  const latestOwnMessageSignatureRef = useRef("");
  const scheduleAggressiveScrollToLatest = useStableCallback(() => {
    forceScrollToLatest("auto");
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      forceScrollToLatest("auto");
    });
    window.setTimeout(() => {
      forceScrollToLatest("auto");
    }, 60);
    window.setTimeout(() => {
      forceScrollToLatest("auto");
    }, 180);
  });
  const stableRequestScrollToLatest = useStableCallback(() => {
    scheduleAggressiveScrollToLatest();
  });
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const handleMessageListRender = useCallback((id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    recordReactCommit("text-chat", id, phase, actualDuration, baseDuration, startTime, commitTime, {
      messageCount: messages.length,
      visibleMessageCount: visibleMessages.length,
      virtualizationEnabled,
    });
  }, [messages.length, visibleMessages.length, virtualizationEnabled]);
  const handleComposerRender = useCallback((id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    recordReactCommit("text-chat", id, phase, actualDuration, baseDuration, startTime, commitTime, {
      hasBatchUploadSheet: selectedFiles.length > 1 && selectedFiles.every((selectedFile) => selectedFile?.kind === "image"),
      selectedFileCount: selectedFiles.length,
    });
  }, [selectedFiles]);

  useEffect(() => {
    latestOwnMessageSignatureRef.current = "";
  }, [scopedChannelId]);

  useEffect(() => {
    const latestMessage = Array.isArray(messages) && messages.length ? messages[messages.length - 1] : null;
    const latestAuthorId = String(
      latestMessage?.authorUserId
      || latestMessage?.userId
      || latestMessage?.senderId
      || latestMessage?.fromUserId
      || ""
    );
    const latestMessageId = String(latestMessage?.id || "");
    const nextSignature = latestMessageId
      ? `${scopedChannelId}:${latestMessageId}`
      : "";

    if (!nextSignature) {
      latestOwnMessageSignatureRef.current = "";
      return;
    }

    if (!latestOwnMessageSignatureRef.current) {
      latestOwnMessageSignatureRef.current = nextSignature;
      return;
    }

    if (latestOwnMessageSignatureRef.current === nextSignature) {
      return;
    }

    latestOwnMessageSignatureRef.current = nextSignature;

    if (!currentUserId || latestAuthorId !== currentUserId) {
      return;
    }

    scheduleAggressiveScrollToLatest();
  }, [currentUserId, messages, scopedChannelId, scheduleAggressiveScrollToLatest]);

  useEffect(() => {
    if (typeof onNavigationIndexChange !== "function") {
      return;
    }

    onNavigationIndexChange({
      channelId: scopedChannelId,
      pinnedMessages,
      searchResults,
      mentionMessages,
      replyMessages,
      firstUnreadMessageId,
      canReturnToJumpPoint,
    });
  }, [
    canReturnToJumpPoint,
    firstUnreadMessageId,
    mentionMessages,
    onNavigationIndexChange,
    pinnedMessages,
    replyMessages,
    scopedChannelId,
    searchResults,
  ]);

  useEffect(() => {
    if (!navigationRequest || String(navigationRequest?.channelId || "") !== String(scopedChannelId)) {
      return;
    }

    if (navigationRequest.type === "message" && navigationRequest.messageId) {
      scrollToMessage(navigationRequest.messageId, { behavior: "auto", block: "center", rememberCurrent: true });
      return;
    }

    if (navigationRequest.type === "firstUnread") {
      jumpToFirstUnread();
      return;
    }

    if (navigationRequest.type === "latest") {
      scrollToLatest("auto");
      return;
    }

    if (navigationRequest.type === "jumpBack") {
      returnToJumpPoint();
    }
  }, [jumpToFirstUnread, navigationRequest, returnToJumpPoint, scopedChannelId, scrollToLatest, scrollToMessage]);

  return (
    <div
      className={`textchat-container ${composerDropActive ? "textchat-container--drag-active" : ""}`}
      onDragEnter={onComposerDragEnter}
      onDragOver={onComposerDragOver}
      onDragLeave={onComposerDragLeave}
      onDrop={onComposerDrop}
    >
      {composerDropActive ? (
        <div className="textchat-drop-overlay" aria-hidden="true">
          <div className="textchat-drop-overlay__panel">
            <strong>Перетащите файлы сюда</strong>
            <span>Можно бросать изображения, видео и документы в любую часть чата</span>
          </div>
        </div>
      ) : null}
      <MessageSearchPanel key={normalizedSearchQuery} query={normalizedSearchQuery} results={searchResults} onOpenMessage={handleSearchPanelOpenMessage} />
      <PinnedMessagesPanel
        pinnedMessages={pinnedMessages}
        onOpenMessage={stableScrollToMessage}
        onRemovePinned={(pinnedMessageId) =>
          setPinnedMessages((previous) => previous.filter((item) => String(item.id) !== String(pinnedMessageId)))
        }
      />
      {selectionMode ? (
        <ChatSelectionBar
          selectedCount={selectedMessageIds.length || 0}
          canForward={Boolean(selectedMessageIds.length && directTargets.length)}
          onForward={() => stableOpenForwardModal(selectedMessageIds)}
          onCancel={clearSelectionMode}
        />
      ) : null}
      <ChatActionStatus feedback={actionFeedback} />
      {errorMessage ? <div className="chat-error">{errorMessage}</div> : null}
      <ChatNavigationBar
        firstUnreadMessageId={firstUnreadMessageId}
        mentionMessages={mentionMessages}
        replyMessages={replyMessages}
        pinnedMessages={pinnedMessages}
        canReturnToJumpPoint={canReturnToJumpPoint}
        onJumpToFirstUnread={jumpToFirstUnread}
        onOpenMention={stableScrollToMessage}
        onOpenReply={stableScrollToMessage}
        onOpenPinned={stableScrollToMessage}
        onReturnToJumpPoint={returnToJumpPoint}
      />
      <JumpToLatestButton
        visible={showJumpToLatestButton}
        pendingCount={pendingNewMessagesCount}
        onJump={() => forceScrollToLatest("auto")}
      />
      {PERF_ENABLED ? (
        <Profiler id="TextChatMessageList" onRender={handleMessageListRender}>
          <TextChatMessageList
            messages={messages}
            visibleMessages={visibleMessages}
            visibleStartIndex={visibleStartIndex}
            messagesListRef={messagesListRef}
            messagesEndRef={messagesEndRef}
            messageRefs={messageRefs}
            virtualizationEnabled={virtualizationEnabled}
            topSpacerHeight={topSpacerHeight}
            bottomSpacerHeight={bottomSpacerHeight}
            registerMeasuredNode={registerMeasuredNode}
            floatingDateLabel={floatingDateLabel}
            decryptedAttachmentsByMessageId={decryptedAttachmentsByMessageId}
            selectedMessageIdSet={selectedMessageIdSet}
            highlightedMessageId={highlightedMessageId}
            isDirectChat={isDirectChat}
            currentUserId={currentUserId}
            user={user}
            serverMembers={serverMembers}
            serverRoles={serverRoles}
            selectionMode={selectionMode}
            onToggleSelection={stableToggleMessageSelection}
            onOpenContextMenu={stableOpenMessageContextMenu}
            onOpenUserContextMenu={stableOpenUserContextMenu}
            onInsertMentionByUserId={handleInsertMentionByUserId}
            onOpenMediaPreview={stableOpenMediaPreview}
            onToggleReaction={stableHandleToggleReaction}
            onJumpToReply={stableScrollToMessage}
            onCancelLocalEchoUpload={cancelLocalEchoUpload}
            onRetryLocalEchoUpload={retryLocalEchoUpload}
            onRemoveLocalEchoUpload={removeLocalEchoUpload}
          />
        </Profiler>
      ) : (
        <TextChatMessageList
          messages={messages}
          visibleMessages={visibleMessages}
          visibleStartIndex={visibleStartIndex}
          messagesListRef={messagesListRef}
          messagesEndRef={messagesEndRef}
          messageRefs={messageRefs}
          virtualizationEnabled={virtualizationEnabled}
          topSpacerHeight={topSpacerHeight}
          bottomSpacerHeight={bottomSpacerHeight}
          registerMeasuredNode={registerMeasuredNode}
          floatingDateLabel={floatingDateLabel}
          decryptedAttachmentsByMessageId={decryptedAttachmentsByMessageId}
          selectedMessageIdSet={selectedMessageIdSet}
          highlightedMessageId={highlightedMessageId}
          isDirectChat={isDirectChat}
          currentUserId={currentUserId}
          user={user}
          serverMembers={serverMembers}
          serverRoles={serverRoles}
          selectionMode={selectionMode}
          onToggleSelection={stableToggleMessageSelection}
          onOpenContextMenu={stableOpenMessageContextMenu}
          onOpenUserContextMenu={stableOpenUserContextMenu}
          onInsertMentionByUserId={handleInsertMentionByUserId}
          onOpenMediaPreview={stableOpenMediaPreview}
          onToggleReaction={stableHandleToggleReaction}
          onJumpToReply={stableScrollToMessage}
          onCancelLocalEchoUpload={cancelLocalEchoUpload}
          onRetryLocalEchoUpload={retryLocalEchoUpload}
          onRemoveLocalEchoUpload={removeLocalEchoUpload}
        />
      )}
      {PERF_ENABLED ? (
        <Profiler id="TextChatComposer" onRender={handleComposerRender}>
          <TextChatComposer
            selectedFiles={selectedFiles}
            uploadingFile={uploadingFile}
            composerDropActive={composerDropActive}
            errorMessage={errorMessage}
            replyState={replyState}
            messageEditState={messageEditState}
            voiceRecordingState={voiceRecordingState}
            voiceRecordingDurationMs={voiceRecordingDurationMs}
            speechRecognitionActive={speechRecognitionActive}
            speechMicLevel={speechMicLevel}
            speechCaptureState={speechCaptureState}
            composerEmojiButtonRef={composerEmojiButtonRef}
            composerEmojiPickerOpen={composerEmojiPickerOpen}
            composerEmojiPickerRef={composerEmojiPickerRef}
            mentionSuggestionsOpen={mentionSuggestionsOpen}
            mentionSuggestions={mentionSuggestions}
            mentionSuggestionsRef={mentionSuggestionsRef}
            selectedMentionSuggestionIndex={selectedMentionSuggestionIndex}
            textareaRef={textareaRef}
            message={message}
            serverMembers={serverMembers}
            serverRoles={serverRoles}
            batchUploadOptions={batchUploadOptions}
            preferExplicitSend={preferExplicitSend}
            onFileChange={handleFileChange}
            onQueueFiles={queueFiles}
            onRemovePendingUpload={removePendingUpload}
            onRetryPendingUpload={retryPendingUpload}
            onClearPendingUploads={clearPendingUploads}
            onToggleBatchUploadGrouping={toggleBatchUploadGrouping}
            onToggleBatchUploadSendAsDocuments={toggleBatchUploadSendAsDocuments}
            onToggleBatchUploadRememberChoice={toggleBatchUploadRememberChoice}
            onStopReplying={stopReplyingToMessage}
            onStopEditing={stopEditingMessage}
            onCancelVoiceRecording={handleCancelVoiceRecording}
            onVoiceRecordPointerDown={handleVoiceRecordPointerDown}
            onVoiceRecordPointerMove={handleVoiceRecordPointerMove}
            onVoiceRecordPointerUp={handleVoiceRecordPointerUp}
            onVoiceRecordPointerCancel={handleVoiceRecordPointerCancel}
            onSpeechRecognitionPointerDown={handleSpeechRecognitionPointerDown}
            onSpeechRecognitionPointerMove={handleSpeechRecognitionPointerMove}
            onSpeechRecognitionPointerUp={handleSpeechRecognitionPointerUp}
            onSpeechRecognitionPointerCancel={handleSpeechRecognitionPointerCancel}
            onSpeechRecognitionToggle={handleSpeechRecognitionToggle}
            onPaste={handleComposerPaste}
            onSyncComposerSelection={syncComposerSelection}
            onToggleEmojiPicker={(nextValue) => {
              syncComposerSelection();
              setComposerEmojiPickerOpen((previous) => (typeof nextValue === "boolean" ? nextValue : !previous));
            }}
            onInsertEmoji={insertComposerEmoji}
            onSendAnimatedEmoji={sendAnimatedEmoji}
            onSendPoll={sendPoll}
            onSendLocation={sendLocation}
            onApplyMentionSuggestion={applyMentionSuggestion}
            onSelectMentionSuggestionIndex={setSelectedMentionSuggestionIndex}
            onCloseMentionSuggestions={() => setMentionSuggestionsOpen(false)}
            onMessageChange={setMessage}
            onStopSpeechRecognition={stopSpeechRecognition}
            onStartEditingLatestOwnMessage={startEditingLatestOwnMessage}
            onRequestScrollToLatest={stableRequestScrollToLatest}
            onSend={send}
          />
        </Profiler>
      ) : (
        <TextChatComposer
          selectedFiles={selectedFiles}
          uploadingFile={uploadingFile}
          composerDropActive={composerDropActive}
          errorMessage={errorMessage}
          replyState={replyState}
          messageEditState={messageEditState}
          voiceRecordingState={voiceRecordingState}
          voiceRecordingDurationMs={voiceRecordingDurationMs}
          speechRecognitionActive={speechRecognitionActive}
          speechMicLevel={speechMicLevel}
          speechCaptureState={speechCaptureState}
          composerEmojiButtonRef={composerEmojiButtonRef}
          composerEmojiPickerOpen={composerEmojiPickerOpen}
          composerEmojiPickerRef={composerEmojiPickerRef}
          mentionSuggestionsOpen={mentionSuggestionsOpen}
          mentionSuggestions={mentionSuggestions}
          mentionSuggestionsRef={mentionSuggestionsRef}
          selectedMentionSuggestionIndex={selectedMentionSuggestionIndex}
          textareaRef={textareaRef}
          message={message}
          serverMembers={serverMembers}
          serverRoles={serverRoles}
          batchUploadOptions={batchUploadOptions}
          preferExplicitSend={preferExplicitSend}
          onFileChange={handleFileChange}
          onQueueFiles={queueFiles}
          onRemovePendingUpload={removePendingUpload}
          onRetryPendingUpload={retryPendingUpload}
          onClearPendingUploads={clearPendingUploads}
          onToggleBatchUploadGrouping={toggleBatchUploadGrouping}
          onToggleBatchUploadSendAsDocuments={toggleBatchUploadSendAsDocuments}
          onToggleBatchUploadRememberChoice={toggleBatchUploadRememberChoice}
          onStopReplying={stopReplyingToMessage}
          onStopEditing={stopEditingMessage}
          onCancelVoiceRecording={handleCancelVoiceRecording}
          onVoiceRecordPointerDown={handleVoiceRecordPointerDown}
          onVoiceRecordPointerMove={handleVoiceRecordPointerMove}
          onVoiceRecordPointerUp={handleVoiceRecordPointerUp}
          onVoiceRecordPointerCancel={handleVoiceRecordPointerCancel}
          onSpeechRecognitionPointerDown={handleSpeechRecognitionPointerDown}
          onSpeechRecognitionPointerMove={handleSpeechRecognitionPointerMove}
          onSpeechRecognitionPointerUp={handleSpeechRecognitionPointerUp}
          onSpeechRecognitionPointerCancel={handleSpeechRecognitionPointerCancel}
          onSpeechRecognitionToggle={handleSpeechRecognitionToggle}
          onPaste={handleComposerPaste}
          onSyncComposerSelection={syncComposerSelection}
          onToggleEmojiPicker={(nextValue) => {
            syncComposerSelection();
            setComposerEmojiPickerOpen((previous) => (typeof nextValue === "boolean" ? nextValue : !previous));
          }}
          onInsertEmoji={insertComposerEmoji}
          onSendAnimatedEmoji={sendAnimatedEmoji}
          onSendPoll={sendPoll}
          onSendLocation={sendLocation}
          onApplyMentionSuggestion={applyMentionSuggestion}
          onSelectMentionSuggestionIndex={setSelectedMentionSuggestionIndex}
          onCloseMentionSuggestions={() => setMentionSuggestionsOpen(false)}
          onMessageChange={setMessage}
          onStopSpeechRecognition={stopSpeechRecognition}
          onStartEditingLatestOwnMessage={startEditingLatestOwnMessage}
          onRequestScrollToLatest={stableRequestScrollToLatest}
          onSend={send}
        />
      )}
      <Suspense fallback={null}>
        <TextChatMediaPreview
          mediaPreview={mediaPreview}
          videoRef={mediaPreviewVideoRef}
          onClose={() => setMediaPreview(null)}
          onDownload={() =>
            handleDownloadAttachment({
              attachmentKind: mediaPreview.type,
              attachmentUrl: mediaPreview.url,
              attachmentSourceUrl: mediaPreview.sourceUrl || mediaPreview.url,
              attachmentName: mediaPreview.name,
              attachmentContentType: mediaPreview.contentType || "",
              attachmentEncryption: mediaPreview.attachmentEncryption || null,
              messageId: mediaPreview.messageId || "",
              attachmentIndex: mediaPreview.attachmentIndex || 0,
            })
          }
          onDownloadAll={handleDownloadAllMediaPreviewItems}
          onFullscreen={handleOpenMediaPreviewFullscreen}
          onNavigate={updateMediaPreviewIndex}
          onZoom={updateMediaPreviewZoom}
          onPan={updateMediaPreviewPan}
          onResetZoom={resetMediaPreviewZoom}
        />
      </Suspense>
      <TextChatContextMenu
        menuRef={contextMenuRef}
        menu={messageContextMenu}
        actions={contextMenuActions}
        primaryReactions={primaryReactions}
        stickerReactions={stickerReactions}
        isStickerPanelOpen={reactionStickerPanelOpen}
        onToggleStickerPanel={() => setReactionStickerPanelOpen((previous) => !previous)}
        isReactionActive={isContextReactionActive}
        onToggleReaction={handleToggleReaction}
      />
      <TextChatUserContextMenu
        menuRef={userContextMenuRef}
        menu={userContextMenu}
        sections={userContextMenuSections}
        onClose={closeUserContextMenu}
      />
      <TextChatProfileModal
        profile={profileModal}
        onClose={closeProfileModal}
        onOpenDirectChat={handleProfileModalDirectChat}
        onStartDirectCall={handleProfileModalStartCall}
        onAddFriend={handleProfileModalAddFriend}
        onCopyUserId={handleProfileModalCopyUserId}
      />
      <Suspense fallback={null}>
        <TextChatForwardModal
          forwardModal={forwardModal}
          forwardableCount={forwardableMessages.length}
          targets={availableForwardTargets}
          onClose={closeForwardModal}
          onQueryChange={(query) => setForwardModal((previous) => ({ ...previous, query }))}
          onToggleTarget={toggleForwardTarget}
          onSubmit={handleForwardSubmit}
        />
      </Suspense>
    </div>
  );
}
