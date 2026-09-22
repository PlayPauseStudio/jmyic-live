import type { NextConfig } from "next";

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

export default nextConfig;
