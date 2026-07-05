import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import App from './App';
import { getCurrentUserFromCookies } from '../../server/auth';
import { getServerServices } from '../../server/services';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const services = getServerServices();

  try {
    const user = await getCurrentUserFromCookies(await cookies(), services);
    return (
      <App
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
