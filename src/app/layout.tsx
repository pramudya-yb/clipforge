import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClientProviders } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'ClipForge',
  description:
    'ClipForge is a free online video clipper tool. Cut, trim, and export video clips instantly in your browser. | ClipForge adalah alat pemotong video online gratis. Potong, trim, dan ekspor klip video langsung di browser Anda.',
  openGraph: {
    title: 'ClipForge',
    description:
      'Cut, trim, and export video clips instantly in your browser. Free and easy to use.',
    type: 'website',
    locale: 'id_ID',
    siteName: 'ClipForge',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClipForge',
    description:
      'Cut, trim, and export video clips instantly in your browser. Free and easy to use.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={inter.variable}>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
