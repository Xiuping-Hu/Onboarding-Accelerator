import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Onboarding Accelerator',
  description: 'Guidance workspace for onboarding sessions.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
