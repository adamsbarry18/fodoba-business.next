import type { NextConfig } from "next"

/**
 * Next.js 16 : Turbopack est le bundler par défaut (dev + build).
 * Pas de Vite ici — Next gère déjà le HMR / bundling applicatif.
 */
const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,

  // Qualité : ne plus ignorer les erreurs TS/ESLint au build
  typescript: {
    ignoreBuildErrors: false,
  },

  // Tree-shaking accéléré pour les gros packages UI
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-popover",
    ],
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
    ]
  },
}

export default nextConfig
