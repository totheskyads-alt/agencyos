import './globals.css';

export const metadata = {
  metadataBase: new URL('https://www.sky-metrics.online'),
  title: {
    default: 'Sky Metrics — Project & Time Tracking for Agencies',
    template: '%s | Sky Metrics',
  },
  description: 'Sky Metrics is the all-in-one project management and time tracking platform built for marketing agencies and freelancers. Track projects, manage clients, generate invoices — all in one place.',
  keywords: [
    'project management', 'time tracking', 'agency software', 'client management',
    'invoice generator', 'team management', 'marketing agency tools', 'freelancer tools',
    'agency project tracker', 'billing software for agencies',
  ],
  authors: [{ name: 'Sky Metrics', url: 'https://www.sky-metrics.online' }],
  creator: 'To The Sky Ads',
  publisher: 'Sky Metrics',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.sky-metrics.online',
    siteName: 'Sky Metrics',
    title: 'Sky Metrics — Project & Time Tracking for Agencies',
    description: 'The all-in-one platform for agencies. Track time, manage projects, invoice clients — beautifully.',
    images: [
      {
        url: '/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Sky Metrics Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sky Metrics — Project & Time Tracking for Agencies',
    description: 'The all-in-one platform for agencies. Track time, manage projects, invoice clients — beautifully.',
    images: ['/icon-512.png'],
  },
  alternates: {
    canonical: 'https://www.sky-metrics.online',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
    shortcut: '/icon-192.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
