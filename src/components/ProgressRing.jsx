export default function ProgressRing({ pct = 0, color = '#67e8f9', size = 44, thickness = 4, children }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const trackColor = 'rgba(255,255,255,0.12)'
  const maskCutout = `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${clamped}%, ${trackColor} ${clamped}%)`,
          WebkitMask: maskCutout,
          mask: maskCutout,
        }}
      />
      {children && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}
