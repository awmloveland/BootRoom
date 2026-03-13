'use client'

import { useState } from 'react'
import { Player, Week } from '@/lib/types'
import { deriveSeason } from '@/lib/utils'
import { Header } from '@/components/Header'
import { PlayerCard } from '@/components/PlayerCard'
import bootRoomData from '@/data/boot_room.json'

export default function PlayersPage() {
  const players = [...(bootRoomData.players as Player[])].sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  const season = deriveSeason(bootRoomData.weeks as Week[])

  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  const handleToggle = (name: string) => {
    setOpenPlayer((prev) => (prev === name ? null : name))
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      {/* Subtitle bar */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2">
          <p className="text-xs text-slate-400">
            {players.length} Players · Season {season}
          </p>
        </div>
      </div>

      {/* Player list */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3">
          {players.map((player) => (
            <PlayerCard
              key={player.name}
              player={player}
              isOpen={openPlayer === player.name}
              onToggle={() => handleToggle(player.name)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
