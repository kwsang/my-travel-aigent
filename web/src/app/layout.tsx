import type { Metadata } from "next";
import React from "react";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "My Travel Aigent",
  description: "AI-powered travel planning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">{children}</body>
    </html>
  );
}