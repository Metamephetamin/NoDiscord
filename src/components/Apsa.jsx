import React, { useState } from 'react';
import { connectToVoiceHub, callUser } from '../js/voiceService.js';

export default function Apsa() {
  const [targetId, setTargetId] = useState('');

  const handleJoin = async () => {
    await connectToVoiceHub();
    alert('Connected to voice hub! Теперь можешь ввести ID другого клиента.');
  };

  const handleCall = async () => {
    await callUser(targetId);
  };

  return (
    <div>
      <button onClick={handleJoin}>Connect to VoiceHub</button>
      <input
        type="text"
        placeholder="Enter peer ID"
        value={targetId}
        onChange={e => setTargetId(e.target.value)}
      />
      <button onClick={handleCall}>Call User</button>
    </div>
  );
}
