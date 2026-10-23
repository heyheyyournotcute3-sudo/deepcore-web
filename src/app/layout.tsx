import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deepcore — co-op voxel mining from pickaxe to reactor",
  description:
    "Deepcore is a persistent online co-op voxel mining game. Dig six layers, build the machine chain, enrich uranium and bore a 3×3 tunnel into the mantle with a Nuclear Drill.",
};

export const viewport: Viewport = {
  themeColor: "#05080b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#05080b] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
