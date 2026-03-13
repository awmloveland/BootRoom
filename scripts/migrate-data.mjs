#!/usr/bin/env node
/**
 * One-time data migration: boot_room.json → Supabase
 *
 * Prerequisites:
 * 1. Run supabase/migrations/*.sql in Supabase SQL Editor
 * 2. Set env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: node scripts/migrate-data.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const dataPath = join(__dirname, '../data/boot_room.json')
const raw = readFileSync(dataPath, 'utf-8')
const data = JSON.parse(raw)

/** Derive season string like "2025–26" from played weeks */
function deriveSeason(weeks) {
  const played = weeks.filter((w) => w.status === 'played')
  if (played.length === 0) return ''
  const sorted = [...played].sort((a, b) => a.week - b.week)
  const firstYear = sorted[0].date.split(' ')[2]
  const lastYear = sorted[sorted.length - 1].date.split(' ')[2]
  if (firstYear === lastYear) return firstYear
  return `${firstYear}–${lastYear.slice(-2)}`
}

async function migrate() {
  const season = deriveSeason(data.weeks)
  console.log('Season:', season)

  // 1. Insert config (merge league name with config)
  const configValue = { league: data.league, ...data.config }
  const { error: configErr } = await supabase.from('config').upsert(
    { key: 'config', value: configValue },
    { onConflict: 'key' }
  )
  if (configErr) {
    console.error('Config insert failed:', configErr)
    process.exit(1)
  }
  console.log('Config inserted')

  // 2. Insert weeks
  const weeksToInsert = data.weeks.map((w) => ({
    season,
    week: w.week,
    date: w.date,
    status: w.status,
    format: w.format ?? null,
    team_a: w.teamA ?? [],
    team_b: w.teamB ?? [],
    winner: w.winner ?? null,
    notes: w.notes ?? null,
  }))

  const { error: weeksErr } = await supabase.from('weeks').upsert(weeksToInsert, {
    onConflict: 'season,week',
  })
  if (weeksErr) {
    console.error('Weeks insert failed:', weeksErr)
    process.exit(1)
  }
  console.log(`Weeks inserted: ${weeksToInsert.length}`)

  console.log('\nDone. Next: add league members to profiles after they sign up.')
  console.log('Profiles are created when users sign in; ensure invite-only flow checks membership.')
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
