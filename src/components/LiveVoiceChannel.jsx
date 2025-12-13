import { useState } from 'react';
import { Room } from 'livekit-client';

export default function Channels() {
  const [token, setToken] = useState(null);
  const [room, setRoom] = useState(null);

  const joinChannel = async (roomName) => {
    try {
      const userId = "user1";
      const userName = "Andrey";

      const response = await fetch(`https://localhost:5000/api/livekit/join?roomName=${encodeURIComponent(roomName)}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}`);
      const data = await response.json();
      setToken(data.token);

      // подключаемся к LiveKit комнате
      const livekitRoom = new Room();
      await livekitRoom.connect('ws://localhost:7880', data.token);
      setRoom(livekitRoom);

      alert(`Подключено к комнате ${roomName}`);
    } catch (err) {
      console.error("Ошибка при подключении:", err);
      alert("Не удалось подключиться к LiveKit");
    }
  };

  // return (
  //   <div className="box2">
  //     <div className="voice__channel">
  //       <h1>Channels</h1>
  //       <span>Text channel</span>
  //       <nav>
  //         <ul>
  //           <li>
  //             # General <button onClick={() => joinChannel("General")}>Join</button>
  //           </li>
  //           <li>
  //             # Чатек для псыжков <button onClick={() => joinChannel("Чатек для псыжков")}>Join</button>
  //           </li>
  //         </ul>
  //       </nav>
  //     </div>
  //     {token && (
  //       <div>
  //         <h2>LiveKit Token:</h2>
  //         <code>{token}</code>
  //       </div>
  //     )}
  //   </div>
  // );
}
