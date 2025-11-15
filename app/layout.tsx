import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polyverse",
  description: "Simulate how prediction market outcomes affect connected markets using AI and historical data.",
  icons: {
    icon: '/logo.png',
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

