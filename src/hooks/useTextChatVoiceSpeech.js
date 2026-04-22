import { useEffect, useRef, useState } from "react";
import { prepareOutgoingAttachmentPayload } from "../security/chatPayloadCrypto";
import { punctuateTextOnServer } from "../utils/speechPunctuation";
import {
  buildVoiceWaveform,
  getSupportedVoiceRecordingMimeType,
  getVoiceRecordingExtension,
  MAX_VOICE_MESSAGE_DURATION_MS,
  restoreRussianSpeechPunctuation,
} from "../utils/voiceMessages";
import {
  getChatErrorMessage,
  getSpeechRecognitionConstructor,
  SPEECH_RECOGNITION_RESTART_DELAY_MS,
  VOICE_HIGH_PASS_FREQUENCY_HZ,
  VOICE_HIGH_SHELF_FREQUENCY_HZ,
  VOICE_HIGH_SHELF_GAIN_DB,
  VOICE_LEVEL_SAMPLE_INTERVAL_MS,
  VOICE_LOCK_DRAG_THRESHOLD_PX,
  VOICE_PRESENCE_FREQUENCY_HZ,
  VOICE_PRESENCE_GAIN_DB,
  VOICE_RECORDING_AUDIO_BITS_PER_SECOND,
  VOICE_RECORDING_SAMPLE_RATE,
} from "../utils/textChatModel";

export default function useTextChatVoiceSpeech({
  user,
  scopedChannelId,
  message,
  setMessage,
  textareaRef,
  uploadingFile,
  setUploadingFile,
  setErrorMessage,
  setIsChannelReady,
  lastSendAtRef,
  ensureChannelJoined,
  uploadAttachment,
  sendMessagesCompat,
  isDirectChat,
  playDirectMessageSound,
}) {
  const [voiceRecordingState, setVoiceRecordingState] = useState("idle");
  const [voiceRecordingDurationMs, setVoiceRecordingDurationMs] = useState(0);
  const [, setVoiceMicLevel] = useState(0);
  const [speechRecognitionActive, setSpeechRecognitionActive] = useState(false);
  const [speechMicLevel, setSpeechMicLevel] = useState(0);
  const [speechCaptureState, setSpeechCaptureState] = useState("idle");

  const voiceRecorderRef = useRef(null);
  const voiceInputStreamRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceRecordingChunksRef = useRef([]);
  const voiceRecordingStartAtRef = useRef(0);
  const voicePointerStateRef = useRef({ pointerId: null, startY: 0, locked: false });
  const speechPointerStateRef = useRef({ pointerId: null, startY: 0, locked: false });
  const voiceAudioContextRef = useRef(null);
  const voiceAnalyserRef = useRef(null);
  const voiceLevelFrameRef = useRef(0);
  const voiceLevelSamplesRef = useRef([]);
  const voiceLastSampleAtRef = useRef(0);
  const speechRecognitionRef = useRef(null);
  const speechAudioContextRef = useRef(null);
  const speechAnalyserRef = useRef(null);
  const speechMeterStreamRef = useRef(null);
  const speechLevelFrameRef = useRef(0);
  const speechFinalTranscriptRef = useRef("");
  const speechDraftBaseRef = useRef("");
  const speechDisplayedTranscriptRef = useRef("");
  const speechPunctuationRequestIdRef = useRef(0);
  const speechShouldRestartRef = useRef(false);
  const speechRestartTimeoutRef = useRef(0);
  const speechSessionIdRef = useRef(0);
  const speechTransientErrorCountRef = useRef(0);
  const speechLastResultAtRef = useRef(0);

  const SPEECH_RECOGNITION_MAX_RESTART_DELAY_MS = 4000;
  const SPEECH_RECOGNITION_NETWORK_WARNING_DELAY_MS = 7000;
  const PREFERRED_VOICE_SAMPLE_SIZE = 24;
  const MAX_VOICE_SAMPLE_SIZE = 32;

  const getMicrophoneAccessErrorMessage = (error, fallbackMessage) => {
    const errorName = String(error?.name || error?.error || "").trim();
    switch (errorName) {
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "not-allowed":
      case "service-not-allowed":
        return "Доступ к микрофону запрещен. Разрешите микрофон для сайта и попробуйте снова.";
      case "NotFoundError":
      case "DevicesNotFoundError":
      case "audio-capture":
        return "Микрофон не найден или занят другой программой.";
      case "NotReadableError":
      case "TrackStartError":
        return "Не удалось получить звук с микрофона. Проверьте, не занят ли он другой программой.";
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return "Текущие настройки микрофона не поддерживаются этим устройством.";
      default:
        return fallbackMessage;
    }
  };

  const reportVoiceSpeechError = (fallbackMessage, error, { logLevel = "error" } = {}) => {
    const nextMessage = getMicrophoneAccessErrorMessage(error, fallbackMessage);
    const logger = logLevel === "warn" ? console.warn : console.error;
    logger("Voice/speech error:", error);
    setErrorMessage(nextMessage);
    return nextMessage;
  };

  const buildPreferredVoiceCaptureConstraints = () => ({
    sampleRate: VOICE_RECORDING_SAMPLE_RATE,
    sampleSize: { ideal: PREFERRED_VOICE_SAMPLE_SIZE },
    advanced: [
      { sampleSize: MAX_VOICE_SAMPLE_SIZE },
      { sampleSize: PREFERRED_VOICE_SAMPLE_SIZE },
      { sampleSize: 16 },
    ],
  });

  const stopVoiceLevelLoop = () => {
    if (voiceLevelFrameRef.current) {
      cancelAnimationFrame(voiceLevelFrameRef.current);
      voiceLevelFrameRef.current = 0;
    }
  };

  const stopSpeechLevelLoop = () => {
    if (speechLevelFrameRef.current) {
      cancelAnimationFrame(speechLevelFrameRef.current);
      speechLevelFrameRef.current = 0;
    }
  };

  const cleanupVoiceRecordingResources = () => {
    stopVoiceLevelLoop();
    voiceAnalyserRef.current = null;
    setVoiceMicLevel(0);

    if (voiceAudioContextRef.current) {
      voiceAudioContextRef.current.close().catch(() => {});
      voiceAudioContextRef.current = null;
    }

    const processedStream = voiceStreamRef.current;
    const inputStream = voiceInputStreamRef.current;

    if (processedStream) {
      processedStream.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }

    if (inputStream && inputStream !== processedStream) {
      inputStream.getTracks().forEach((track) => track.stop());
    }
    voiceInputStreamRef.current = null;

    voiceRecorderRef.current = null;
    voiceRecordingChunksRef.current = [];
    voiceLevelSamplesRef.current = [];
    voiceLastSampleAtRef.current = 0;
    voicePointerStateRef.current = { pointerId: null, startY: 0, locked: false };
  };

  const resetSpeechPointerState = () => {
    speechPointerStateRef.current = { pointerId: null, startY: 0, locked: false };
    setSpeechCaptureState("idle");
  };

  const clearSpeechRecognitionRestartTimer = () => {
    if (!speechRestartTimeoutRef.current || typeof window === "undefined") {
      speechRestartTimeoutRef.current = 0;
      return;
    }

    window.clearTimeout(speechRestartTimeoutRef.current);
    speechRestartTimeoutRef.current = 0;
  };

  const cleanupSpeechMeterResources = () => {
    stopSpeechLevelLoop();
    speechAnalyserRef.current = null;
    setSpeechMicLevel(0);

    if (speechAudioContextRef.current) {
      speechAudioContextRef.current.close().catch((error) => {
        console.warn("Speech meter audio context close error:", error);
      });
      speechAudioContextRef.current = null;
    }

    if (speechMeterStreamRef.current) {
      speechMeterStreamRef.current.getTracks().forEach((track) => track.stop());
      speechMeterStreamRef.current = null;
    }

    resetSpeechPointerState();
  };

  const formatSpeechTranscriptDraft = (transcriptText, finalize = false) =>
    restoreRussianSpeechPunctuation(transcriptText, { finalize });

  const composeSpeechDraftMessage = (baseText, transcriptText) => {
    const normalizedBase = String(baseText || "").trim();
    const normalizedTranscript = String(transcriptText || "").trim();
    return [normalizedBase, normalizedTranscript].filter(Boolean).join(normalizedBase ? " " : "");
  };

  const punctuateSpeechTranscriptOnServer = async (rawTranscript) => {
    const normalizedTranscript = String(rawTranscript || "").trim();
    if (!normalizedTranscript) {
      return "";
    }

    const punctuatedTranscript = await punctuateTextOnServer(normalizedTranscript);
    return formatSpeechTranscriptDraft(punctuatedTranscript, true);
  };

  const sampleVoiceLevel = () => {
    const analyser = voiceAnalyserRef.current;
    if (!analyser) {
      setVoiceMicLevel(0);
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const normalized = (data[index] - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / data.length);
    const normalizedLevel = Math.max(0, Math.min(1, rms * 3.6));
    setVoiceMicLevel(normalizedLevel);

    const now = performance.now();
    if (now - voiceLastSampleAtRef.current >= VOICE_LEVEL_SAMPLE_INTERVAL_MS) {
      voiceLevelSamplesRef.current.push(normalizedLevel);
      voiceLastSampleAtRef.current = now;
    }

    voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel);
  };

  const sampleSpeechLevel = () => {
    const analyser = speechAnalyserRef.current;
    if (!analyser) {
      setSpeechMicLevel(0);
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const normalized = (data[index] - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / data.length);
    const normalizedLevel = Math.max(0, Math.min(1, rms * 4.2));
    setSpeechMicLevel(normalizedLevel);
    speechLevelFrameRef.current = requestAnimationFrame(sampleSpeechLevel);
  };

  const startMicrophoneAnalysis = async (stream) => {
    if (typeof window === "undefined" || !window.AudioContext) {
      return stream;
    }

    const audioContext = new window.AudioContext({
      latencyHint: "interactive",
      sampleRate: VOICE_RECORDING_SAMPLE_RATE,
    });

    if (audioContext.state === "suspended") {
      await audioContext.resume().catch(() => {});
    }

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.84;

    const highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = "highpass";
    highPassFilter.frequency.value = VOICE_HIGH_PASS_FREQUENCY_HZ;
    highPassFilter.Q.value = 0.82;

    const presenceFilter = audioContext.createBiquadFilter();
    presenceFilter.type = "peaking";
    presenceFilter.frequency.value = VOICE_PRESENCE_FREQUENCY_HZ;
    presenceFilter.Q.value = 0.88;
    presenceFilter.gain.value = VOICE_PRESENCE_GAIN_DB;

    const highShelfFilter = audioContext.createBiquadFilter();
    highShelfFilter.type = "highshelf";
    highShelfFilter.frequency.value = VOICE_HIGH_SHELF_FREQUENCY_HZ;
    highShelfFilter.gain.value = VOICE_HIGH_SHELF_GAIN_DB;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 2.4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;

    const destination = audioContext.createMediaStreamDestination();
    source.connect(highPassFilter);
    highPassFilter.connect(presenceFilter);
    presenceFilter.connect(highShelfFilter);
    highShelfFilter.connect(compressor);
    compressor.connect(analyser);
    compressor.connect(destination);

    voiceAudioContextRef.current = audioContext;
    voiceAnalyserRef.current = analyser;
    voiceLastSampleAtRef.current = performance.now();
    stopVoiceLevelLoop();
    voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel);
    return destination.stream;
  };

  const startSpeechMicrophoneAnalysis = async () => {
    if (
      typeof navigator === "undefined"
      || !navigator.mediaDevices?.getUserMedia
      || typeof window === "undefined"
    ) {
      return;
    }

    cleanupSpeechMeterResources();

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    try {
      const inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          ...buildPreferredVoiceCaptureConstraints(),
        },
      });

      const audioContext = new AudioContextCtor({
        latencyHint: "interactive",
        sampleRate: VOICE_RECORDING_SAMPLE_RATE,
      });

      if (audioContext.state === "suspended") {
        await audioContext.resume().catch((error) => {
          console.warn("Speech meter audio context resume error:", error);
        });
      }

      const source = audioContext.createMediaStreamSource(inputStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.76;

      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = "highpass";
      highPassFilter.frequency.value = VOICE_HIGH_PASS_FREQUENCY_HZ;
      highPassFilter.Q.value = 0.82;

      const presenceFilter = audioContext.createBiquadFilter();
      presenceFilter.type = "peaking";
      presenceFilter.frequency.value = VOICE_PRESENCE_FREQUENCY_HZ;
      presenceFilter.Q.value = 0.88;
      presenceFilter.gain.value = VOICE_PRESENCE_GAIN_DB;

      const highShelfFilter = audioContext.createBiquadFilter();
      highShelfFilter.type = "highshelf";
      highShelfFilter.frequency.value = VOICE_HIGH_SHELF_FREQUENCY_HZ;
      highShelfFilter.gain.value = VOICE_HIGH_SHELF_GAIN_DB;

      source.connect(highPassFilter);
      highPassFilter.connect(presenceFilter);
      presenceFilter.connect(highShelfFilter);
      highShelfFilter.connect(analyser);

      speechAudioContextRef.current = audioContext;
      speechAnalyserRef.current = analyser;
      speechMeterStreamRef.current = inputStream;
      speechLevelFrameRef.current = requestAnimationFrame(sampleSpeechLevel);
    } catch (error) {
      cleanupSpeechMeterResources();
      console.warn("Speech microphone analysis start error:", error);
    }
  };

  const sendVoiceRecordingFile = async (voiceFile, durationMs, waveformSamples) => {
    const avatar = user?.avatarUrl || user?.avatar || "";
    const preparedAttachment = await prepareOutgoingAttachmentPayload({
      file: voiceFile,
    });
    const uploaded = await uploadAttachment({
      blob: preparedAttachment.uploadBlob,
      fileName: preparedAttachment.uploadFileName || voiceFile.name,
    });
    const voiceMessage = {
      durationMs,
      mimeType: voiceFile.type || "audio/webm",
      fileName: voiceFile.name || "voice-message.webm",
      waveform: buildVoiceWaveform(waveformSamples),
    };

    await sendMessagesCompat(scopedChannelId, avatar, [{
      message: "",
      mentions: [],
      attachments: [{
        attachmentUrl: uploaded?.fileUrl || "",
        attachmentName: uploaded?.fileName || voiceFile.name,
        attachmentSize: uploaded?.size || voiceFile.size || null,
        attachmentContentType: uploaded?.contentType || voiceFile.type || "application/octet-stream",
        attachmentEncryption: null,
        voiceMessage,
      }],
      attachmentUrl: uploaded?.fileUrl || "",
      attachmentName: uploaded?.fileName || voiceFile.name,
      attachmentSize: uploaded?.size || voiceFile.size || null,
      attachmentContentType: uploaded?.contentType || voiceFile.type || "application/octet-stream",
      attachmentEncryption: null,
      voiceMessage,
    }]);
  };

  const finalizeVoiceRecording = (shouldSend) =>
    new Promise((resolve, reject) => {
      const recorder = voiceRecorderRef.current;
      if (!recorder) {
        cleanupVoiceRecordingResources();
        setVoiceRecordingState("idle");
        setVoiceRecordingDurationMs(0);
        resolve();
        return;
      }

      const finalize = async () => {
        const mimeType = recorder.mimeType || getSupportedVoiceRecordingMimeType() || "audio/webm";
        const blob = new Blob(voiceRecordingChunksRef.current, { type: mimeType });
        const durationMs = Math.max(0, Date.now() - voiceRecordingStartAtRef.current);
        const waveformSamples = [...voiceLevelSamplesRef.current];
        cleanupVoiceRecordingResources();

        if (!shouldSend || blob.size === 0) {
          setVoiceRecordingState("idle");
          setVoiceRecordingDurationMs(0);
          resolve();
          return;
        }

        try {
          setVoiceRecordingState("sending");
          setUploadingFile(true);
          const extension = getVoiceRecordingExtension(mimeType);
          const voiceFile = new File([blob], `voice-message-${Date.now()}.${extension}`, {
            type: mimeType,
            lastModified: Date.now(),
          });

          await ensureChannelJoined();
          await sendVoiceRecordingFile(voiceFile, durationMs, waveformSamples);
          lastSendAtRef.current = Date.now();
          setIsChannelReady(true);
          if (isDirectChat) {
            playDirectMessageSound("send");
          }
          setVoiceRecordingState("idle");
          setVoiceRecordingDurationMs(0);
          resolve();
        } catch (error) {
          console.error("Voice message send error:", error);
          setVoiceRecordingState("idle");
          setVoiceRecordingDurationMs(0);
          setErrorMessage(getChatErrorMessage(error, "Не удалось отправить голосовое сообщение."));
          reject(error);
        } finally {
          setUploadingFile(false);
        }
      };

      recorder.onstop = () => {
        void finalize();
      };
      recorder.onerror = (event) => {
        cleanupVoiceRecordingResources();
        setVoiceRecordingState("idle");
        setVoiceRecordingDurationMs(0);
        reject(event?.error || new Error("Не удалось записать голосовое сообщение."));
      };

      try {
        recorder.stop();
      } catch (error) {
        cleanupVoiceRecordingResources();
        setVoiceRecordingState("idle");
        setVoiceRecordingDurationMs(0);
        reject(error);
      }
    });

  const startVoiceRecording = async (pointerEvent = null) => {
    if (voiceRecordingState === "locked") {
      await finalizeVoiceRecording(true);
      return;
    }

    if (voiceRecordingState !== "idle" || uploadingFile || !scopedChannelId) {
      return;
    }

    const mimeType = getSupportedVoiceRecordingMimeType();
    if (!mimeType) {
      setErrorMessage("На этом устройстве запись голосовых сообщений недоступна.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Доступ к микрофону недоступен в этом окружении.");
      return;
    }

    try {
      setErrorMessage("");
      const inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          ...buildPreferredVoiceCaptureConstraints(),
        },
      });

      voiceInputStreamRef.current = inputStream;
      voiceRecordingChunksRef.current = [];
      voiceLevelSamplesRef.current = [];
      voicePointerStateRef.current = {
        pointerId: pointerEvent?.pointerId ?? null,
        startY: pointerEvent?.clientY ?? 0,
        locked: false,
      };

      const processedStream = await startMicrophoneAnalysis(inputStream);
      voiceStreamRef.current = processedStream;

      const recorder = new MediaRecorder(processedStream, {
        mimeType,
        audioBitsPerSecond: VOICE_RECORDING_AUDIO_BITS_PER_SECOND,
      });
      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          voiceRecordingChunksRef.current.push(event.data);
        }
      };

      voiceRecorderRef.current = recorder;
      voiceRecordingStartAtRef.current = Date.now();
      setVoiceRecordingState("holding");
      setVoiceRecordingDurationMs(0);
      recorder.start(220);
    } catch (error) {
      cleanupVoiceRecordingResources();
      setVoiceRecordingState("idle");
      setVoiceRecordingDurationMs(0);
      reportVoiceSpeechError("Не удалось включить микрофон для записи.", error);
    }
  };

  const stopSpeechRecognition = (shouldFinalize = true) => {
    speechShouldRestartRef.current = false;
    clearSpeechRecognitionRestartTimer();
    cleanupSpeechMeterResources();
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      setSpeechRecognitionActive(false);
      return;
    }

    recognition.__shouldFinalize = shouldFinalize;
    try {
      recognition.stop();
    } catch (error) {
      console.error("Speech recognition stop error:", error);
      setSpeechRecognitionActive(false);
      speechRecognitionRef.current = null;
      cleanupSpeechMeterResources();
    }
  };

  const handleSpeechRecognitionPointerDown = (event) => {
    event.preventDefault();
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return;
    }

    if (speechRecognitionActive && speechCaptureState === "locked") {
      stopSpeechRecognition(true);
      return;
    }

    if (speechRecognitionActive) {
      return;
    }

    startSpeechRecognition();
    if (speechRecognitionRef.current) {
      speechPointerStateRef.current = {
        pointerId: event.pointerId ?? null,
        startY: event.clientY ?? 0,
        locked: false,
      };
      setSpeechCaptureState("holding");
    }
  };

  const handleSpeechRecognitionPointerMove = (event) => {
    if (speechCaptureState !== "holding") {
      return;
    }

    const pointerState = speechPointerStateRef.current;
    if (pointerState.pointerId !== event.pointerId) {
      return;
    }

    const dragDistance = pointerState.startY - event.clientY;
    if (dragDistance >= VOICE_LOCK_DRAG_THRESHOLD_PX) {
      speechPointerStateRef.current = { ...pointerState, locked: true };
      setSpeechCaptureState("locked");
    }
  };

  const handleSpeechRecognitionPointerUp = (event) => {
    const pointerState = speechPointerStateRef.current;
    if (speechCaptureState === "holding" && pointerState.pointerId === event.pointerId && !pointerState.locked) {
      stopSpeechRecognition(true);
    }
  };

  const handleSpeechRecognitionPointerCancel = (event) => {
    const pointerState = speechPointerStateRef.current;
    if (speechCaptureState === "holding" && pointerState.pointerId === event.pointerId && !pointerState.locked) {
      stopSpeechRecognition(false);
    }
  };

  const startSpeechRecognition = ({ preserveDraft = false, sessionId = null } = {}) => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setErrorMessage("Голосовой ввод текста недоступен в этом окружении.");
      return;
    }

    if (speechRecognitionRef.current) {
      return;
    }

    const nextSessionId = sessionId ?? speechSessionIdRef.current + 1;
    if (preserveDraft && speechSessionIdRef.current !== nextSessionId) {
      return;
    }

    try {
      setErrorMessage("");
      clearSpeechRecognitionRestartTimer();
      const recognition = new SpeechRecognitionCtor();
      if (!preserveDraft) {
        speechSessionIdRef.current = nextSessionId;
        speechDraftBaseRef.current = message;
        speechFinalTranscriptRef.current = "";
        speechDisplayedTranscriptRef.current = "";
        speechShouldRestartRef.current = true;
        speechTransientErrorCountRef.current = 0;
        speechLastResultAtRef.current = 0;
      }
      recognition.lang = "ru-RU";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.__shouldFinalize = true;
      recognition.__sessionId = nextSessionId;
      recognition.__restartDelayMs = SPEECH_RECOGNITION_RESTART_DELAY_MS;

      recognition.onstart = () => {
        setSpeechRecognitionActive(true);
        void startSpeechMicrophoneAnalysis().catch((error) => {
          console.warn("Speech microphone analysis bootstrap error:", error);
          setSpeechMicLevel(0);
        });
      };

      recognition.onresult = (event) => {
        let finalTranscript = speechFinalTranscriptRef.current;
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = String(event.results[index][0]?.transcript || "");
          if (event.results[index].isFinal) {
            finalTranscript = `${finalTranscript} ${transcript}`.trim();
          } else {
            interimTranscript = `${interimTranscript} ${transcript}`.trim();
          }
        }

        speechFinalTranscriptRef.current = finalTranscript;
        speechLastResultAtRef.current = Date.now();
        speechTransientErrorCountRef.current = 0;
        recognition.__restartDelayMs = SPEECH_RECOGNITION_RESTART_DELAY_MS;
        const composedTranscript = [finalTranscript, interimTranscript].filter(Boolean).join(" ").trim();
        const formattedTranscript = formatSpeechTranscriptDraft(composedTranscript, false);
        speechDisplayedTranscriptRef.current = formattedTranscript;
        setMessage(composeSpeechDraftMessage(speechDraftBaseRef.current, formattedTranscript));
      };

      recognition.onerror = (event) => {
        const errorCode = String(event?.error || "");
        if (errorCode === "no-speech" || errorCode === "aborted") {
          return;
        }

        if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
          speechShouldRestartRef.current = false;
          recognition.__shouldFinalize = false;
          setErrorMessage("Доступ к микрофону запрещен. Разрешите микрофон для сайта и попробуйте снова.");
          return;
        }

        if (errorCode === "audio-capture") {
          speechShouldRestartRef.current = false;
          recognition.__shouldFinalize = false;
          setErrorMessage("Микрофон не найден или занят другой программой.");
          return;
        }

        if (errorCode === "network") {
          speechTransientErrorCountRef.current += 1;
          recognition.__restartDelayMs = Math.min(
            SPEECH_RECOGNITION_RESTART_DELAY_MS * (2 ** Math.max(0, speechTransientErrorCountRef.current - 1)),
            SPEECH_RECOGNITION_MAX_RESTART_DELAY_MS
          );

          const hasRecentTranscript = Date.now() - (speechLastResultAtRef.current || 0) <= SPEECH_RECOGNITION_NETWORK_WARNING_DELAY_MS;
          if (!hasRecentTranscript && speechTransientErrorCountRef.current >= 3) {
            setErrorMessage("Голосовой ввод временно нестабилен. Попробую переподключить распознавание.");
          }
          return;
        }

        reportVoiceSpeechError("Не удалось распознать речь. Попробуйте еще раз.", event, { logLevel: "warn" });
      };

      recognition.onend = () => {
        const shouldFinalize = recognition.__shouldFinalize !== false;
        speechRecognitionRef.current = null;
        const shouldRestart = shouldFinalize
          && speechShouldRestartRef.current
          && speechSessionIdRef.current === recognition.__sessionId;

        if (shouldRestart) {
          setSpeechRecognitionActive(true);
          clearSpeechRecognitionRestartTimer();
          speechRestartTimeoutRef.current = window.setTimeout(() => {
            speechRestartTimeoutRef.current = 0;
            if (!speechShouldRestartRef.current || speechSessionIdRef.current !== recognition.__sessionId) {
              return;
            }

            startSpeechRecognition({ preserveDraft: true, sessionId: recognition.__sessionId });
          }, Math.max(
            SPEECH_RECOGNITION_RESTART_DELAY_MS,
            Number(recognition.__restartDelayMs) || SPEECH_RECOGNITION_RESTART_DELAY_MS
          ));
          return;
        }

        setSpeechRecognitionActive(false);
        cleanupSpeechMeterResources();

        if (!shouldFinalize) {
          speechDisplayedTranscriptRef.current = "";
          return;
        }

        const finalTranscriptRaw = String(speechFinalTranscriptRef.current || speechDisplayedTranscriptRef.current || "").trim();
        speechDisplayedTranscriptRef.current = "";
        const finalTranscript = formatSpeechTranscriptDraft(finalTranscriptRaw, true);
        const displayedTranscript = formatSpeechTranscriptDraft(finalTranscriptRaw, false);
        const draftBase = speechDraftBaseRef.current;
        const rawDraftValue = composeSpeechDraftMessage(draftBase, finalTranscript);
        const displayedDraftValue = composeSpeechDraftMessage(draftBase, displayedTranscript);
        const requestId = speechPunctuationRequestIdRef.current + 1;
        speechPunctuationRequestIdRef.current = requestId;

        if (!finalTranscriptRaw) {
          return;
        }

        const currentValue = String(textareaRef.current?.value || message || "").trim();
        if (!currentValue || currentValue === displayedDraftValue) {
          setMessage(rawDraftValue);
        }

        void punctuateSpeechTranscriptOnServer(finalTranscriptRaw)
          .then((punctuatedTranscript) => {
            if (speechPunctuationRequestIdRef.current !== requestId) {
              return;
            }

            const nextCurrentValue = String(textareaRef.current?.value || message || "").trim();
            if (nextCurrentValue && nextCurrentValue !== rawDraftValue && nextCurrentValue !== displayedDraftValue) {
              return;
            }

            const nextMessage = composeSpeechDraftMessage(draftBase, punctuatedTranscript || finalTranscript);
            if (nextMessage) {
              setMessage(nextMessage);
            }
          })
          .catch((error) => {
            console.error("Speech punctuation error:", error);
            const nextCurrentValue = String(textareaRef.current?.value || message || "").trim();
            if (!nextCurrentValue || nextCurrentValue === rawDraftValue || nextCurrentValue === displayedDraftValue) {
              setMessage(rawDraftValue);
            }
          });
      };

      speechRecognitionRef.current = recognition;
      setSpeechRecognitionActive(true);
      recognition.start();
    } catch (error) {
      const shouldRetry = preserveDraft && speechShouldRestartRef.current;
      setSpeechRecognitionActive(false);
      speechRecognitionRef.current = null;

      if (shouldRetry) {
        speechTransientErrorCountRef.current += 1;
        const retryDelayMs = Math.min(
          SPEECH_RECOGNITION_RESTART_DELAY_MS * (2 ** Math.max(0, speechTransientErrorCountRef.current - 1)),
          SPEECH_RECOGNITION_MAX_RESTART_DELAY_MS
        );
        clearSpeechRecognitionRestartTimer();
        speechRestartTimeoutRef.current = window.setTimeout(() => {
          speechRestartTimeoutRef.current = 0;
          if (!speechShouldRestartRef.current || speechSessionIdRef.current !== nextSessionId) {
            return;
          }

          startSpeechRecognition({ preserveDraft: true, sessionId: nextSessionId });
        }, retryDelayMs);
        return;
      }

      console.warn("Speech recognition start error:", error);
      reportVoiceSpeechError("Не удалось запустить голосовой ввод текста.", error);
    }
  };

  const handleVoiceRecordPointerDown = async (event) => {
    event.preventDefault();
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (speechRecognitionActive) {
      stopSpeechRecognition(true);
    }

    if (voiceRecordingState === "locked") {
      await finalizeVoiceRecording(true);
      return;
    }

    await startVoiceRecording(event);
  };

  const handleVoiceRecordPointerMove = (event) => {
    if (voiceRecordingState !== "holding") {
      return;
    }

    const pointerState = voicePointerStateRef.current;
    if (pointerState.pointerId !== event.pointerId) {
      return;
    }

    const dragDistance = pointerState.startY - event.clientY;
    if (dragDistance >= VOICE_LOCK_DRAG_THRESHOLD_PX) {
      voicePointerStateRef.current = { ...pointerState, locked: true };
      setVoiceRecordingState("locked");
    }
  };

  const handleVoiceRecordPointerUp = async (event) => {
    const pointerState = voicePointerStateRef.current;
    if (voiceRecordingState === "holding" && pointerState.pointerId === event.pointerId && !pointerState.locked) {
      await finalizeVoiceRecording(true);
    }
  };

  const handleVoiceRecordPointerCancel = async (event) => {
    const pointerState = voicePointerStateRef.current;
    if (voiceRecordingState === "holding" && pointerState.pointerId === event.pointerId && !pointerState.locked) {
      await finalizeVoiceRecording(false);
    }
  };

  const handleCancelVoiceRecording = async () => {
    if (voiceRecordingState === "holding" || voiceRecordingState === "locked") {
      await finalizeVoiceRecording(false);
    }
  };

  const handleSpeechRecognitionToggle = () => {
    if (voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return;
    }

    if (speechRecognitionActive) {
      stopSpeechRecognition(true);
      return;
    }

    startSpeechRecognition();
  };

  useEffect(() => {
    if (voiceRecordingState !== "holding" && voiceRecordingState !== "locked") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const nextDurationMs = Math.max(0, Date.now() - voiceRecordingStartAtRef.current);
      setVoiceRecordingDurationMs(nextDurationMs);

      if (nextDurationMs >= MAX_VOICE_MESSAGE_DURATION_MS) {
        void finalizeVoiceRecording(true);
      }
    }, 180);

    return () => window.clearInterval(intervalId);
  }, [voiceRecordingState]);

  useEffect(() => () => {
    cleanupVoiceRecordingResources();
    cleanupSpeechMeterResources();
    stopSpeechRecognition(false);
  }, []);

  return {
    voiceRecordingState,
    voiceRecordingDurationMs,
    speechRecognitionActive,
    speechMicLevel,
    speechCaptureState,
    stopSpeechRecognition,
    handleVoiceRecordPointerDown,
    handleVoiceRecordPointerMove,
    handleVoiceRecordPointerUp,
    handleVoiceRecordPointerCancel,
    handleSpeechRecognitionPointerDown,
    handleSpeechRecognitionPointerMove,
    handleSpeechRecognitionPointerUp,
    handleSpeechRecognitionPointerCancel,
    handleCancelVoiceRecording,
    handleSpeechRecognitionToggle,
  };
}
