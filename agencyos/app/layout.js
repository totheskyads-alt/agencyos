import './globals.css';
import Script from 'next/script';

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
        {/* GTM Consent Mode v2 — must run BEFORE GTM loads */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer=window.dataLayer||[];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent','default',{
            analytics_storage:'denied',
            ad_storage:'denied',
            ad_user_data:'denied',
            ad_personalization:'denied',
            wait_for_update:500
          });
          (function(){try{var c=localStorage.getItem('sm_cookie_consent');if(c==='all'){gtag('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});}}catch(e){}})();
        `}} />
        {/* Google Tag Manager */}
        <Script id="gtm-head" strategy="afterInteractive">{`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-T9XM93W3');
        `}</Script>
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-T9XM93W3"
            height="0" width="0" style={{display:'none',visibility:'hidden'}} />
        </noscript>
        {children}
      </body>
    </html>
  );
}
