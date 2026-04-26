export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/dashboard/', '/api/', '/login', '/invoice'],
      },
    ],
    sitemap: 'https://www.sky-metrics.online/sitemap.xml',
    host: 'https://www.sky-metrics.online',
  };
}
