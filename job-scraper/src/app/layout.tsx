import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Suitcase",
  description:
    "A Chroma-backed software job scraper with ATS-first link preference, fast dedupe, and an animated GSAP suitcase interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
