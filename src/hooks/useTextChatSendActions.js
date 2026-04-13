import chatConnection from "../SignalR/ChatConnect";
import {
  prepareOutgoingAttachmentPayload,
  prepareOutgoingTextPayload,
} from "../security/chatPayloadCrypto";
import { clearChatDraft } from "../utils/chatDrafts";
import { extractMentionsFromText } from "../utils/messageMentions";
import { punctuateTypedMessageText } from "../utils/speechPunctuation";
import {
  getChatErrorMessage,
  MAX_FILE_SIZE_BYTES,
  MESSAGE_SEND_COOLDOWN_MS,
} from "../utils/textChatModel";

export default function useTextChatSendActions({
  message,
  setMessage,
  selectedFiles,
  setSelectedFiles,
  messageEditState,
  setMessageEditState,
  editDraftBackupRef,
  scopedChannelId,
  user,
  serverMembers,
  isDirectChat,
  uploadingFile,
  setUploadingFile,
  setErrorMessage,
  setActionFeedback,
  setIsChannelReady,
  replyState,
  setReplyState,
  voiceRecordingState,
  ensureChannelJoined,
  focusComposerToEnd,
  forceScrollToBottomRef,
  lastSendAtRef,
  joinedChannelRef,
  uploadAttachment,
  sendMessagesCompat,
  playDirectMessageSound,
}) {
  const buildUploadedAttachmentPayload = (attachment) => ({
    attachmentUrl: attachment.fileUrl || "",
    attachmentName: attachment.fileName || "",
    attachmentSize: attachment.size || null,
    attachmentContentType: attachment.contentType || "",
    attachmentEncryption: attachment.attachmentEncryption || null,
    voiceMessage: null,
  });

  const fetchAnimatedEmojiFile = async (emojiOption) => {
    const assetUrl = String(emojiOption?.assetUrl || "").trim();
    if (!assetUrl) {
      throw new Error("У этого смайлика нет доступного анимированного файла.");
    }

    const response = await fetch(assetUrl, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить анимированный смайлик.");
    }

    const blob = await response.blob();
    const normalizedUrl = assetUrl.split(/[?#]/, 1)[0];
    const rawFileName = normalizedUrl.split("/").filter(Boolean).pop() || `${String(emojiOption?.key || "emoji").trim() || "emoji"}.gif`;
    const fileType = blob.type || "image/gif";

    return new File([blob], rawFileName, { type: fileType });
  };

  const send = async () => {
    const rawMessageText = message.trim();
    const messageText = await punctuateTypedMessageText(rawMessageText);
    const filesToSend = selectedFiles;

    if (messageEditState && filesToSend.length) {
      setErrorMessage("Во время редактирования нельзя добавлять новые вложения.");
      return;
    }

    if ((!messageText && !filesToSend.length) || !scopedChannelId || uploadingFile || voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (!messageEditState && cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return;
    }

    const avatar = user?.avatarUrl || user?.avatar || "";
    const outgoingMentions = !isDirectChat ? extractMentionsFromText(messageText, serverMembers) : [];

    try {
      setErrorMessage("");
      await ensureChannelJoined();

      if (messageEditState?.messageId) {
        const preparedTextPayload = await prepareOutgoingTextPayload({
          text: messageText,
        });

        await chatConnection.invoke(
          "EditMessage",
          messageEditState.messageId,
          preparedTextPayload.message,
          preparedTextPayload.encryption || null,
          outgoingMentions
        );

        const preservedDraft = editDraftBackupRef.current;
        editDraftBackupRef.current = "";
        setMessageEditState(null);
        setMessage(preservedDraft);
        if (!preservedDraft) {
          clearChatDraft(user, scopedChannelId);
        }
        setActionFeedback({ tone: "success", message: "Изменения сохранены" });
        setIsChannelReady(true);
        focusComposerToEnd();
        return;
      }

      let attachments = [];
      if (filesToSend.length) {
        setUploadingFile(true);
        for (let index = 0; index < filesToSend.length; index += 1) {
          const fileItem = filesToSend[index];
          const preparedAttachment = await prepareOutgoingAttachmentPayload({
            file: fileItem,
          });
          const uploaded = await uploadAttachment({
            blob: preparedAttachment.uploadBlob,
            fileName: preparedAttachment.uploadFileName || fileItem.name || `attachment-${Date.now()}-${index}`,
          });
          attachments.push({
            fileUrl: uploaded?.fileUrl || null,
            fileName: uploaded?.fileName || fileItem.name || "attachment",
            size: uploaded?.size || preparedAttachment.uploadBlob.size || null,
            contentType: uploaded?.contentType || fileItem.type || "application/octet-stream",
            attachmentEncryption: null,
          });
        }
      }

      const payload = [{
        message: messageText,
        mentions: outgoingMentions,
        replyToMessageId: replyState?.messageId || "",
        replyToUsername: replyState?.username || "",
        replyPreview: replyState?.preview || "",
        attachments: attachments.map(buildUploadedAttachmentPayload),
        attachmentUrl: attachments[0]?.fileUrl || "",
        attachmentName: attachments[0]?.fileName || "",
        attachmentSize: attachments[0]?.size || null,
        attachmentContentType: attachments[0]?.contentType || "",
        attachmentEncryption: attachments[0]?.attachmentEncryption || null,
        voiceMessage: null,
      }];

      await sendMessagesCompat(scopedChannelId, avatar, payload);

      forceScrollToBottomRef.current = true;
      lastSendAtRef.current = Date.now();
      setMessage("");
      setReplyState(null);
      clearChatDraft(user, scopedChannelId);
      setSelectedFiles([]);
      setIsChannelReady(true);
      setActionFeedback(null);
      if (isDirectChat) {
        playDirectMessageSound("send");
      }
    } catch (error) {
      console.error(messageEditState ? "EditMessage error:" : "SendMessage error:", error);
      if (!messageEditState) {
        joinedChannelRef.current = "";
        setIsChannelReady(false);
      }
      setErrorMessage(getChatErrorMessage(
        error,
        messageEditState
          ? "Не удалось сохранить изменения сообщения."
          : "Не удалось отправить сообщение."
      ));
    } finally {
      setUploadingFile(false);
    }
  };

  const sendAnimatedEmoji = async (emojiOption) => {
    if (!emojiOption?.assetUrl || !scopedChannelId || uploadingFile || voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return false;
    }

    if (messageEditState) {
      setErrorMessage("Во время редактирования нельзя отправлять анимированные смайлики.");
      return false;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (!message.trim() && !selectedFiles.length && cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return false;
    }

    try {
      setErrorMessage("");
      const emojiFile = await fetchAnimatedEmojiFile(emojiOption);

      if (message.trim() || selectedFiles.length) {
        setSelectedFiles((previous) => [...previous, emojiFile]);
        focusComposerToEnd();
        return true;
      }

      setUploadingFile(true);
      await ensureChannelJoined();

      const uploaded = await uploadAttachment({
        blob: emojiFile,
        fileName: emojiFile.name,
      });

      const attachment = {
        fileUrl: uploaded?.fileUrl || "",
        fileName: uploaded?.fileName || emojiFile.name,
        size: uploaded?.size || emojiFile.size || null,
        contentType: uploaded?.contentType || emojiFile.type || "image/gif",
        attachmentEncryption: null,
      };
      const avatar = user?.avatarUrl || user?.avatar || "";
      const payload = [{
        message: "",
        mentions: [],
        replyToMessageId: replyState?.messageId || "",
        replyToUsername: replyState?.username || "",
        replyPreview: replyState?.preview || "",
        attachments: [buildUploadedAttachmentPayload(attachment)],
        attachmentUrl: attachment.fileUrl || "",
        attachmentName: attachment.fileName || "",
        attachmentSize: attachment.size || null,
        attachmentContentType: attachment.contentType || "",
        attachmentEncryption: null,
        voiceMessage: null,
      }];

      await sendMessagesCompat(scopedChannelId, avatar, payload);

      forceScrollToBottomRef.current = true;
      lastSendAtRef.current = Date.now();
      setReplyState(null);
      setIsChannelReady(true);
      setActionFeedback(null);
      if (isDirectChat) {
        playDirectMessageSound("send");
      }
      return true;
    } catch (error) {
      console.error("Send animated emoji error:", error);
      joinedChannelRef.current = "";
      setIsChannelReady(false);
      setErrorMessage(getChatErrorMessage(error, "Не удалось отправить анимированный смайлик."));
      return false;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    const validFiles = [];
    let hasOversizedFile = false;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        hasOversizedFile = true;
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) {
      setErrorMessage("Размер файла не должен быть больше 100 МБ.");
      return;
    }

    if (hasOversizedFile) {
      setErrorMessage("Некоторые файлы пропущены: размер файла не должен быть больше 100 МБ.");
    } else {
      setErrorMessage("");
    }

    setSelectedFiles((previous) => [...previous, ...validFiles]);
  };

  return {
    send,
    sendAnimatedEmoji,
    handleFileChange,
  };
}
