import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// A production build without the game server's URL would ship a site that
// tries to reach a server on localhost. Fail the build instead.
function requireServerUrl(phase: string) {
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_WS_URL && !process.env.ALLOW_LOCALHOST_SERVER) {
    throw new Error(
      "NEXT_PUBLIC_WS_URL is not set. Put the Railway server URL in web/.env.production " +
        "(or set ALLOW_LOCALHOST_SERVER=1 for a local test build).",
    );
  }
}

const nextConfig: NextConfig = {
  // Enable static export for Firebase Hosting
  output: 'export',
  
  // Add trailing slash for better Firebase Hosting compatibility
  trailingSlash: true,
  
  // Disable image optimization for static export
  images: {
    unoptimized: true
  },
  
  // TypeScript configuration
  typescript: {
    // Enable strict type checking
    ignoreBuildErrors: false,
  },
  
  // ESLint configuration  
  eslint: {
    // Don't ignore linting errors during build
    ignoreDuringBuilds: false,
  },
};

export default function config(phase: string): NextConfig {
  requireServerUrl(phase);
  return nextConfig;
}
