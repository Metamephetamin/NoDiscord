import { getSmokeBaseUrl, requestJson, runSmoke, smokeLogin } from "./smoke-lib.mjs";

await runSmoke("auth smoke", async () => {
  const baseUrl = getSmokeBaseUrl();
  const { payload } = await requestJson("/api/ping", { baseUrl });
  if (payload?.status !== "ok") {
    throw new Error("/api/ping did not return status ok.");
  }

  const session = await smokeLogin();
  const { payload: me } = await requestJson("/api/auth/me", {
    baseUrl,
    token: session.token,
  });

  if (!me?.id) {
    throw new Error("/api/auth/me did not return a user id.");
  }
});
