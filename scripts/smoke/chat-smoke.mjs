import { createClientMessageId, getSmokeBaseUrl, requestJson, requireSmokeValue, runSmoke, smokeLogin } from "./smoke-lib.mjs";

await runSmoke("chat smoke", async () => {
  const baseUrl = getSmokeBaseUrl();
  const session = await smokeLogin();
  const chatId = requireSmokeValue("SMOKE_CHAT_ID", "chat smoke");
  const encodedChatId = encodeURIComponent(chatId);

  await requestJson(`/api/chats/${encodedChatId}/messages?limit=1`, {
    baseUrl,
    token: session.token,
  });

  if (process.env.SMOKE_CHAT_WRITE === "0") {
    return;
  }

  const clientMessageId = createClientMessageId("release-smoke-chat");
  const { payload } = await requestJson(`/api/chats/${encodedChatId}/messages/outbox`, {
    baseUrl,
    method: "POST",
    token: session.token,
    body: {
      message: `release smoke ${new Date().toISOString()}`,
      clientMessageId,
    },
  });

  if (!payload?.id && !payload?.clientMessageId) {
    throw new Error("Chat outbox did not return a message payload.");
  }
});
