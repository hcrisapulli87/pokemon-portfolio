export default function HeroValueCard({ label, value, delta, note }) {
  return (
    <div className="holo-border rounded-2xl p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 bg-holo-gradient bg-clip-text text-3xl font-bold text-transparent">
        {value}
      </div>
      {delta != null && (
        <div className={`mt-1 text-xs font-medium ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta >= 0 ? '+' : ''}
          {delta}
        </div>
      )}
      {note && <div className="mt-0.5 text-xs text-gray-500">{note}</div>}
    </div>
  )
}
