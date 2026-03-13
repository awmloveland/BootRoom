import { NextResponse } from 'next/server'
import bootRoomData from '@/data/boot_room.json'

export async function GET() {
  const { league, weeks, config } = bootRoomData as {
    league: string
    weeks: unknown[]
    config?: Record<string, unknown>
  }
  return NextResponse.json({ league, weeks, config })
}
