import type { Metadata } from "next";
import "./globals.css";
import { USER_NAME, ASSISTANT_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${ASSISTANT_NAME} // Sistema Holográfico de ${USER_NAME}`,
  description: `Asistente de inteligencia artificial personal con núcleo holográfico y síntesis neural de ElevenLabs para ${USER_NAME}.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Sora:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-neutral-100 min-h-screen antialiased overflow-x-hidden selection:bg-core-amber selection:text-black font-body">
        {children}
      </body>
    </html>
  );
}
