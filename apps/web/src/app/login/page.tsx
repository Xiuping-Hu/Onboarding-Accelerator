import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import App from '../workspace/App';
import { getCurrentUserFromCookies } from '../../server/auth';
import { getServerServices } from '../../server/services';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const services = getServerServices();
  let hasCurrentUser = false;

  try {
    await getCurrentUserFromCookies(await cookies(), services);
    hasCurrentUser = true;
  } catch {
    hasCurrentUser = false;
  }

  if (hasCurrentUser) {
    redirect('/workspace');
  }

  return <App />;
}
