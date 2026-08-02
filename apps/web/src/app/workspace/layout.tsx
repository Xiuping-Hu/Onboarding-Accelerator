import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUserFromCookies } from '../../server/auth';
import { getAppContainer } from '../../server/bootstrap/appContainer';
import { WorkspaceExperience } from './components/WorkspaceExperience';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const services = getAppContainer();

  try {
    const user = await getCurrentUserFromCookies(await cookies(), services);
    return (
      <WorkspaceExperience
        initialAccount={{
          userId: user.id,
          ...(user.email ? { email: user.email } : {}),
          ...(user.displayName ? { displayName: user.displayName } : {}),
          ...(user.role ? { role: user.role } : {}),
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        }}
      >
        {children}
      </WorkspaceExperience>
    );
  } catch {
    redirect('/login');
  }
}
