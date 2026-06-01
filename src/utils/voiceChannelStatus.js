export const VOICE_CHANNEL_STATUS_WORD_LIMIT = 12;
export const VOICE_CHANNEL_STATUS_CHAR_LIMIT = 80;

export const normalizeVoiceChannelStatus = (value) => {
  const collapsed = String(value || "").replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }

  const wordLimited = collapsed.split(" ").slice(0, VOICE_CHANNEL_STATUS_WORD_LIMIT).join(" ");
  return wordLimited.slice(0, VOICE_CHANNEL_STATUS_CHAR_LIMIT).trim();
};
