import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Tanques de Agua | Venta Directa de Fábrica - ZonoHome",
  description:
    "Comprá tanques de agua con el mejor precio directo de fábrica. Envíos a todo el país. BioFort y AquaFort. Asesoramiento gratuito por WhatsApp.",
  keywords: "tanques de agua, tanque 500 litros, tanque 1000 litros, venta tanques, tanques buenos aires, tanques paso del rey, biofort, aquafort",
  openGraph: {
    title: "Tanques de Agua | Precio de Fábrica - ZonoHome",
    description: "Comprá tanques de agua con el mejor precio directo de fábrica. Envíos a todo el país.",
    type: "website",
  },
};

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* Google Ads Conversion Tracking - Reemplazá AW-XXXXXXXXX con tu ID real */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXXXX"
        strategy="afterInteractive"
      />
      <Script id="google-ads-config" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-XXXXXXXXX');
        `}
      </Script>

      {/* Ocultar navbar, cart y footer del sitio principal */}
      <style>{`
        #site-navbar, #site-cart, #site-footer { display: none !important; }
        main { padding-top: 0 !important; }
      `}</style>

      {children}
    </>
  );
}
