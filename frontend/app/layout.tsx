import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AeroCPI — Real-time Airfare Price Index for India",
  description: "Automated high-frequency airfare price index platform for India augmenting MoSPI/NSO CPI transport sector data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg-void text-text-primary antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
