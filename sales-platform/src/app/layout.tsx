import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo' });

export const metadata: Metadata = {
  title: 'Sales Platform — CRM + Commission Forecasting',
  description: 'Insurance & finance sales pipeline, commission forecasting, reconciliation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} dark`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
