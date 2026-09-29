import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SUPPORT_DIST_DIR || '.next',
  webpack(config) {
    // Diagnostic builds can bypass a broken filesystem snapshot cache on Windows.
    if (process.env.SUPPORT_BUILD_NO_CACHE === '1') config.cache = false;
    return config;
  },
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  } as any,
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ckvbyfgsbjbfaqotmeld.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/admin/rendiciones/:id',
        destination: '/admin/rendiciones?rendicion=:id',
        permanent: false,
      },
      {
        source: '/admin/conversaciones',
        destination: '/admin/dashboard',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
