import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { WorkspaceExperience } from '@/components/business/workspace/WorkspaceExperience';
import { getCurrentUserFromCookies } from '../../server/auth';
import { getAppContainer } from '../../server/bootstrap/appContainer';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const services = getAppContainer();
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

  const error = (await searchParams).error;
  return (
    <WorkspaceExperience
      initialLoginError={
        error === 'microsoft_sign_in_failed'
          ? 'Microsoft sign-in could not be completed. Please try again.'
          : undefined
      }
    />
  );
}
