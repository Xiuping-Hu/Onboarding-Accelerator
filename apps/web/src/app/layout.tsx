import type { Metadata } from 'next';
import './globals.css';
import '../components/common/common.css';
import './login/auth.css';
import './admin/admin.css';
import './workspace/workspace.css';

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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
