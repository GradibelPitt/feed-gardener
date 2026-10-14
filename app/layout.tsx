import type { Metadata, Viewport } from 'next';
import MotionRoot from '@/components/MotionRoot';
import './globals.css';
import './mobile.css';

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
  themeColor: '#f7f8f5',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
