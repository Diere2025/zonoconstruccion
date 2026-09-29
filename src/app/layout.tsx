import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LayoutWrapper } from "@/components/ui/LayoutWrapper";
import { cn } from "@/lib/utils";
import { SupportAwarePixel } from "@/components/support/SupportAwarePixel";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ZONO ERP | Sistema Integral de Gestión",
  description: "Plataforma Integral de Gestión y Administración Zono.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className={cn(inter.className, "min-h-screen flex flex-col")}>
        <SupportAwarePixel />
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}
