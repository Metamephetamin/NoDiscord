export const joinVoiceChannel = async (data) => {
  await fetch("https://localhost:5001/api/voice/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });
};
