// app/settings/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAccountData } from '@/lib/fetchers'
import { AccountSettings } from '@/components/AccountSettings'

export default async function AccountSettingsPage() {
  const account = await getAccountData()
  if (!account) redirect('/sign-in?redirect=/settings')
  return <AccountSettings account={account} />
}
