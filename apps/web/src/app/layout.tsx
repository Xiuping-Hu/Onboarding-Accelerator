import type { Metadata } from 'next';
import './globals.css';
import '../components/common/common.css';
import '../components/business/auth/auth.css';
import '../components/business/admin/admin.css';
import '../components/business/workspace/workspace.css';

export const metadata: Metadata = {
  title: 'Onboarding Accelerator',
  description: 'Guidance workspace for onboarding sessions.',
  icons: {
    icon: '/favicon.ico?v=2',
    shortcut: '/favicon.ico?v=2',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
