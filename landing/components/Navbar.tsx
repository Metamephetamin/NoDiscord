"use client";

import { motion } from "framer-motion";

const navItems = ["Features", "Voice", "Rooms", "Download"];

export function Navbar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-white/10 bg-[#050510]/64 backdrop-blur-2xl"
    >
      <div className="mx-auto flex min-h-[72px] w-[min(1180px,calc(100%_-_32px))] items-center justify-between gap-5">
        <a href="#hero" className="flex items-center gap-3" aria-label="Lanaya home">
          <span className="ambient-sheen grid size-10 place-items-center rounded-full border border-white/15 bg-white/8 shadow-glow">
            <span className="size-3 rounded-full bg-white shadow-[0_0_24px_rgba(56,189,248,0.9)]" />
          </span>
          <span className="text-base font-semibold text-white">Lanaya</span>
        </a>

        <nav className="hidden items-center gap-7 text-sm text-white/66 md:flex" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="transition-colors duration-200 hover:text-white"
            >
              {item}
            </a>
          ))}
        </nav>

        <a
          href="#download"
          className="button-glow magnetic-action rounded-full border border-white/15 bg-white/9 px-5 py-2.5 text-sm font-medium text-white shadow-blue-glow transition duration-200 hover:border-white/28 hover:bg-white/14"
        >
          Sign in
        </a>
      </div>
    </motion.header>
  );
}
