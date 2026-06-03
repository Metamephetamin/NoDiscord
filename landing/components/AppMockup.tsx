"use client";

import { motion } from "framer-motion";

const servers = ["L", "N", "A", "Y"];
const rooms = [
  { name: "night lounge", live: true, users: 6 },
  { name: "design sync", live: false, users: 3 },
  { name: "after hours", live: false, users: 9 },
];
const users = [
  { name: "Mira", status: "speaking", color: "bg-[#38BDF8]" },
  { name: "Artem", status: "listening", color: "bg-[#8B5CF6]" },
  { name: "Lina", status: "muted", color: "bg-[#EC4899]" },
];

export function AppMockup() {
  return (
    <section id="rooms" className="page-section py-20 md:py-28">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.72, ease: "easeOut" }}
        className="mb-10 max-w-3xl"
      >
        <p className="text-sm font-medium text-[#38BDF8]">Rooms</p>
        <h2 className="mt-3 text-3xl font-semibold text-white md:text-5xl">A calm command center for your circle.</h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 34, scale: 0.985 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={{ duration: 0.78, ease: "easeOut" }}
        className="depth-panel ambient-sheen glass-panel overflow-hidden rounded-[2rem]"
      >
        <div className="grid min-h-[560px] grid-cols-1 md:grid-cols-[84px_290px_1fr]">
          <aside className="flex gap-3 border-b border-white/10 bg-white/[0.035] p-4 md:flex-col md:border-b-0 md:border-r">
            {servers.map((server, index) => (
              <button
                key={server}
                className={`server-orbit magnetic-action grid size-12 place-items-center rounded-2xl text-sm font-semibold text-white transition hover:scale-105 ${
                  index === 0 ? "bg-white/18" : "bg-white/7"
                }`}
              >
                {server}
              </button>
            ))}
          </aside>

          <aside className="border-b border-white/10 bg-[#080817]/70 p-5 md:border-b-0 md:border-r md:border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/48">Server</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Lanaya Space</h3>
              </div>
              <span className="size-2 rounded-full bg-[#38BDF8] shadow-[0_0_18px_rgba(56,189,248,0.85)]" />
            </div>

            <div className="mt-8 space-y-3">
              {rooms.map((room) => (
                <div key={room.name} className={`voice-room rounded-2xl p-4 ${room.live ? "is-live" : ""}`}>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-white">{room.name}</p>
                    <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/55">{room.users}</span>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#38BDF8] via-[#8B5CF6] to-[#EC4899]"
                      style={{ width: room.live ? "74%" : "38%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="relative overflow-hidden bg-[#060611]/78 p-5 md:p-7">
            <div className="absolute right-10 top-8 h-44 w-44 rounded-full bg-[#38BDF8]/10 blur-3xl" />
            <div className="absolute bottom-10 left-20 h-52 w-52 rounded-full bg-[#EC4899]/10 blur-3xl" />

            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/48">Voice channel</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">night lounge</h3>
              </div>
              <div className="rounded-full border border-[#38BDF8]/24 bg-[#38BDF8]/10 px-4 py-2 text-sm text-[#BFEFFF]">
                Live now
              </div>
            </div>

            <div className="relative mt-8 grid gap-4 lg:grid-cols-3">
              {users.map((user) => (
                <article key={user.name} className="premium-card rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.075]">
                  <div className={`grid size-14 place-items-center rounded-2xl ${user.color} text-lg font-semibold text-white shadow-glow`}>
                    {user.name[0]}
                  </div>
                  <h4 className="mt-5 text-lg font-semibold text-white">{user.name}</h4>
                  <p className="mt-1 text-sm text-white/52">{user.status}</p>
                </article>
              ))}
            </div>

            <div className="premium-card relative mt-8 rounded-3xl border border-white/10 bg-white/[0.045] p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-white/78">Shared signal</p>
                <p className="text-xs text-white/46">18 ms</p>
              </div>
              <div className="flex h-24 items-center gap-2">
                {[44, 62, 36, 78, 54, 90, 48, 68, 34, 76, 58, 84, 42, 64, 50, 72].map((height, index) => (
                  <span
                    key={`signal-bar-${index}`}
                    className="flex-1 rounded-full bg-gradient-to-t from-[#8B5CF6]/70 via-[#38BDF8]/80 to-white/85"
                    style={{ height }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
