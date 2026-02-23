import type { Metadata } from 'next';
import { Roboto_Mono } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'Packet Post - Send files instantly',
  description: 'Send files instantly with no account needed',
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
      <body className={robotoMono.className}>{children}</body>
    </html>
  );
}
