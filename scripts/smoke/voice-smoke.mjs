import { getSmokeBaseUrl, requestJson, requireSmokeValue, runSmoke, smokeLogin } from "./smoke-lib.mjs";

await runSmoke("voice smoke", async () => {
  const baseUrl = getSmokeBaseUrl();
  const session = await smokeLogin();
  const channel = requireSmokeValue("SMOKE_VOICE_CHANNEL", "voice smoke");
  const { payload } = await requestJson("/api/voice/livekit-session", {
    baseUrl,
    method: "POST",
    token: session.token,
    body: { channel },
  });

  if (!payload?.participantToken || !payload?.roomName || !payload?.serverUrl) {
    throw new Error("LiveKit session response is incomplete.");
  }
});
