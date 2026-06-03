"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const CosmicScene = dynamic(() => import("./CosmicScene"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-[2rem] bg-white/5" />,
});

export function Hero() {
  return (
    <section id="hero" className="page-section grid min-h-[calc(100svh-72px)] items-center gap-10 py-16 lg:grid-cols-[0.96fr_1.04fr] lg:py-14">
      <div className="relative z-10 max-w-3xl">
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          className="mb-5 inline-flex rounded-full border border-white/12 bg-white/7 px-4 py-2 text-sm text-white/72 backdrop-blur-xl"
        >
          Premium voice rooms for private circles
        </motion.p>

        <motion.h1
          aria-label="Lanaya — voice space for your people"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.78, delay: 0.08, ease: "easeOut" }}
          className="max-w-4xl break-words text-4xl font-semibold leading-[1.04] text-white sm:text-5xl md:text-7xl"
        >
          <span aria-hidden="true" className="block">
            Lanaya — voice
          </span>
          <span aria-hidden="true" className="block">
            space for
          </span>
          <span aria-hidden="true" className="block">
            your people
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.78, delay: 0.16, ease: "easeOut" }}
          className="mt-6 max-w-2xl text-lg leading-8 text-white/68 md:text-xl"
        >
          Создавай голосовые комнаты, общайся с друзьями и оставайся на связи без шума.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.78, delay: 0.24, ease: "easeOut" }}
          className="mt-9 flex flex-col gap-3 sm:flex-row"
        >
          <a
            href="#download"
            className="button-glow magnetic-action primary-action rounded-full bg-white px-7 py-4 text-center text-sm font-semibold shadow-[0_0_48px_rgba(255,255,255,0.22)] transition duration-200 hover:scale-[1.02]"
          >
            <span className="relative z-10">Начать</span>
          </a>
          <a
            href="#rooms"
            className="magnetic-action rounded-full border border-white/15 bg-white/8 px-7 py-4 text-center text-sm font-semibold text-white backdrop-blur-xl transition duration-200 hover:border-white/30 hover:bg-white/13"
          >
            Смотреть демо
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
        className="depth-panel ambient-sheen relative min-h-[420px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] shadow-[0_40px_120px_rgba(0,0,0,0.4)] backdrop-blur-xl md:min-h-[560px]"
      >
        <CosmicScene />
        <div className="premium-card pointer-events-none absolute inset-x-6 bottom-6 rounded-3xl border border-white/10 bg-[#050510]/45 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Live orbit</p>
              <p className="mt-1 text-xs text-white/54">27 friends connected</p>
            </div>
            <div className="flex items-end gap-1.5" aria-hidden="true">
              {[22, 36, 28, 46, 32, 54, 26].map((height, index) => (
                <span
                  key={`orbit-meter-${index}`}
                  className="w-1.5 rounded-full bg-gradient-to-t from-[#8B5CF6] via-[#38BDF8] to-white/90"
                  style={{ height }}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
