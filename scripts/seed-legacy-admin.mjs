#!/usr/bin/env node
/**
 * Add yourself as admin of the legacy Boot Room game.
 * Run after you've signed up (so your profile exists).
 *
 * Usage: CREATOR_EMAIL=you@example.com node scripts/seed-legacy-admin.mjs
 */

import { createClient } from '@supabase/supabase-js'

const LEGACY_GAME_ID = '00000000-0000-0000-0000-000000000001'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const creatorEmail = process.env.CREATOR_EMAIL

if (!supabaseUrl || !serviceRoleKey || !creatorEmail) {
  console.error('Set env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CREATOR_EMAIL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function seed() {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', creatorEmail)
    .single()

  if (!profile) {
    console.error(`No profile found for ${creatorEmail}. Sign up first at craft-football.com/sign-in`)
    process.exit(1)
  }

  const { error: memberErr } = await supabase.from('game_members').upsert(
    { game_id: LEGACY_GAME_ID, user_id: profile.id, role: 'creator' },
    { onConflict: 'game_id,user_id' }
  )
  if (memberErr) {
    console.error('Failed to add game member:', memberErr)
    process.exit(1)
  }

  const { error: gameErr } = await supabase
    .from('games')
    .update({ created_by: profile.id })
    .eq('id', LEGACY_GAME_ID)
  if (gameErr) {
    console.error('Failed to set game creator:', gameErr)
    process.exit(1)
  }

  console.log(`Added ${creatorEmail} as creator of The Boot Room`)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
