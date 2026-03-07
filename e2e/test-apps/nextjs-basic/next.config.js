/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_18WAYS_API_URL: process.env.NEXT_PUBLIC_18WAYS_API_URL || 'http://localhost:4000',
  },
  transpilePackages: ['@18ways/core', '@18ways/react', '@18ways/next'],
  // Speed optimizations for e2e tests
  productionBrowserSourceMaps: false, // Skip source maps for faster builds
  webpack: (config) => {
    const path = require('path');
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    };
    // Ensure React is resolved from this app's node_modules to prevent multiple React instances
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    };
    return config;
  },
};

module.exports = nextConfig;
