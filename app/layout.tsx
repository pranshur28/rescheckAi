import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RefCheck AI",
  description:
    "Rule-grounded second-review for soccer referee decisions. Upload a clip, get an IFAB-cited verdict.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
