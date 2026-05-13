import { getSmokeBaseUrl, runSmoke, smokeLogin } from "./smoke-lib.mjs";

await runSmoke("upload smoke", async () => {
  const baseUrl = getSmokeBaseUrl();
  const session = await smokeLogin();
  const form = new FormData();
  const content = `release smoke upload ${new Date().toISOString()}\n`;
  form.append("file", new Blob([content], { type: "text/plain" }), "release-smoke.txt");

  const response = await fetch(`${baseUrl}/api/chat-files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: form,
    redirect: "follow",
  });
  const payload = await response.json().catch(() => null);

  if (response.status !== 200) {
    throw new Error(`Upload returned HTTP ${response.status}.`);
  }
  if (!String(payload?.fileUrl || "").startsWith("/chat-files/")) {
    throw new Error("Upload did not return a chat file URL.");
  }
  if (!payload?.checksumSha256) {
    throw new Error("Upload did not return checksumSha256.");
  }
});
