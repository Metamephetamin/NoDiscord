import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lanaya | Voice Space",
  description:
    "Lanaya is a premium voice space for private rooms, low-latency audio, and close communities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
