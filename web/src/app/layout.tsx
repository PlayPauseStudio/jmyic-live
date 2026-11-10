import type { Metadata, Viewport } from 'next';
import { Inter, Bebas_Neue } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
const bebasNeue = Bebas_Neue({ 
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bebas-neue'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://jmyic-live.web.app'),
  title: 'Judge Me If You Can',
  applicationName: 'Judge Me If You Can',
  appleWebApp: { title: 'Judge Me If You Can' },
  openGraph: {
    title: 'Judge Me If You Can',
    description: 'Play along with the live comedy game show.',
    siteName: 'Judge Me If You Can',
    images: ['/Logo.png'],
  },
  description: 'The ultimate comedy game show where we test how well you know our guest!',
  keywords: 'comedy, game show, entertainment, live show',
  authors: [{ name: 'JMYIC Team' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#1e1b4b" />
      </head>
      <body className={`${inter.className} ${bebasNeue.variable}`}>
        {children}
      </body>
    </html>
  );
}