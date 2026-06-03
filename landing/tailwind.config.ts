import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lanaya: {
          background: "#050510",
          violet: "#8B5CF6",
          blue: "#38BDF8",
          pink: "#EC4899",
        },
      },
      boxShadow: {
        glow: "0 0 44px rgba(139, 92, 246, 0.28)",
        "blue-glow": "0 0 42px rgba(56, 189, 248, 0.22)",
      },
    },
  },
};

export default config;
