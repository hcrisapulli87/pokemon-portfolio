export default function GlassPill({ className = '', children }) {
  return (
    <div className={`glass-pill relative overflow-hidden rounded-full ${className}`}>
      <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/15 to-transparent" />
      <div className="relative flex items-center gap-1 px-2 py-1.5">{children}</div>
    </div>
  )
}
