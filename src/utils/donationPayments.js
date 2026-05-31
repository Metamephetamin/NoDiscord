import { API_BASE_URL } from "../config/runtime";

export async function createDonationPayment(amount) {
  const response = await fetch(`${API_BASE_URL}/donations/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText };
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || "Не удалось создать платеж.");
  }

  return data;
}
