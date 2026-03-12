interface TeamListProps {
  label: string
  players: string[]
}

export function TeamList({ label, players }: TeamListProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        {label}
      </h3>
      <ul className="space-y-1">
        {players.map((player, i) => (
          <li
            key={i}
            className="text-sm font-medium text-slate-100 pl-3 border-l-2 border-slate-700"
          >
            {player}
          </li>
        ))}
      </ul>
    </div>
  )
}
