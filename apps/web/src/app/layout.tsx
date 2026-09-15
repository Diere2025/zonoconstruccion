import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Navbar } from "@/components/ui/Navbar";
import { CartDrawer } from "@/components/ui/CartDrawer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zono Construcción y Hogar",
  description: "Soluciones para construcción y hogar, con venta directa de fábrica.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${process.env.NEXT_PUBLIC_META_PIXEL_ID || ""}');fbq('track','PageView');`}
        </Script>
        <Navbar />
        <main className="flex-grow pt-20">{children}</main>
        <CartDrawer />
        <footer className="bg-slate-950 text-white py-12 border-t border-slate-900 mt-auto">
          <div className="container mx-auto px-6 text-center text-gray-400 text-sm">
            © {new Date().getFullYear()} <strong>Zono Construcción y Hogar</strong>. Todos los derechos reservados.
          </div>
        </footer>
      </body>
    </html>
  );
}
