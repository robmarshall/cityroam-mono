import type { Metadata } from "next";
import "./globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "City Roam — AI-Guided Treasure Hunts in Leeds",
  description:
    "Explore Leeds with an AI-powered treasure hunt. Solve clues, discover hidden gems, and have fun with friends — all guided by AI on your phone.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
