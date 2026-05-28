import { getSmokeBaseUrl, isStrictSmokeEnabled, requestJson, runSmoke, SmokeSkip } from "./smoke-lib.mjs";

const REQUIRED_READINESS_KEYS = ["database", "redis", "storage", "configuration", "backupTimer"];

await runSmoke("readiness smoke", async () => {
  const baseUrl = getSmokeBaseUrl();
  const { response, payload } = await requestJson("/api/health/ready", {
    baseUrl,
    expectedStatuses: [200, 503],
  });

  const checks = payload?.checks && typeof payload.checks === "object" ? payload.checks : null;
  const missingKeys = REQUIRED_READINESS_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(checks || {}, key));
  if (missingKeys.length > 0) {
    const message = `/api/health/ready is missing readiness checks: ${missingKeys.join(", ")}.`;
    if (!isStrictSmokeEnabled()) {
      throw new SmokeSkip(message);
    }

    throw new Error(message);
  }

  if (!["ok", "degraded"].includes(String(payload?.status || ""))) {
    throw new Error(`/api/health/ready returned unexpected status payload with HTTP ${response.status}.`);
  }
});
