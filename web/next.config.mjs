/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  },
  async rewrites() {
    // Default to localhost for local dev, but allow override via ENV
    const backendUrl = process.env.BACKEND_URL || 'http://host.docker.internal:8000';
    return [
      {
        // Match any request to /api/chat
        source: '/api/chat',
        // Proxy to the FastAPI backend
        destination: `${backendUrl}/chat`,
      },
    ];
  },
};

export default nextConfig;