import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Onboarding Accelerator',
  description: 'Guidance workspace for onboarding sessions.',
  icons: {
    icon: '/favicon.ico?v=3',
    shortcut: '/favicon.ico?v=3',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
