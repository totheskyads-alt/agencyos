/** @type {import('next').NextConfig} */
const nextConfig = {
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
