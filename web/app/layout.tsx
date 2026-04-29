import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HomeGenie',
  description: 'Generate stunning room designs and shop curated furniture.',
  icons: { icon: '/icon.png' },
  themeColor: '#0B6DC3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
