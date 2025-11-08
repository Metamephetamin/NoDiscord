import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

let connection = null;
let peers = {}; // все активные peer-подключения

export async function connectToVoiceHub() {
  if (connection && connection.state === 'Connected') return connection;

  connection = new HubConnectionBuilder()
    .withUrl('https://localhost:7031/voiceHub')
    .configureLogging(LogLevel.Information)
    .build();

  connection.on('ReceiveOffer', handleReceiveOffer);
  connection.on('ReceiveAnswer', handleReceiveAnswer);
  connection.on('ReceiveIceCandidate', handleReceiveIceCandidate);

  await connection.start();
  console.log('✅ Connected to VoiceHub');

  return connection;
}

export async function startVoiceStream() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return stream;
}

async function createPeerConnection(targetId, stream) {
  const pc = new RTCPeerConnection();

  // добавляем поток микрофона
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  // ICE кандидаты отправляем через SignalR
  pc.onicecandidate = event => {
    if (event.candidate) {
      connection.invoke('SendIceCandidate', targetId, JSON.stringify(event.candidate));
    }
  };

  // принимаем входящий звук
  pc.ontrack = event => {
    const audio = document.createElement('audio');
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  peers[targetId] = pc;
  return pc;
}

export async function callUser(targetId) {
  const stream = await startVoiceStream();
  const pc = await createPeerConnection(targetId, stream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await connection.invoke('SendOffer', targetId, JSON.stringify(offer));
}

async function handleReceiveOffer(fromId, sdp) {
  const stream = await startVoiceStream();
  const pc = await createPeerConnection(fromId, stream);

  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdp)));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await connection.invoke('SendAnswer', fromId, JSON.stringify(answer));
}

async function handleReceiveAnswer(fromId, sdp) {
  const pc = peers[fromId];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdp)));
  }
}

async function handleReceiveIceCandidate(fromId, candidate) {
  const pc = peers[fromId];
  if (pc && candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
  }
}
