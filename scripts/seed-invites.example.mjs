#!/usr/bin/env node
/**
 * Seed league_invites with allowed emails.
 * Copy to seed-invites.mjs and add your emails.
 *
 * Usage: node scripts/seed-invites.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const INVITE_EMAILS = [
  // 'alice@example.com',
  // 'bob@example.com',
]

async function seed() {
  const { error } = await supabase.from('league_invites').upsert(
    INVITE_EMAILS.map((email) => ({ email: email.toLowerCase() })),
    { onConflict: 'email' }
  )
  if (error) throw error
  console.log(`Seeded ${INVITE_EMAILS.length} invites`)
}

seed().catch(console.error)
