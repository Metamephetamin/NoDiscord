import React, { useRef, useEffect } from "react";

function AudioVisualizer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let analyser, dataArray;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      source.connect(analyser);
      analyser.fftSize = 64; 
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;

      function draw() {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        const barWidth = (WIDTH / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = dataArray[i];
          ctx.fillStyle = `hsl(${i * 10}, 100%, 50%)`; // градиент цветов
          ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
          x += barWidth + 2;
        }
      }

      draw();
    });
  }, []);

  return <canvas ref={canvasRef} width={500} height={200} />;
}

export default AudioVisualizer;
