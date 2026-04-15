#!/usr/bin/env node
/**
 * Retroactively compute and store highlights for week 29.
 *
 * Since week 29 was recorded before the highlights feature was deployed,
 * its notes field has no auto-generated highlights block. This script
 * computes the highlights using current player stats and stores them.
 *
 * NOTE: Because this runs after the fact, player.played already includes
 * week 29 — milestone detection uses player.played directly (not +1).
 *
 * Usage: node scripts/backfill-week29-highlights.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (reads .env.local)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load .env.local ────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local not found — rely on shell env
  }
}
loadEnv()

const LEGACY_GAME_ID = '9cf13e81-4382-428b-a4ec-c94cb8e2567e'
const TARGET_WEEK = 29

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

// ── Inline highlight helpers (mirrors lib/utils.ts) ────────────────────────

const MILESTONE_SET = new Set([10, 25])
function isMilestone(n) {
  if (MILESTONE_SET.has(n)) return true
  return n >= 50 && n % 50 === 0
}

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function parseWeekDate(dateStr) {
  // Format: 'DD MMM YYYY'
  const [dd, mmm, yyyy] = dateStr.split(' ')
  return new Date(Number(yyyy), MONTHS[mmm], Number(dd))
}

function playerWeeksDesc(playerName, weeks) {
  return weeks
    .filter(w => w.status === 'played' && (w.teamA.includes(playerName) || w.teamB.includes(playerName)))
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
}

function currentWinStreak(playerName, weeks) {
  const played = playerWeeksDesc(playerName, weeks)
  let count = 0
  for (const w of played) {
    const onTeamA = w.teamA.includes(playerName)
    const won = (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)
    if (won) count++
    else break
  }
  return count
}

function currentUnbeatenStreak(playerName, weeks) {
  const played = playerWeeksDesc(playerName, weeks)
  let count = 0
  for (const w of played) {
    const onTeamA = w.teamA.includes(playerName)
    const lost = (w.winner === 'teamA' && !onTeamA) || (w.winner === 'teamB' && onTeamA)
    if (!lost) count++
    else break
  }
  return count
}

function computeHighlights(week29, allWeeks, players) {
  const { teamA, teamB, winner, goal_difference, team_a_rating, team_b_rating } = week29
  const goalDifference = goal_difference ?? 0
  const teamARating = team_a_rating ?? 0
  const teamBRating = team_b_rating ?? 0

  const highlights = []

  // ── Win streaks (winning team, ≥3) ──────────────────────────────────────
  if (winner !== 'draw' && winner != null) {
    const winners = winner === 'teamA' ? teamA : teamB
    for (const name of winners) {
      const streak = currentWinStreak(name, allWeeks)
      if (streak >= 3) highlights.push(`🔥 ${name} on a ${streak}-game winning streak`)
    }
  }

  // ── Unbeaten streak broken (losing team, ≥5) ────────────────────────────
  if (winner !== 'draw' && winner != null) {
    const losers = winner === 'teamA' ? teamB : teamA
    // Exclude week 29 itself so we're looking at the prior run
    const priorWeeks = allWeeks.filter(w => w.week < TARGET_WEEK)
    for (const name of losers) {
      const streak = currentUnbeatenStreak(name, priorWeeks)
      if (streak >= 5) highlights.push(`💔 ${name}'s ${streak}-game unbeaten run is over`)
    }
  }

  // ── Upset ────────────────────────────────────────────────────────────────
  if (winner !== 'draw' && winner != null && teamARating !== teamBRating) {
    const upset =
      (winner === 'teamA' && teamBRating > teamARating) ||
      (winner === 'teamB' && teamARating > teamBRating)
    if (upset) {
      const [strongRating, weakRating] =
        winner === 'teamA'
          ? [teamBRating.toFixed(1), teamARating.toFixed(1)]
          : [teamARating.toFixed(1), teamBRating.toFixed(1)]
      const strongTeam = winner === 'teamA' ? 'Team B' : 'Team A'
      highlights.push(`😱 Upset! ${strongTeam} were stronger on paper (${strongRating} vs ${weakRating})`)
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────────
  // player.played already includes week 29 (retroactive), so check directly
  for (const name of [...teamA, ...teamB]) {
    const player = players.find(p => p.name === name)
    if (!player) continue
    if (isMilestone(player.played)) {
      highlights.push(`🎖️ ${name} played their ${ordinal(player.played)} game tonight`)
    }
  }

  // ── Quarter table top 5 ──────────────────────────────────────────────────
  const tableLines = []
  const now = parseWeekDate(week29.date)
  const q = Math.floor(now.getMonth() / 3) + 1
  const year = now.getFullYear()
  const qWeeks = allWeeks.filter(w => {
    if (w.status !== 'played') return false
    const d = parseWeekDate(w.date)
    return Math.floor(d.getMonth() / 3) + 1 === q && d.getFullYear() === year
  })
  const tableMap = new Map()
  for (const w of qWeeks) {
    for (const name of [...w.teamA, ...w.teamB]) {
      const prev = tableMap.get(name) ?? 0
      const onTeamA = w.teamA.includes(name)
      const pts = w.winner === 'draw' ? 1
        : (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA) ? 3 : 0
      tableMap.set(name, prev + pts)
    }
  }
  const tableEntries = Array.from(tableMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
  if (tableEntries.length > 0) {
    tableLines.push(`📊 Q${q} ${year} standings`)
    tableEntries.forEach(([name, pts], i) => {
      tableLines.push(`${i + 1}. ${name} — ${pts}pts`)
    })
  }

  // ── In-form (PPG from recentForm, tonight's players only, ≥1.5 PPG) ───────
  const inFormLines = []
  const tonight = new Set([...teamA, ...teamB])
  const inFormEntries = players
    .filter(p => tonight.has(p.name) && p.played >= 5)
    .map(p => {
      const chars = p.recentForm.split('').filter(c => c !== '-')
      if (chars.length === 0) return { name: p.name, ppg: 0 }
      const pts = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
      return { name: p.name, ppg: pts / chars.length }
    })
    .filter(e => e.ppg >= 1.5)
    .sort((a, b) => b.ppg - a.ppg)
  if (inFormEntries.length > 0) {
    const top = inFormEntries[0]
    inFormLines.push(`⚡ In form: ${top.name} (${top.ppg.toFixed(1)} PPG)`)
  }

  // ── Assemble highlightsText ──────────────────────────────────────────────
  const parts = []
  if (highlights.length > 0) parts.push(highlights.join('\n'))
  if (tableLines.length > 0) parts.push(tableLines.join('\n'))
  if (inFormLines.length > 0) parts.push(inFormLines.join('\n'))
  return parts.join('\n\n')
}

// ── Main ──────────────────────────────────────────────────────────────────

async function run() {
  // Fetch week 29 row (need the UUID id for update)
  const { data: week29Rows, error: weekErr } = await supabase
    .from('weeks')
    .select('id, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating')
    .eq('game_id', LEGACY_GAME_ID)
    .eq('week', TARGET_WEEK)
    .single()

  if (weekErr || !week29Rows) {
    console.error('Failed to fetch week 29:', weekErr?.message ?? 'not found')
    process.exit(1)
  }

  const week29 = {
    ...week29Rows,
    teamA: week29Rows.team_a ?? [],
    teamB: week29Rows.team_b ?? [],
  }

  console.log(`Week 29: ${week29.date} · ${week29.format ?? '?'} · winner: ${week29.winner ?? 'null'}`)
  console.log(`Team A: ${week29.teamA.join(', ')}`)
  console.log(`Team B: ${week29.teamB.join(', ')}`)

  if (week29.status !== 'played') {
    console.error(`Week 29 status is '${week29.status}', expected 'played'. Aborting.`)
    process.exit(1)
  }

  // Fetch all played weeks
  const { data: allWeekRows, error: allWeekErr } = await supabase
    .from('weeks')
    .select('week, date, status, team_a, team_b, winner, goal_difference, team_a_rating, team_b_rating')
    .eq('game_id', LEGACY_GAME_ID)
    .eq('status', 'played')
    .order('week', { ascending: false })

  if (allWeekErr) {
    console.error('Failed to fetch all weeks:', allWeekErr.message)
    process.exit(1)
  }

  const allWeeks = (allWeekRows ?? []).map(r => ({
    week: r.week,
    date: r.date,
    status: r.status,
    teamA: r.team_a ?? [],
    teamB: r.team_b ?? [],
    winner: r.winner ?? null,
    goal_difference: r.goal_difference ?? null,
    team_a_rating: r.team_a_rating ?? null,
    team_b_rating: r.team_b_rating ?? null,
  }))

  console.log(`\nLoaded ${allWeeks.length} played weeks.`)

  // Fetch players via RPC
  const { data: playerRows, error: playerErr } = await supabase.rpc('get_player_stats_public', { p_game_id: LEGACY_GAME_ID })

  if (playerErr) {
    console.error('Failed to fetch players:', playerErr.message)
    process.exit(1)
  }

  const players = (playerRows ?? []).map(r => ({
    name: String(r.name),
    played: Number(r.played),
    recentForm: String(r.recentForm ?? r.recent_form ?? ''),
  }))

  console.log(`Loaded ${players.length} players.`)

  // Compute highlights
  const highlightsText = computeHighlights(week29, allWeeks, players)

  if (!highlightsText) {
    console.log('\nNo highlights generated for week 29 (no streaks, upsets, or milestones fired).')
  } else {
    console.log('\n── Computed highlights ───────────────────────────────')
    console.log(highlightsText)
    console.log('─────────────────────────────────────────────────────')
  }

  // Combine with existing user notes (if any)
  const existingNotes = week29.notes ?? ''
  // Strip any existing auto-highlights block (in case this is re-run)
  const separator = '\n\n'
  const existingIdx = existingNotes.indexOf(separator)
  const userNotes = existingIdx > -1 ? existingNotes.slice(0, existingIdx).trim() : existingNotes.trim()

  const combinedNotes = userNotes
    ? highlightsText ? `${userNotes}${separator}${highlightsText}` : userNotes
    : highlightsText || null

  // Update the notes field
  const { error: updateErr } = await supabase
    .from('weeks')
    .update({ notes: combinedNotes })
    .eq('id', week29.id)
    .eq('game_id', LEGACY_GAME_ID)

  if (updateErr) {
    console.error('\nFailed to update notes:', updateErr.message)
    process.exit(1)
  }

  console.log('\n✓ Week 29 notes updated.')
  if (userNotes) console.log(`  (Preserved existing user notes: "${userNotes.slice(0, 60)}${userNotes.length > 60 ? '…' : ''}")`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
