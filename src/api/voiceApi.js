import { API_BASE_URL } from "../config/runtime";

export const joinVoiceChannel = async (data) => {
  const response = await fetch(`${API_BASE_URL}/voice/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Не удалось обновить список голосового канала");
  }
};

export const leaveVoiceChannel = async (userId) => {
  const response = await fetch(`${API_BASE_URL}/voice/leave`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    throw new Error("Не удалось удалить пользователя из голосового канала");
  }
};
