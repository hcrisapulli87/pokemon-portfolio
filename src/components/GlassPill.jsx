// Caller must supply a position utility (fixed/absolute/sticky) in className —
// it also serves as the containing block for the inner shine layer, so this
// component intentionally does not set its own `relative` (that would tie
// with a caller's `fixed` at equal specificity and can win the cascade,
// silently downgrading the element to in-flow positioning).
export default function GlassPill({ className = '', children }) {
  return (
    <div className={`glass-pill overflow-hidden rounded-full ${className}`}>
      <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/15 to-transparent" />
      <div className="relative flex items-center gap-1 px-2 py-1.5">{children}</div>
    </div>
  )
}
