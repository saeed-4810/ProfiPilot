import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrefPilot",
  description: "AI-powered preference management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
