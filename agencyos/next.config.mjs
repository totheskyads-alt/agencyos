/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  experimental: {
    useWasmBinary: true,
  },
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/lp.html',
      },
    ];
  },
};
export default nextConfig;
