import React, { useEffect, useState } from "react";

const PeopleList = ({ apiUrl }) => {
  const [participantsMap, setParticipantsMap] = useState({});

  // Получаем список участников с сервера
  const fetchParticipants = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/livekit/participants`);
      if (!res.ok) throw new Error("Не удалось получить участников");
      const data = await res.json();
      setParticipantsMap(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchParticipants();

    // Авто-обновление каждые 5 секунд
    const interval = setInterval(fetchParticipants, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ marginTop: "10px" }}>
      {Object.entries(participantsMap).map(([channel, users]) => (
        <div key={channel} style={{ marginBottom: "8px" }}>
          <strong>{channel}</strong>
          {users.length === 0 && <div style={{ fontSize: "12px" }}>Нет участников</div>}
          {users.map((u) => (
            <div key={u.userId} style={{ display: "flex", alignItems: "center", marginTop: "2px" }}>
              <img
                src={u.avatar || "../image/avatar.jpg"}
                alt={u.name}
                style={{ width: "20px", height: "20px", borderRadius: "50%", marginRight: "5px" }}
              />
              <span>{u.name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default PeopleList;
