import { Suspense, lazy } from "react";
import TextChatContextMenu from "../../components/TextChatContextMenu";
import TextChatComposer from "../../components/TextChatComposer";
import TextChatMessageList from "../../components/TextChatMessageList";
import { ChatActionStatus, ChatSelectionBar, JumpToLatestBar, MessageSearchPanel, PinnedMessagesPanel } from "../../components/TextChatPanels";

const TextChatForwardModal = lazy(() => import("../../components/TextChatForwardModal"));
const TextChatMediaPreview = lazy(() => import("../../components/TextChatMediaPreview"));

export default function TextChatView(props) {
  const {
    searchQuery,
    searchResults,
    scrollToMessage,
    scrollToLatest,
    pendingNewMessagesCount,
    actionFeedback,
    pinnedMessages,
    setPinnedMessages,
    selectionMode,
    selectedMessageIds,
    directTargets,
    openForwardModal,
    clearSelectionMode,
    messages,
    messagesListRef,
    messagesEndRef,
    messageRefs,
    floatingDateLabel,
    decryptedAttachmentsByMessageId,
    selectedMessageIdSet,
    highlightedMessageId,
    isDirectChat,
    currentUserId,
    user,
    toggleMessageSelection,
    openMessageContextMenu,
    openMediaPreview,
    handleToggleReaction,
    selectedFiles,
    setSelectedFiles,
    uploadingFile,
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
    preferExplicitSend,
    handleFileChange,
    stopReplyingToMessage,
    stopEditingMessage,
    handleCancelVoiceRecording,
    handleSpeechRecognitionToggle,
    syncComposerSelection,
    setComposerEmojiPickerOpen,
    insertComposerEmoji,
    sendAnimatedEmoji,
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
    handleOpenMediaPreviewFullscreen,
    updateMediaPreviewIndex,
    updateMediaPreviewZoom,
    resetMediaPreviewZoom,
    contextMenuRef,
    messageContextMenu,
    contextMenuActions,
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

  return (
    <div className="textchat-container">
      <MessageSearchPanel query={searchQuery.trim().toLowerCase()} results={searchResults} onOpenMessage={scrollToMessage} />
      <PinnedMessagesPanel
        pinnedMessages={pinnedMessages}
        onOpenMessage={scrollToMessage}
        onRemovePinned={(pinnedMessageId) =>
          setPinnedMessages((previous) => previous.filter((item) => String(item.id) !== String(pinnedMessageId)))
        }
      />
      {selectionMode ? (
        <ChatSelectionBar
          selectedCount={selectedMessageIds.length || 0}
          canForward={Boolean(selectedMessageIds.length && directTargets.length)}
          onForward={() => openForwardModal(selectedMessageIds)}
          onCancel={clearSelectionMode}
        />
      ) : null}
      <ChatActionStatus feedback={actionFeedback} />
      <JumpToLatestBar pendingCount={pendingNewMessagesCount} onJump={() => scrollToLatest("smooth")} />
      <TextChatMessageList
        messages={messages}
        messagesListRef={messagesListRef}
        messagesEndRef={messagesEndRef}
        messageRefs={messageRefs}
        floatingDateLabel={floatingDateLabel}
        decryptedAttachmentsByMessageId={decryptedAttachmentsByMessageId}
        selectedMessageIdSet={selectedMessageIdSet}
        highlightedMessageId={highlightedMessageId}
        isDirectChat={isDirectChat}
        currentUserId={currentUserId}
        user={user}
        selectionMode={selectionMode}
        onToggleSelection={toggleMessageSelection}
        onOpenContextMenu={openMessageContextMenu}
        onOpenMediaPreview={openMediaPreview}
        onToggleReaction={handleToggleReaction}
        onJumpToReply={scrollToMessage}
      />
      <TextChatComposer
        selectedFiles={selectedFiles}
        setSelectedFiles={setSelectedFiles}
        uploadingFile={uploadingFile}
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
        preferExplicitSend={preferExplicitSend}
        onFileChange={handleFileChange}
        onStopReplying={stopReplyingToMessage}
        onStopEditing={stopEditingMessage}
        onCancelVoiceRecording={handleCancelVoiceRecording}
        onSpeechRecognitionToggle={handleSpeechRecognitionToggle}
        onSyncComposerSelection={syncComposerSelection}
        onToggleEmojiPicker={(nextValue) => {
          syncComposerSelection();
          setComposerEmojiPickerOpen((previous) => (typeof nextValue === "boolean" ? nextValue : !previous));
        }}
        onInsertEmoji={insertComposerEmoji}
        onSendAnimatedEmoji={sendAnimatedEmoji}
        onApplyMentionSuggestion={applyMentionSuggestion}
        onSelectMentionSuggestionIndex={setSelectedMentionSuggestionIndex}
        onCloseMentionSuggestions={() => setMentionSuggestionsOpen(false)}
        onMessageChange={setMessage}
        onStopSpeechRecognition={stopSpeechRecognition}
        onStartEditingLatestOwnMessage={startEditingLatestOwnMessage}
        onSend={send}
      />
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
          onFullscreen={handleOpenMediaPreviewFullscreen}
          onNavigate={updateMediaPreviewIndex}
          onZoom={updateMediaPreviewZoom}
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
