import type { Metadata } from 'next';
import { Roboto_Mono } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'Packet Post - Send files instantly',
  description: 'Send files instantly with no account needed. Share secure links or use private browser-to-browser transfers.',
  metadataBase: new URL('https://packet-post.pradum.dev'),
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/packet-post.svg', sizes: '64x64', type: 'image/svg+xml' },
      { url: '/packet-post.svg', sizes: '48x48', type: 'image/svg+xml' },
      { url: '/packet-post.svg', sizes: '32x32', type: 'image/svg+xml' },
    ],
    shortcut: '/packet-post.svg',
    apple: {
      url: '/packet-post.svg',
      sizes: '512x512',
      type: 'image/svg+xml',
    },
  },
  applicationName: 'Packet Post',
  keywords: [
    "peer to peer file transfer",
    "webrtc file sharing",
    "send files without server",
    "p2p file transfer app",
    "send files",
    "file sharing",
    "file transfer",
    "webrtc file transfer",
    "p2p file sharing",
    "file sharing app",
    "file transfer app",
    "send files instantly",
    "no account needed file sharing",
  ],
  openGraph: {
    type: 'website',
    url: '/',
    title: 'Packet Post - Send files instantly',
    siteName: 'Packet Post',
    description: 'Send files instantly with no account needed. Share secure links or use private browser-to-browser transfers.',
    images: [
      {
        url: '/packet-post.png',
        width: 1200,
        height: 630,
        alt: 'Packet Post',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Packet Post - Send files instantly',
    description: 'Send files instantly with no account needed. Share secure links or use private browser-to-browser transfers.',
    images: ['/packet-post.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={robotoMono.className}>{children}  
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Packet Post",
            "applicationCategory": "FileTransferApplication",
            "operatingSystem": "Web",
            "url": "https://packet-post.pradum.dev",
            "description":
              "Peer-to-peer file transfer application using WebRTC for direct browser-to-browser file sharing without server storage.",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            }
          }),
        }}
      />
      </body>
    </html>
  );
}
