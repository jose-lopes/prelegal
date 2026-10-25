import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agreement creator | Prelegal",
  description: "Chat with AI to draft a Common Paper agreement, review the live preview, and download a PDF.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
