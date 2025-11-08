navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    
    analyser.fftSize = 256; // количество полос эквалайзера
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    requestAnimationFrame(function update() {
      analyser.getByteFrequencyData(dataArray);
      // здесь мы будем рисовать полосы эквалайзера
      requestAnimationFrame(update);
    });
  })
  .catch(err => console.error("Ошибка доступа к микрофону:", err));