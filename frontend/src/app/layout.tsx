import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mutual NDA creator | Prelegal",
  description: "Create, preview, and download a mutual non-disclosure agreement. Your details stay in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
