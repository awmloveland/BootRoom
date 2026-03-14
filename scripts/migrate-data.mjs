#!/usr/bin/env node
/**
 * One-time data migration: boot_room.json → Supabase
 *
 * Prerequisites:
 * 1. Run all supabase/migrations/*.sql in Supabase SQL Editor
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

const LEGACY_GAME_ID = '9cf13e81-4382-428b-a4ec-c94cb8e2567e'

const dataPath = join(__dirname, '../data/boot_room.json')
const raw = readFileSync(dataPath, 'utf-8')
const data = JSON.parse(raw)

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
  console.log('Game ID:', LEGACY_GAME_ID)

  // 1. Config
  const configValue = { league: data.league, ...data.config }
  const { error: configErr } = await supabase.from('config').upsert(
    { game_id: LEGACY_GAME_ID, key: 'config', value: configValue },
    { onConflict: 'game_id,key' }
  )
  if (configErr) {
    console.error('Config insert failed:', configErr)
    process.exit(1)
  }
  console.log('✓ Config inserted')

  // 2. Weeks
  const weeksToInsert = data.weeks.map((w) => ({
    game_id: LEGACY_GAME_ID,
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
    onConflict: 'game_id,season,week',
  })
  if (weeksErr) {
    console.error('Weeks insert failed:', weeksErr)
    process.exit(1)
  }
  console.log(`✓ Weeks inserted: ${weeksToInsert.length}`)

  // 3. Player attributes (goalkeeper, mentality, rating — manually set)
  const playerAttrsToInsert = data.players.map((p) => ({
    game_id: LEGACY_GAME_ID,
    name: p.name,
    goalkeeper: p.goalkeeper ?? false,
    mentality: p.mentality ?? 'balanced',
    rating: p.rating ?? 0,
  }))

  const { error: attrsErr } = await supabase.from('player_attributes').upsert(
    playerAttrsToInsert,
    { onConflict: 'game_id,name' }
  )
  if (attrsErr) {
    console.error('Player attributes insert failed:', attrsErr)
    process.exit(1)
  }
  console.log(`✓ Player attributes inserted: ${playerAttrsToInsert.length} players`)

  console.log('\nDone. The Boot Room data is now fully in Supabase.')
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
