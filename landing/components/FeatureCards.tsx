"use client";

import { motion } from "framer-motion";

const features = [
  {
    title: "Voice Rooms",
    body: "Создавай комнаты для друзей, команд и приватных серверов, где разговор начинается без лишних окон.",
    accent: "from-[#38BDF8] to-[#8B5CF6]",
  },
  {
    title: "Crystal Clear Audio",
    body: "Чистый голос, аккуратное шумоподавление и интерфейс, который не мешает слышать главное.",
    accent: "from-[#8B5CF6] to-[#EC4899]",
  },
  {
    title: "Private Spaces",
    body: "Закрытые пространства для своих людей: комнаты, роли и атмосфера без публичного хаоса.",
    accent: "from-[#EC4899] to-[#38BDF8]",
  },
  {
    title: "Low Latency",
    body: "Быстрое подключение и отзывчивая голосовая связь для встреч, игр и вечерних созвонов.",
    accent: "from-white to-[#38BDF8]",
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="page-section py-20 md:py-28">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="mb-10 max-w-2xl"
      >
        <p className="text-sm font-medium text-[#38BDF8]">Features</p>
        <h2 className="mt-3 text-3xl font-semibold text-white md:text-5xl">Designed for conversations that feel close.</h2>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {features.map((feature, index) => (
          <motion.article
            key={feature.title}
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.58, delay: index * 0.06, ease: "easeOut" }}
            whileHover={{ y: -10, scale: 1.018, rotateX: 1.2, rotateY: -1.2 }}
            className="premium-card ambient-sheen glow-border glass-panel group min-h-64 rounded-2xl p-6 transition duration-300"
          >
            <div className={`mb-8 h-1.5 w-16 rounded-full bg-gradient-to-r ${feature.accent} shadow-[0_0_26px_rgba(56,189,248,0.2)]`} />
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-2xl font-semibold text-white">{feature.title}</h3>
              <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs text-white/54 transition duration-300 group-hover:border-white/24 group-hover:text-white/76">
                0{index + 1}
              </span>
            </div>
            <p className="mt-5 leading-7 text-white/64">{feature.body}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
