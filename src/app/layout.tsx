import type { Metadata } from "next";
import { Geist, Dancing_Script } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Caligráfica: solo para el nombre del local y títulos decorativos.
const script = Dancing_Script({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Serena Mia · Estética & Insumos",
  description:
    "Productos de estética e insumos en San Miguel de Tucumán. Mirá el catálogo, hacé tu pedido y seguilo online.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${geistSans.variable} ${script.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
