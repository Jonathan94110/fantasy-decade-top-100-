import { AccountEntry } from '@/components/account-entry';
import { safeRelativeReturnTo } from '@/lib/account-navigation';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ return_to?: string | string[] }> }) {
  const params = await searchParams;
  return <AccountEntry returnTo={safeRelativeReturnTo(params.return_to)} />;
}
