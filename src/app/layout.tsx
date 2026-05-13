import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Princeton Meal Exchange",
  description: "A meal exchange app for Princeton students.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
