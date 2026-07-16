import type { NextConfig } from 'next';

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'http://localhost:3001').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
