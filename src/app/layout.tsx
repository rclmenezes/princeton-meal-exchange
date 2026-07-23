import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meal Exchange · Princeton Dining",
  description:
    "Invite a guest to a Princeton meal and keep reciprocal meals squared away.",
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
