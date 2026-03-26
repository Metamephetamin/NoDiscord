import { API_BASE_URL } from "../config/runtime";
import { authFetch } from "../utils/auth";

export const joinVoiceChannel = async (data) => {
  const response = await authFetch(`${API_BASE_URL}/voice/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Не удалось обновить список голосового канала");
  }
};

export const leaveVoiceChannel = async (userId) => {
  const response = await authFetch(`${API_BASE_URL}/voice/leave`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    throw new Error("Не удалось удалить пользователя из голосового канала");
  }
};
