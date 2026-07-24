export default function StatTile({ label, value, note }) {
  return (
    <div className="rounded-xl border border-white/10 bg-vault-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-100">{value}</div>
      {note && <div className="mt-0.5 text-xs text-gray-500">{note}</div>}
    </div>
  )
}
