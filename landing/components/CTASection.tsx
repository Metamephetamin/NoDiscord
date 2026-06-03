"use client";

import { motion } from "framer-motion";

export function CTASection() {
  return (
    <section id="download" className="page-section pb-16 pt-20 md:pb-24 md:pt-28">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.72, ease: "easeOut" }}
        className="depth-panel ambient-sheen relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] px-6 py-14 text-center backdrop-blur-2xl md:px-14 md:py-18"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.24),transparent_24rem),radial-gradient(circle_at_80%_80%,rgba(56,189,248,0.14),transparent_18rem)]" />
        <div className="relative mx-auto max-w-3xl">
          <p className="text-sm font-medium text-[#38BDF8]">Download</p>
          <h2 className="mt-4 text-4xl font-semibold text-white md:text-6xl">Ready to enter Lanaya?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/62">
            Создай пространство для своих людей и преврати обычный созвон в тихую, красивую и живую комнату.
          </p>
          <a
            href="#hero"
            className="button-glow magnetic-action primary-action mt-9 inline-flex rounded-full bg-white px-8 py-4 text-sm font-semibold shadow-[0_0_54px_rgba(255,255,255,0.24)] transition duration-200 hover:scale-[1.02]"
          >
            <span className="relative z-10">Create your space</span>
          </a>
        </div>
      </motion.div>
    </section>
  );
}
