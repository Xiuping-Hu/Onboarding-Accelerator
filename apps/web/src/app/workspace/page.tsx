import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { WorkspaceExperience } from '@/components/business/workspace/WorkspaceExperience';
import { getCurrentUserFromCookies } from '../../server/auth';
import { getAppContainer } from '../../server/bootstrap/appContainer';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
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
      />
    );
  } catch {
    redirect('/login');
  }
}
