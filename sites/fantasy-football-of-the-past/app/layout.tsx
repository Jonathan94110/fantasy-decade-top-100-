import type { Metadata } from "next";
import "./globals.css";
import "./sports.css";
import "./gridiron.css";
import "./broadcast.css";
import "./broadcast-draft.css";
import "./broadcast-season.css";
import "./broadcast-replay.css";

export const metadata: Metadata = {
  title: "Fantasy Football of the Past",
  description: "Draft historical and modern NFL players together. Keep your roster and play a 17-week fantasy season using real historical performances.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
