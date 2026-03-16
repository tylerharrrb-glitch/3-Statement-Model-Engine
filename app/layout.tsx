import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '3-Statement Financial Model Engine',
  description: 'Production-ready financial modeling with fully integrated Income Statement, Balance Sheet, and Cash Flow Statement. 5-year projections across 3 scenarios with circular-reference iterative solver.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Playfair+Display:wght@700;900&family=Sora:wght@300;400;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
