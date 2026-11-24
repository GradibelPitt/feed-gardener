import type { Metadata, Viewport } from 'next';
import MotionRoot from '@/components/MotionRoot';
import './globals.css';
import './mobile.css';
import './theme-night.css';
import './theme-night-polish.css';

export const metadata: Metadata = {
  title: 'Feeder · Your interests, your feed',
  description: 'A user-owned discovery feed and save-for-later workspace.',
  applicationName: 'Feeder',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Feeder', statusBarStyle: 'default' },
  icons: { icon: '/icons/feeder.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b100d',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="night" suppressHydrationWarning>
      <head>
        {/* Returning visitors skip the landing page before first paint. Keep in sync with HomeGate. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var l=location,s=localStorage;if(!/[?&]landing\\b/.test(l.search)&&(s.getItem('feeder:entered:v1')==='1'||s.getItem('feed-gardener-demo-v1')!==null||/^#(discover|shorts|settings|library|saved|api|account|garden)$/.test(l.hash)))document.documentElement.dataset.feederEntered=''}catch(e){}",
          }}
        />
      </head>
      <body>
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
