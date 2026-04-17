import { Profiler, Suspense, lazy, useCallback, useEffect, useRef } from "react";
import TextChatContextMenu from "../../components/TextChatContextMenu";
import TextChatProfileModal from "../../components/TextChatProfileModal";
import TextChatUserContextMenu from "../../components/TextChatUserContextMenu";
import TextChatComposer from "../../components/TextChatComposer";
import TextChatMessageList from "../../components/TextChatMessageList";
import { ChatActionStatus, ChatNavigationBar, ChatSelectionBar, JumpToLatestBar, MessageSearchPanel, PinnedMessagesPanel } from "../../components/TextChatPanels";
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
    scrollToMessage,
    scrollToLatest,
    pendingNewMessagesCount,
    firstUnreadMessageId,
    canReturnToJumpPoint,
    onJumpToFirstUnread,
    onReturnToJumpPoint,
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
    visibleMessages,
    messagesListRef,
    messagesEndRef,
    messageRefs,
    virtualizationEnabled,
    topSpacerHeight,
    bottomSpacerHeight,
    registerMeasuredNode,
    floatingDateLabel,
    decryptedAttachmentsByMessageId,
    selectedMessageIdSet,
    highlightedMessageId,
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
    removePendingUpload,
    retryPendingUpload,
    clearPendingUploads,
    updatePendingUploadCompressionMode,
    updatePendingUploadSpoilerMode,
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
    handleSpeechRecognitionToggle,
    syncComposerSelection,
    setComposerEmojiPickerOpen,
    insertComposerEmoji,
    sendAnimatedEmoji,
    sendPoll,
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

  const stableScrollToMessage = useStableCallback(scrollToMessage);
  const stableToggleMessageSelection = useStableCallback(toggleMessageSelection);
  const stableOpenMessageContextMenu = useStableCallback(openMessageContextMenu);
  const stableOpenUserContextMenu = useStableCallback(openUserContextMenu);
  const stableOpenMediaPreview = useStableCallback(openMediaPreview);
  const stableHandleToggleReaction = useStableCallback(handleToggleReaction);
  const stableOpenForwardModal = useStableCallback(openForwardModal);
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

  return (
    <div className="textchat-container">
      <MessageSearchPanel query={searchQuery.trim().toLowerCase()} results={searchResults} onOpenMessage={stableScrollToMessage} />
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
      <ChatNavigationBar
        firstUnreadMessageId={firstUnreadMessageId}
        mentionMessages={mentionMessages}
        replyMessages={replyMessages}
        pinnedMessages={pinnedMessages}
        canReturnToJumpPoint={canReturnToJumpPoint}
        onJumpToFirstUnread={onJumpToFirstUnread}
        onOpenMention={stableScrollToMessage}
        onOpenReply={stableScrollToMessage}
        onOpenPinned={stableScrollToMessage}
        onReturnToJumpPoint={onReturnToJumpPoint}
      />
      <JumpToLatestBar pendingCount={pendingNewMessagesCount} onJump={() => scrollToLatest("auto")} />
      {PERF_ENABLED ? (
        <Profiler id="TextChatMessageList" onRender={handleMessageListRender}>
          <TextChatMessageList
            messages={messages}
            visibleMessages={visibleMessages}
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
          />
        </Profiler>
      ) : (
        <TextChatMessageList
          messages={messages}
          visibleMessages={visibleMessages}
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
        />
      )}
      {PERF_ENABLED ? (
        <Profiler id="TextChatComposer" onRender={handleComposerRender}>
          <TextChatComposer
            selectedFiles={selectedFiles}
            uploadingFile={uploadingFile}
            composerDropActive={composerDropActive}
            replyState={replyState}
            messageEditState={messageEditState}
            voiceRecordingState={voiceRecordingState}
            voiceRecordingDurationMs={voiceRecordingDurationMs}
            speechRecognitionActive={speechRecognitionActive}
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
            onRemovePendingUpload={removePendingUpload}
            onRetryPendingUpload={retryPendingUpload}
            onClearPendingUploads={clearPendingUploads}
            onUpdatePendingUploadCompressionMode={updatePendingUploadCompressionMode}
            onUpdatePendingUploadSpoilerMode={updatePendingUploadSpoilerMode}
            onToggleBatchUploadGrouping={toggleBatchUploadGrouping}
            onToggleBatchUploadSendAsDocuments={toggleBatchUploadSendAsDocuments}
            onToggleBatchUploadRememberChoice={toggleBatchUploadRememberChoice}
            onDragEnter={onComposerDragEnter}
            onDragOver={onComposerDragOver}
            onDragLeave={onComposerDragLeave}
            onDrop={onComposerDrop}
            onStopReplying={stopReplyingToMessage}
            onStopEditing={stopEditingMessage}
            onCancelVoiceRecording={handleCancelVoiceRecording}
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
            onApplyMentionSuggestion={applyMentionSuggestion}
            onSelectMentionSuggestionIndex={setSelectedMentionSuggestionIndex}
            onCloseMentionSuggestions={() => setMentionSuggestionsOpen(false)}
            onMessageChange={setMessage}
            onStopSpeechRecognition={stopSpeechRecognition}
            onStartEditingLatestOwnMessage={startEditingLatestOwnMessage}
            onSend={send}
          />
        </Profiler>
      ) : (
        <TextChatComposer
          selectedFiles={selectedFiles}
          uploadingFile={uploadingFile}
          composerDropActive={composerDropActive}
          replyState={replyState}
          messageEditState={messageEditState}
          voiceRecordingState={voiceRecordingState}
          voiceRecordingDurationMs={voiceRecordingDurationMs}
          speechRecognitionActive={speechRecognitionActive}
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
          onRemovePendingUpload={removePendingUpload}
          onRetryPendingUpload={retryPendingUpload}
          onClearPendingUploads={clearPendingUploads}
          onUpdatePendingUploadCompressionMode={updatePendingUploadCompressionMode}
          onUpdatePendingUploadSpoilerMode={updatePendingUploadSpoilerMode}
          onToggleBatchUploadGrouping={toggleBatchUploadGrouping}
          onToggleBatchUploadSendAsDocuments={toggleBatchUploadSendAsDocuments}
          onToggleBatchUploadRememberChoice={toggleBatchUploadRememberChoice}
          onDragEnter={onComposerDragEnter}
          onDragOver={onComposerDragOver}
          onDragLeave={onComposerDragLeave}
          onDrop={onComposerDrop}
          onStopReplying={stopReplyingToMessage}
          onStopEditing={stopEditingMessage}
          onCancelVoiceRecording={handleCancelVoiceRecording}
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
          onApplyMentionSuggestion={applyMentionSuggestion}
          onSelectMentionSuggestionIndex={setSelectedMentionSuggestionIndex}
          onCloseMentionSuggestions={() => setMentionSuggestionsOpen(false)}
          onMessageChange={setMessage}
          onStopSpeechRecognition={stopSpeechRecognition}
          onStartEditingLatestOwnMessage={startEditingLatestOwnMessage}
          onSend={send}
        />
      )}
      {errorMessage ? <div className="chat-error">{errorMessage}</div> : null}
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
