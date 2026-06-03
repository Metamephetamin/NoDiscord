"use client";

import { motion } from "framer-motion";

const bars = [34, 58, 78, 52, 96, 70, 118, 86, 132, 74, 112, 62, 88, 46, 68, 40];

export function VoiceSection() {
  return (
    <section id="voice" className="page-section grid gap-12 py-20 md:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <motion.div
        initial={{ opacity: 0, x: -28 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.72, ease: "easeOut" }}
        className="depth-panel ambient-sheen relative min-h-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#080817]/70 p-8 shadow-[0_32px_110px_rgba(0,0,0,0.38)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(56,189,248,0.2),transparent_22rem),radial-gradient(circle_at_36%_78%,rgba(236,72,153,0.16),transparent_18rem)]" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="audio-wave absolute left-1/2 top-1/2 flex h-52 w-[620px] -translate-x-1/2 -translate-y-1/2 items-end justify-center gap-3">
          {bars.map((height, index) => (
            <span
              key={`voice-wave-${index}`}
              className="wave-bar w-5 rounded-full bg-gradient-to-t from-[#8B5CF6] via-[#38BDF8] to-white shadow-[0_0_28px_rgba(56,189,248,0.32)]"
              style={{
                "--height": `${height}px`,
                "--delay": `${index * 0.09}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="absolute inset-8 rounded-full border border-white/8 shadow-[0_0_60px_rgba(56,189,248,0.08)]" />
        <div className="absolute inset-16 rounded-full border border-[#38BDF8]/12 shadow-[0_0_80px_rgba(139,92,246,0.08)]" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 28 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.72, ease: "easeOut" }}
      >
        <p className="text-sm font-medium text-[#EC4899]">Built for voice</p>
        <h2 className="mt-3 text-3xl font-semibold text-white md:text-5xl">Голосовые комнаты без шума вокруг.</h2>
        <p className="mt-6 text-lg leading-8 text-white/66">
          Lanaya собирает друзей, приватные серверы и постоянные комнаты в один спокойный голосовой слой. Заходи в канал,
          видь кто рядом, говори без лишних кликов и оставайся на связи в пространстве, которое принадлежит вашей группе.
        </p>
      </motion.div>
    </section>
  );
}
