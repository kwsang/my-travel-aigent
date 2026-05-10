/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        // Match any request to /api/chat
        source: '/api/chat',
        // Proxy to the FastAPI backend
        destination: 'http://localhost:8000/chat',
      },
    ];
  },
};

export default nextConfig;