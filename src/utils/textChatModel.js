import { getPollPreview, parsePollMessage } from "./pollMessages";
import { formatVoiceMessageDuration, normalizeVoiceMessageMetadata, restoreRussianSpeechPunctuation } from "./voiceMessages";
import { autocorrectUserText } from "./textAutocorrect";
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MESSAGE_SEND_COOLDOWN_MS = 0;
export const COMPAT_FORWARD_DELAY_MS = 0;
export const VOICE_LOCK_DRAG_THRESHOLD_PX = 34;
export const VOICE_CANCEL_DRAG_THRESHOLD_PX = 46;
export const VOICE_LEVEL_SAMPLE_INTERVAL_MS = 72;
export const VOICE_RECORDING_AUDIO_BITS_PER_SECOND = 192000;
export const VOICE_RECORDING_SAMPLE_RATE = 48000;
export const VOICE_HIGH_PASS_FREQUENCY_HZ = 105;
export const VOICE_LOW_SHELF_FREQUENCY_HZ = 180;
export const VOICE_LOW_SHELF_GAIN_DB = -2.2;
export const VOICE_PRESENCE_FREQUENCY_HZ = 3150;
export const VOICE_PRESENCE_GAIN_DB = 2.8;
export const VOICE_HIGH_SHELF_FREQUENCY_HZ = 6200;
export const VOICE_HIGH_SHELF_GAIN_DB = 1.2;
export const VOICE_LOW_PASS_FREQUENCY_HZ = 9800;
export const VOICE_OUTPUT_GAIN = 1.08;
export const SPEECH_RECOGNITION_RESTART_DELAY_MS = 240;
export const AUTO_PUNCTUATE_TYPED_MESSAGES = true;
export const ENABLE_VOICE_MESSAGE_BUTTON = false; // voice messages are disabled; keep only speech-to-text input
export const ENABLE_SPEECH_INPUT_BUTTON = true; // flip to false to hide the speech-to-text mic button again

const createEmojiOption = ([key, glyph, label]) => ({
  key: `symbl_${key}`,
  glyph,
  label,
});

const SYMBL_SMILEYS_AND_EMOTION_DATA = [
  ["grinning_face", "😀", "Ухмыляющееся лицо"],
  ["winking_face", "😉", "Подмигивающее лицо"],
  ["grinning_face_smiling_eyes", "😄", "Ухмыляющееся лицо со смеющимися глазами"],
  ["squinting_laugh", "😆", "Смеющееся лицо с закрытыми глазами"],
  ["sweat_smile", "😅", "Улыбка в холодном поту"],
  ["face_tears_joy", "😂", "Лицо со слезами радости"],
  ["smiling_face_smiling_eyes", "😊", "Улыбающееся лицо со смеющимися глазами"],
  ["slightly_smiling_face", "🙂", "Слегка улыбающееся лицо"],
  ["smiling_face_open_mouth_smiling_eyes", "😃", "Улыбающееся лицо с открытым ртом"],
  ["upside_down_face", "🙃", "Лицо вверх ногами"],
  ["smiling_face_halo", "😇", "Улыбающееся лицо с нимбом"],
  ["smiling_face_open_mouth", "😮", "Улыбающееся лицо с открытым ртом"],
  ["rolling_laugh", "🤣", "Катается по полу от смеха"],
  ["melting_face", "🫠", "Плавящееся лицо"],
  ["kissing_face_closed_eyes", "😚", "Целующееся лицо с закрытыми глазами"],
  ["kissing_face_smiling_eyes", "😙", "Целующееся лицо со смеющимися глазами"],
  ["heart_eyes", "😍", "Улыбающееся лицо с глазами-сердечками"],
  ["kissing_face", "😗", "Целующееся лицо"],
  ["face_blowing_kiss", "😘", "Лицо, посылающее поцелуй"],
  ["smiling_face_hearts", "🥰", "Улыбающееся лицо с сердечками"],
  ["smiling_face_tear", "🥲", "Улыбающееся лицо со слезой"],
  ["star_struck", "🤩", "Ухмыляющееся лицо с глазами-звёздами"],
  ["outlined_smile", "☺️", "Улыбающееся лицо"],
  ["face_savoring_food", "😋", "Лицо, смакующее деликатес"],
  ["face_tongue", "😛", "Лицо с высунутым языком"],
  ["winking_tongue", "😜", "Лицо с языком и подмигиванием"],
  ["squinting_tongue", "😝", "Лицо с языком и закрытыми глазами"],
  ["zany_face", "🤪", "Ухмыляющееся лицо с разными глазами"],
  ["money_mouth", "🤑", "Лицо со знаком доллара"],
  ["thinking_face", "🤔", "Задумчивое лицо"],
  ["hand_over_mouth", "🤭", "Лицо с рукой у рта"],
  ["hugging_face", "🤗", "Обнимашки"],
  ["shushing_face", "🤫", "Лицо с указательным пальцем у губ"],
  ["saluting_face", "🫡", "Приветствующее лицо"],
  ["open_eyes_hand_mouth", "🫢", "Лицо с рукой у рта"],
  ["peeking_face", "🫣", "Подглядывающее лицо"],
  ["neutral_face", "😐", "Нейтральное выражение лица"],
  ["face_without_mouth", "😶", "Лицо без рта"],
  ["grimacing_face", "😬", "Гримаса"],
  ["smirking_face", "😏", "Усмехающееся лицо"],
  ["expressionless_face", "😑", "Ничего не выражающее лицо"],
  ["unamused_face", "😒", "Лицо с выражением неодобрения"],
  ["rolling_eyes", "🙄", "Лицо с вращающимися глазами"],
  ["raised_eyebrow", "🤨", "Лицо с поднятой бровью"],
  ["zipper_mouth", "🤐", "Лицо с молнией вместо рта"],
  ["lying_face", "🤥", "Лгущее лицо"],
  ["shaking_face", "🫨", "Трясущееся лицо"],
  ["dotted_line_face", "🫥", "Лицо пунктирной линией"],
  ["relieved_face", "😌", "Расслабленное лицо"],
  ["pensive_face", "😔", "Задумчивое лицо"],
  ["sleepy_face", "😪", "Сонное лицо"],
  ["sleeping_face", "😴", "Спящее лицо"],
  ["drooling_face", "🤤", "Слюнки текут"],
  ["face_bags_under_eyes", "🫩", "Лицо с мешками под глазами"],
  ["medical_mask", "😷", "Лицо в медицинской маске"],
  ["dizzy_face", "😵", "Головокружение"],
  ["cold_face", "🥶", "Замерзающее лицо"],
  ["sneezing_face", "🤧", "Чихает"],
  ["exploding_head", "🤯", "Шокированное лицо"],
  ["woozy_face", "🥴", "Лицо с неровными глазами"],
  ["thermometer_face", "🤒", "Лицо с градусником"],
  ["hot_face", "🥵", "Вспотевшее лицо"],
  ["vomiting_face", "🤮", "Лицо блюющее"],
  ["head_bandage", "🤕", "Лицо с повязкой на голове"],
  ["nauseated_face", "🤢", "Тошнота"],
  ["disguised_face", "🥸", "Замаскированное лицо"],
  ["cowboy_hat_face", "🤠", "Лицо в ковбойской шляпе"],
  ["partying_face", "🥳", "Лицо с праздничным рожком"],
  ["sunglasses_face", "😎", "Улыбающееся лицо в солнечных очках"],
  ["nerd_face", "🤓", "Лицо ботаника"],
  ["monocle_face", "🧐", "Лицо с моноклем"],
  ["confused_face", "😕", "Смущённое лицо"],
  ["flushed_face", "😳", "Покрасневшее лицо"],
  ["anguished_face", "😧", "Мучительное выражение лица"],
  ["tired_face", "😫", "Усталое лицо"],
  ["screaming_face", "😱", "Лицо, кричащее от страха"],
  ["disappointed_face", "😞", "Разочарованное лицо"],
  ["hushed_face", "😯", "Лицо с открытым ртом"],
  ["loudly_crying_face", "😭", "Лицо громко плачет"],
  ["anxious_sweat_face", "😰", "Лицо в холодном поту"],
  ["weary_face", "😩", "Утомлённое лицо"],
  ["crying_face", "😢", "Плачущее лицо"],
  ["astonished_face", "😲", "Удивлённое лицо"],
  ["fearful_face", "😨", "Лицо в страхе"],
  ["slightly_frowning_face", "🙁", "Слегка нахмурившееся лицо"],
  ["persevering_face", "😣", "Упорное выражение лица"],
  ["open_mouth_cold_sweat", "😥", "Лицо с открытым ртом в холодном поту"],
  ["pleading_face", "🥺", "Лицо с умоляющими глазами"],
  ["yawning_face", "🥱", "Зевающее лицо"],
  ["holding_back_tears", "🥹", "Лицо сдерживает слезы"],
  ["diagonal_mouth", "🫤", "Лицо с диагональным ртом"],
  ["confounded_face", "😖", "Искажённое лицо"],
  ["angry_face", "😠", "Злое лицо"],
  ["pouting_face", "😡", "Лицо, надувшее губы"],
  ["symbols_mouth", "🤬", "Злое лицо с символами у рта"],
  ["triumph_face", "😤", "Лицо с выражением триумфа"],
  ["skull", "💀", "Череп"],
  ["hundred_points", "💯", "Сто очков"],
  ["kiss_mark", "💋", "Следы поцелуя"],
  ["anger_symbol", "💢", "Гнев"],
  ["collision", "💥", "Столкновение"],
  ["sweat_droplets", "💦", "Брызги пота"],
  ["dizzy", "💫", "Головокружение"],
  ["speech_balloon", "💬", "Выноска для разговора"],
  ["zzz", "💤", "Спать"],
  ["decorative_heart", "💟", "Декоративное сердце"],
  ["revolving_hearts", "💞", "Вращающиеся сердца"],
  ["love_letter", "💌", "Любовное письмо"],
  ["beating_heart", "💓", "Бьющееся сердце"],
  ["two_hearts", "💕", "Два сердца"],
  ["growing_heart", "💗", "Растущее сердце"],
  ["broken_heart", "💔", "Разбитое сердце"],
  ["heart_arrow", "💘", "Сердце, пронзённое стрелой"],
  ["green_heart", "💚", "Зелёное сердце"],
  ["blue_heart", "💙", "Голубое сердце"],
  ["purple_heart", "💜", "Пурпурное сердце"],
  ["yellow_heart", "💛", "Жёлтое сердце"],
  ["sparkling_heart", "💖", "Игристое сердце"],
  ["gift_heart", "💝", "Сердце с бантиком"],
  ["black_heart", "🖤", "Чёрное сердце"],
  ["orange_heart", "🧡", "Оранжевое сердце"],
  ["brown_heart", "🤎", "Коричневое сердце"],
  ["white_heart", "🤍", "Белое сердце"],
  ["light_blue_heart", "🩵", "Светло-голубое сердце"],
  ["pink_heart", "🩷", "Розовое сердце"],
  ["grey_heart", "🩶", "Серое сердце"],
  ["red_heart", "❤️", "Красное сердце"],
  ["heart_exclamation", "❣️", "Восклицательный знак в виде сердца"],
];

const PRIORITY_SYMBL_EMOJI_KEYS = [
  "melting_face",
  "smiling_face_tear",
  "star_struck",
  "saluting_face",
  "open_eyes_hand_mouth",
  "peeking_face",
  "shaking_face",
  "dotted_line_face",
  "holding_back_tears",
  "diagonal_mouth",
  "smiling_face_hearts",
  "rolling_laugh",
  "symbols_mouth",
  "exploding_head",
  "partying_face",
  "speech_balloon",
];

const buildOrderedSymblEmojiOptions = () => {
  const options = SYMBL_SMILEYS_AND_EMOTION_DATA.map(createEmojiOption);
  const optionBySourceKey = new Map(options.map((option) => [option.key.replace(/^symbl_/, ""), option]));
  const priorityOptions = PRIORITY_SYMBL_EMOJI_KEYS.map((key) => optionBySourceKey.get(key)).filter(Boolean);
  const priorityKeys = new Set(priorityOptions.map((option) => option.key));
  return [
    ...priorityOptions,
    ...options.filter((option) => !priorityKeys.has(option.key)),
  ];
};

const LEGACY_COMPOSER_EMOJI_OPTIONS = [
  { key: "grinning", glyph: "🫠", label: "Плавящееся лицо" },
  { key: "smile", glyph: "🥲", label: "Улыбающееся лицо со слезой" },
  { key: "beaming", glyph: "🤩", label: "Глаза-звёзды" },
  { key: "laugh", glyph: "🤣", label: "Катается по полу от смеха" },
  { key: "rofl", glyph: "🤣", label: "Смех до слёз" },
  { key: "wink", glyph: "🫡", label: "Приветствующее лицо" },
  { key: "heart_eyes", glyph: "🥰", label: "Улыбающееся лицо с сердечками" },
  { key: "cool", glyph: "🫢", label: "Лицо с рукой у рта" },
  { key: "thinking", glyph: "🫣", label: "Подглядывающее лицо" },
  { key: "wow", glyph: "🫨", label: "Трясущееся лицо" },
  { key: "pleading", glyph: "🥹", label: "Лицо сдерживает слезы" },
  { key: "cry", glyph: "🫤", label: "Лицо с диагональным ртом" },
  { key: "angry", glyph: "🤬", label: "Злое лицо с символами у рта" },
  { key: "mind_blown", glyph: "🤯", label: "Шок" },
  { key: "party", glyph: "🥳", label: "Праздник" },
  { key: "fire", glyph: "💥", label: "Столкновение" },
  { key: "heart", glyph: "❤️", label: "Любовь" },
  { key: "thumbs_up", glyph: "💯", label: "Сто очков" },
];
const LEGACY_MESSAGE_REACTION_OPTIONS = [
  ...LEGACY_COMPOSER_EMOJI_OPTIONS,
];
const LEGACY_EMOJI_OPTIONS = [...LEGACY_COMPOSER_EMOJI_OPTIONS, ...LEGACY_MESSAGE_REACTION_OPTIONS];
export const COMPOSER_EMOJI_OPTIONS = buildOrderedSymblEmojiOptions();
export const MESSAGE_REACTION_OPTIONS = COMPOSER_EMOJI_OPTIONS;
export const PRIMARY_MESSAGE_REACTION_OPTIONS = MESSAGE_REACTION_OPTIONS.slice(0, 8);
export const STICKER_MESSAGE_REACTION_OPTIONS = MESSAGE_REACTION_OPTIONS.slice(8);
const ANIMATED_EMOJI_BY_KEY = new Map(
  [...LEGACY_EMOJI_OPTIONS, ...MESSAGE_REACTION_OPTIONS].map((emojiOption) => [emojiOption.key, emojiOption])
);
const ANIMATED_EMOJI_BY_GLYPH = new Map(
  [...LEGACY_EMOJI_OPTIONS, ...MESSAGE_REACTION_OPTIONS].map((emojiOption) => [emojiOption.glyph, emojiOption])
);
const ANIMATED_EMOJI_GLYPH_BY_LOOKUP_KEY = new Map();

function normalizeAnimatedEmojiLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/[?#]/, 1)[0]
    .replace(/^.*[\\/]/, "")
    .replace(/\.(?:gif|png|jpe?g|webp|avif)$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

[
  ...LEGACY_EMOJI_OPTIONS,
  ...MESSAGE_REACTION_OPTIONS,
].forEach((emojiOption) => {
  const glyph = String(emojiOption?.glyph || "").trim();
  if (!glyph) {
    return;
  }

  [
    emojiOption?.key,
    emojiOption?.assetUrl,
    emojiOption?.assetPath,
  ].forEach((value) => {
    const normalizedKey = normalizeAnimatedEmojiLookupKey(value);
    if (normalizedKey) {
      ANIMATED_EMOJI_GLYPH_BY_LOOKUP_KEY.set(normalizedKey, glyph);
    }
  });
});

export function getAnimatedEmojiOption(reaction) {
  const key = String(reaction?.key || "");
  const glyph = String(reaction?.glyph || "");
  return ANIMATED_EMOJI_BY_KEY.get(key) || ANIMATED_EMOJI_BY_GLYPH.get(glyph) || null;
}

export function resolveAnimatedEmojiFallbackGlyph(...values) {
  for (const value of values) {
    if (!value) {
      continue;
    }

    if (typeof value === "object") {
      const directGlyph = String(value?.glyph || value?.emoji || "").trim();
      if (directGlyph) {
        return directGlyph;
      }

      const nestedMatch = resolveAnimatedEmojiFallbackGlyph(
        value?.key,
        value?.assetUrl,
        value?.assetPath,
        value?.attachmentName,
        value?.attachmentUrl,
        value?.attachmentSourceUrl
      );
      if (nestedMatch) {
        return nestedMatch;
      }
      continue;
    }

    const normalizedKey = normalizeAnimatedEmojiLookupKey(value);
    if (!normalizedKey) {
      continue;
    }

    const exactMatch = ANIMATED_EMOJI_GLYPH_BY_LOOKUP_KEY.get(normalizedKey);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return "";
}

export function getMentionQueryContext(text, caretPosition) {
  const normalizedText = String(text || "");
  const caret = Math.max(0, Math.min(Number(caretPosition) || 0, normalizedText.length));
  const beforeCaret = normalizedText.slice(0, caret);
  const triggerIndex = beforeCaret.lastIndexOf("@");
  if (triggerIndex < 0) {
    return null;
  }

  const precedingCharacter = triggerIndex > 0 ? beforeCaret[triggerIndex - 1] : "";
  if (precedingCharacter && /[\p{L}\p{N}_.-]/u.test(precedingCharacter)) {
    return null;
  }

  const betweenTriggerAndCaret = normalizedText.slice(triggerIndex + 1, caret);
  if (/\s/.test(betweenTriggerAndCaret)) {
    return null;
  }

  let tokenEnd = caret;
  while (tokenEnd < normalizedText.length && !/\s/u.test(normalizedText[tokenEnd])) {
    tokenEnd += 1;
  }

  return {
    triggerIndex,
    tokenEnd,
    query: betweenTriggerAndCaret,
  };
}

export const getUserName = (user) => user?.nickname || user?.firstName || user?.first_name || user?.name || "User";
export const getScopedChatChannelId = (serverId, channelId) =>
  serverId && channelId ? `server:${serverId}::channel:${channelId}` : "";

function normalizeAttachmentUrlValue(value) {
  return String(value || "").trim();
}

function getAttachmentUrlValue(attachment) {
  return normalizeAttachmentUrlValue(
    attachment?.attachmentUrl
    || attachment?.AttachmentUrl
    || attachment?.attachment_url
    || attachment?.attachmentSourceUrl
    || attachment?.AttachmentSourceUrl
    || attachment?.attachment_source_url
    || attachment?.fileUrl
    || attachment?.FileUrl
    || attachment?.file_url
    || attachment?.url
    || attachment?.Url
    || attachment?.src
    || attachment?.Src
  );
}

export function normalizeAttachmentItems(messageItem) {
  const sourceAttachments = Array.isArray(messageItem?.attachments)
    ? messageItem.attachments
    : Array.isArray(messageItem?.Attachments)
      ? messageItem.Attachments
      : [];

  const normalizedFromArray = sourceAttachments
    .map((attachment, index) => {
      const attachmentUrl = getAttachmentUrlValue(attachment);

      return {
        id: String(attachment?.id || attachment?.Id || `${messageItem?.id || "message"}:${index}`),
        attachmentUrl,
        attachmentSourceUrl: normalizeAttachmentUrlValue(attachment?.attachmentSourceUrl || attachment?.AttachmentSourceUrl || attachment?.attachment_source_url || attachmentUrl),
        attachmentName: String(attachment?.attachmentName || attachment?.AttachmentName || attachment?.attachment_name || attachment?.fileName || attachment?.FileName || attachment?.file_name || attachment?.name || attachment?.Name || "").trim(),
        attachmentSize: Number.isFinite(Number(attachment?.attachmentSize))
          ? Number(attachment.attachmentSize)
          : Number.isFinite(Number(attachment?.AttachmentSize))
            ? Number(attachment.AttachmentSize)
            : Number.isFinite(Number(attachment?.attachment_size))
              ? Number(attachment.attachment_size)
            : Number.isFinite(Number(attachment?.size))
              ? Number(attachment.size)
              : Number.isFinite(Number(attachment?.Size))
                ? Number(attachment.Size)
                : null,
        attachmentContentType: String(attachment?.attachmentContentType || attachment?.AttachmentContentType || attachment?.attachment_content_type || attachment?.contentType || attachment?.ContentType || attachment?.content_type || attachment?.type || attachment?.Type || "").trim(),
        attachmentAsFile: Boolean(attachment?.attachmentAsFile || attachment?.AttachmentAsFile || attachment?.attachment_as_file),
        attachmentEncryption: attachment?.attachmentEncryption || attachment?.AttachmentEncryption || attachment?.attachment_encryption || null,
        voiceMessage: normalizeVoiceMessageMetadata(attachment?.voiceMessage || attachment?.VoiceMessage || attachment?.voice_message),
        attachmentIndex: Number.isFinite(Number(attachment?.attachmentIndex))
          ? Number(attachment.attachmentIndex)
          : Number.isFinite(Number(attachment?.AttachmentIndex))
            ? Number(attachment.AttachmentIndex)
            : Number.isFinite(Number(attachment?.attachment_index))
              ? Number(attachment.attachment_index)
              : index,
      };
    })
    .filter((attachment) => attachment.attachmentUrl || attachment.attachmentEncryption || attachment.voiceMessage);

  if (normalizedFromArray.length) {
    return normalizedFromArray;
  }

  const legacyAttachmentUrl = getAttachmentUrlValue(messageItem);
  const legacyAttachmentEncryption = messageItem?.attachmentEncryption || messageItem?.AttachmentEncryption || messageItem?.attachment_encryption || null;
  const legacyAttachmentAsFile = Boolean(messageItem?.attachmentAsFile || messageItem?.AttachmentAsFile || messageItem?.attachment_as_file);
  const legacyVoiceMessage = normalizeVoiceMessageMetadata(messageItem?.voiceMessage || messageItem?.VoiceMessage || messageItem?.voice_message);

  if (!legacyAttachmentUrl && !legacyAttachmentEncryption && !legacyVoiceMessage) {
    return [];
  }

  return [{
    id: String(messageItem?.id || "message"),
    attachmentUrl: legacyAttachmentUrl,
    attachmentSourceUrl: normalizeAttachmentUrlValue(messageItem?.attachmentSourceUrl || messageItem?.AttachmentSourceUrl || messageItem?.attachment_source_url || legacyAttachmentUrl),
    attachmentName: String(messageItem?.attachmentName || messageItem?.AttachmentName || messageItem?.attachment_name || messageItem?.fileName || messageItem?.FileName || messageItem?.file_name || messageItem?.name || messageItem?.Name || "").trim(),
    attachmentSize: Number.isFinite(Number(messageItem?.attachmentSize))
      ? Number(messageItem.attachmentSize)
      : Number.isFinite(Number(messageItem?.AttachmentSize))
        ? Number(messageItem.AttachmentSize)
        : Number.isFinite(Number(messageItem?.attachment_size))
          ? Number(messageItem.attachment_size)
        : Number.isFinite(Number(messageItem?.size))
          ? Number(messageItem.size)
          : Number.isFinite(Number(messageItem?.Size))
            ? Number(messageItem.Size)
            : null,
    attachmentContentType: String(messageItem?.attachmentContentType || messageItem?.AttachmentContentType || messageItem?.attachment_content_type || messageItem?.contentType || messageItem?.ContentType || messageItem?.content_type || messageItem?.type || messageItem?.Type || "").trim(),
    attachmentAsFile: legacyAttachmentAsFile,
    attachmentEncryption: legacyAttachmentEncryption,
    voiceMessage: legacyVoiceMessage,
    attachmentIndex: 0,
  }];
}

export function getPrimaryAttachment(messageItem) {
  return normalizeAttachmentItems(messageItem)[0] || null;
}

export function getAttachmentKind(messageItem) {
  const primaryAttachment = getPrimaryAttachment(messageItem);
  if (primaryAttachment?.attachmentAsFile && primaryAttachment?.attachmentUrl) {
    return "file";
  }

  if (primaryAttachment?.attachmentContentType?.startsWith("image/")) {
    return "image";
  }

  if (primaryAttachment?.attachmentContentType?.startsWith("video/")) {
    return "video";
  }

  if (primaryAttachment?.attachmentUrl) {
    return "file";
  }

  return "";
}

export function getDownloadLabel(kind) {
  if (kind === "image") {
    return "Скачать фото";
  }

  if (kind === "video") {
    return "Скачать видео";
  }

  return "Скачать файл";
}

export function getAttachmentCacheKey(messageId, attachmentIndex = 0) {
  return `${String(messageId || "")}:${Number(attachmentIndex) || 0}`;
}

export function getMessagePreview(messageItem) {
  const text = String(messageItem?.message || "").trim();
  const pollPreview = getPollPreview(text);
  if (pollPreview) {
    return pollPreview;
  }

  if (text) {
    return text;
  }

  const attachments = normalizeAttachmentItems(messageItem);
  const voiceAttachment = attachments.find((attachment) => attachment.voiceMessage);
  if (voiceAttachment?.voiceMessage) {
    return buildVoiceMessageLabel(voiceAttachment.voiceMessage.durationMs);
  }

  if (attachments.length > 1) {
    return `${attachments.length} вложений`;
  }

  const kind = getAttachmentKind(messageItem);
  if (kind === "image") {
    return "Изображение";
  }

  if (kind === "video") {
    return "Видео";
  }

  return String(messageItem?.attachmentName || "Файл").trim() || "Вложение";
}

export function buildReplyPreview(messageItem) {
  const preview = getMessagePreview(messageItem);
  return String(preview || "").trim().slice(0, 140);
}

export function buildReplySnapshot(messageItem) {
  if (!messageItem?.id) {
    return null;
  }

  return {
    messageId: String(messageItem.id),
    username: String(messageItem.username || "User").trim() || "User",
    preview: buildReplyPreview(messageItem),
  };
}

export function createPinnedSnapshot(messageItem) {
  return {
    id: messageItem.id,
    username: String(messageItem.username || "User"),
    preview: getMessagePreview(messageItem),
    timestamp: messageItem.timestamp,
  };
}

export function getMessagePoll(messageItem) {
  return parsePollMessage(messageItem?.message || "");
}

export function isVoiceMessage(messageItem) {
  return Boolean(messageItem?.voiceMessage) && (Boolean(messageItem?.attachmentUrl) || Boolean(messageItem?.attachmentEncryption));
}

export function buildVoiceMessageLabel(durationMs) {
  return durationMs > 0 ? `Голосовое сообщение • ${formatVoiceMessageDuration(durationMs)}` : "Голосовое сообщение";
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function shouldAutoPunctuateTypedText(text) {
  const normalizedText = String(text || "").trim();
  if (!AUTO_PUNCTUATE_TYPED_MESSAGES || normalizedText.length < 8) {
    return false;
  }

  if (!/[а-яё]/i.test(normalizedText)) {
    return false;
  }

  if (/https?:\/\/|www\.|```|^\s*[/>]/i.test(normalizedText)) {
    return false;
  }

  const words = normalizedText.split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

export function formatTypedMessageText(text) {
  const normalizedText = autocorrectUserText(String(text || "").trim());
  if (!shouldAutoPunctuateTypedText(normalizedText)) {
    return normalizedText;
  }

  return autocorrectUserText(restoreRussianSpeechPunctuation(normalizedText, { finalize: true }));
}

export function getChatErrorMessage(error, fallbackMessage) {
  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) {
    return fallbackMessage;
  }

  if (rawMessage.includes("Failed to invoke 'SendMessage' due to an error on the server.")) {
    return "Локальный backend вернул ошибку при отправке. Перезапустите backend в профиле Development и посмотрите точный текст ошибки в его консоли.";
  }

  if (rawMessage.includes("Failed to invoke 'ForwardMessages' due to an error on the server.")) {
    return "Локальный backend вернул ошибку при пересылке сообщений. Перезапустите backend в профиле Development и посмотрите точный текст ошибки в его консоли.";
  }

  if (rawMessage.includes("Method does not exist")) {
    return "Backend ещё не поддерживает новую возможность. Перезапустите сервер и повторите действие.";
  }

  if (rawMessage.includes("Forbidden")) {
    return "Нет доступа к этому чату.";
  }

  if (rawMessage.includes("Unauthorized")) {
    return "Сессия недействительна. Войдите снова.";
  }

  return rawMessage;
}

export function sleep(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export function revokeAttachmentObjectUrl(entry) {
  if (entry?.objectUrl) {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // ignore object URL cleanup failures
    }
  }
}

export function isMissingHubMethodError(error, methodName) {
  const rawMessage = String(error?.message || error?.toString?.() || "");
  if (!rawMessage) {
    return false;
  }

  return rawMessage.includes("Method does not exist")
    || rawMessage.includes(`'${methodName}'`)
    || rawMessage.includes(`"${methodName}"`);
}

export function normalizeReactions(reactions) {
  return Array.isArray(reactions)
    ? reactions
      .map((reaction) => {
        const emojiOption = getAnimatedEmojiOption(reaction);
        return {
          key: String(reaction?.key || ""),
          glyph: String(reaction?.glyph || emojiOption?.glyph || ""),
          label: String(emojiOption?.label || ""),
          assetUrl: String(emojiOption?.assetUrl || ""),
          count: Number(reaction?.count || 0),
          reactorUserIds: Array.isArray(reaction?.reactorUserIds)
            ? reaction.reactorUserIds.map((item) => String(item || "")).filter(Boolean)
            : [],
          users: Array.isArray(reaction?.users)
            ? reaction.users
              .map((user) => ({
                userId: String(user?.userId || ""),
                displayName: String(user?.displayName || user?.userId || "User"),
                avatarUrl: String(user?.avatarUrl || user?.avatar_url || ""),
              }))
              .filter((user) => user.userId)
            : [],
        };
      })
      .filter((reaction) => reaction.key && reaction.glyph && reaction.count > 0)
    : [];
}

