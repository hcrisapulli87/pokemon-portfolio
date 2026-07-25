import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { setCompletion } from '../lib/completion'
import ProgressRing from '../components/ProgressRing'

// ---- helpers ----------------------------------------------------------------

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 2,
})
const fmtAUD = (n) => AUD.format(Number(n) || 0)

const variantKey = (cardId, variant) => `${cardId}::${variant}`
// Normalize grade so a stored "8.50" vs 8.5 can't drop the price match
// (Graded.jsx keys the same way).
const gradedKey = (cardId, company, grade) => `${cardId}::${company}::${Number(grade)}`

// From a set of price_cache rows for one card+variant, pick a market price:
// prefer the 'tcgplayer' source, else the first row that has a price.
function pickMarket(rows) {
  if (!rows || rows.length === 0) return null
  const tcg = rows.find((r) => r.source === 'tcgplayer' && r.market_price != null)
  if (tcg) return tcg.market_price
  const any = rows.find((r) => r.market_price != null)
  return any ? any.market_price : null
}

// Completion for one chased set — 3 light queries (mirrors MasterSets).
async function completionForSet(setId, uid) {
  const { data: cards } = await supabase
    .from('cards')
    .select('id')
    .eq('set_id', setId)
  const cardIds = (cards || []).map((c) => c.id)
  if (cardIds.length === 0) return { owned: 0, total: 0, pct: 0 }

  const [{ data: variants }, { data: owned }] = await Promise.all([
    supabase
      .from('card_variants')
      .select('card_id,variant_type')
      .in('card_id', cardIds),
    supabase
      .from('collection')
      .select('card_id,variant_type')
      .eq('user_id', uid)
      .in('card_id', cardIds),
  ])
  return setCompletion(variants || [], owned || [])
}

// ---- presentational pieces --------------------------------------------------

// Inline SVG line chart — no chart library.
function TrendChart({ points }) {
  const width = 640
  const height = 180
  const padX = 10
  const padTop = 16
  const padBottom = 22

  const totals = points.map((p) => p.total)
  const min = Math.min(...totals)
  const max = Math.max(...totals)
  const range = max - min || 1
  const n = points.length

  const xFor = (i) =>
    n === 1 ? width / 2 : padX + (i / (n - 1)) * (width - 2 * padX)
  const yFor = (v) =>
    height - padBottom - ((v - min) / range) * (height - padTop - padBottom)

  const line = points.map((p, i) => `${xFor(i)},${yFor(p.total)}`).join(' ')
  const area = `${padX},${height - padBottom} ${line} ${
    xFor(n - 1)
  },${height - padBottom}`

  const latest = points[n - 1]
  const first = points[0]

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        preserveAspectRatio="none"
      >
        <polyline points={area} fill="rgba(103,232,249,0.14)" stroke="none" />
        <polyline
          points={line}
          fill="none"
          stroke="#67e8f9"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={xFor(n - 1)} cy={yFor(latest.total)} r="3.5" fill="#67e8f9" />
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-gray-400">
        <span>
          Low <span className="font-semibold text-gray-200">{fmtAUD(min)}</span>
        </span>
        <span>
          High <span className="font-semibold text-gray-200">{fmtAUD(max)}</span>
        </span>
        <span>
          Latest{' '}
          <span className="font-semibold text-emerald-400">
            {fmtAUD(latest.total)}
          </span>
        </span>
        <span className="text-gray-500">
          {first.day} → {latest.day}
        </span>
      </div>
    </div>
  )
}

function CompletionRow({ set, comp }) {
  const pct = comp?.pct ?? 0
  return (
    <Link
      to={`/sets/${set.id}`}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-vault-surface p-3 transition hover:border-white/20"
    >
      <ProgressRing pct={pct} color="#8b7cf6" size={44} thickness={4}>
        {pct}%
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-100" title={set.name}>
          {set.name}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {comp?.owned ?? 0}/{comp?.total ?? 0}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-600/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
        Chasing ✓
      </span>
    </Link>
  )
}

function StatMini({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-vault-surface p-[14px]">
      <div className="text-[10px] uppercase tracking-wide text-vault-muted">{label}</div>
      <div className="mt-1 text-lg font-bold text-white">{value}</div>
    </div>
  )
}

// ---- page -------------------------------------------------------------------

export default function Dashboard() {
  const { session } = useAuth()
  const uid = session?.user?.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [rawValue, setRawValue] = useState(0)
  const [gradedValue, setGradedValue] = useState(0)
  const [collectionQty, setCollectionQty] = useState(0)
  const [gradedCount, setGradedCount] = useState(0)

  const [trend, setTrend] = useState([]) // [{ day, total }]
  const [deltaPct, setDeltaPct] = useState(null) // % change over the trend window
  const [chasedSets, setChasedSets] = useState([]) // [{ set, comp }]
  const [freshPulls, setFreshPulls] = useState([]) // recently added cards

  const load = useCallback(async () => {
    if (!uid) {
      setLoading(false)
      return
    }
    setError('')

    // 1) user's collection + graded rows
    const [{ data: collRows, error: collErr }, { data: gradedRows, error: gradedErr }] =
      await Promise.all([
        supabase
          .from('collection')
          .select('card_id,variant_type,quantity')
          .eq('user_id', uid),
        supabase
          .from('graded')
          .select('card_id,company,grade')
          .eq('user_id', uid),
      ])

    if (collErr || gradedErr) {
      setError((collErr || gradedErr).message)
      setLoading(false)
      return
    }

    const collection = collRows || []
    const graded = gradedRows || []
    const ownedCardIds = [...new Set(collection.map((r) => r.card_id))]
    const gradedCardIds = [...new Set(graded.map((r) => r.card_id))]

    // 2) prices for those cards
    const [{ data: priceRows }, { data: gPriceRows }, { data: histRows }] =
      await Promise.all([
        ownedCardIds.length
          ? supabase
              .from('price_cache')
              .select('card_id,variant_type,source,market_price')
              .in('card_id', ownedCardIds)
          : Promise.resolve({ data: [] }),
        gradedCardIds.length
          ? supabase
              .from('graded_price_cache')
              .select('card_id,company,grade,avg_price')
              .in('card_id', gradedCardIds)
          : Promise.resolve({ data: [] }),
        ownedCardIds.length
          ? supabase
              .from('price_history')
              .select('card_id,variant_type,day,market_price')
              .in('card_id', ownedCardIds)
          : Promise.resolve({ data: [] }),
      ])

    // group price_cache rows by card_id|variant_type
    const priceGroups = {}
    for (const p of priceRows || []) {
      const k = variantKey(p.card_id, p.variant_type)
      ;(priceGroups[k] = priceGroups[k] || []).push(p)
    }
    const marketByVariant = {}
    for (const k of Object.keys(priceGroups)) {
      marketByVariant[k] = pickMarket(priceGroups[k])
    }

    // graded prices
    const gradedPriceByKey = {}
    for (const g of gPriceRows || []) {
      gradedPriceByKey[gradedKey(g.card_id, g.company, g.grade)] = g.avg_price
    }

    // 3) stat totals
    let raw = 0
    const qtyByVariant = {}
    for (const r of collection) {
      const k = variantKey(r.card_id, r.variant_type)
      const qty = r.quantity || 0
      qtyByVariant[k] = (qtyByVariant[k] || 0) + qty
      const mkt = marketByVariant[k]
      if (mkt != null) raw += mkt * qty
    }

    let gVal = 0
    for (const g of graded) {
      const price = gradedPriceByKey[gradedKey(g.card_id, g.company, g.grade)]
      if (price != null) gVal += Number(price)
    }

    setRawValue(raw)
    setGradedValue(gVal)
    setCollectionQty(collection.reduce((s, r) => s + (r.quantity || 0), 0))
    setGradedCount(graded.length)

    // 4) value trend — aggregate history per day using current quantities
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const byDay = {}
    for (const h of histRows || []) {
      if (h.market_price == null) continue
      if (h.day && new Date(h.day) < cutoff) continue
      const k = variantKey(h.card_id, h.variant_type)
      const qty = qtyByVariant[k]
      if (!qty) continue // only value what the user currently owns
      byDay[h.day] = (byDay[h.day] || 0) + Number(h.market_price) * qty
    }
    const trendPoints = Object.entries(byDay)
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    setTrend(trendPoints)

    // delta % across the window (drives the hero "▲ +x% this month" line)
    if (trendPoints.length >= 2 && trendPoints[0].total > 0) {
      const first = trendPoints[0].total
      const last = trendPoints[trendPoints.length - 1].total
      setDeltaPct(((last - first) / first) * 100)
    } else {
      setDeltaPct(null)
    }

    // fresh pulls — most recently added cards (with art) for the home strip
    const { data: freshRows } = await supabase
      .from('collection')
      .select('card_id,added_at')
      .eq('user_id', uid)
      .order('added_at', { ascending: false })
      .limit(12)
    const freshIds = []
    for (const r of freshRows || []) {
      if (!freshIds.includes(r.card_id)) freshIds.push(r.card_id)
      if (freshIds.length >= 6) break
    }
    if (freshIds.length) {
      const { data: freshCards } = await supabase
        .from('cards')
        .select('id,name,image_small')
        .in('id', freshIds)
      const byId = {}
      for (const c of freshCards || []) byId[c.id] = c
      setFreshPulls(freshIds.map((id) => byId[id]).filter(Boolean))
    } else {
      setFreshPulls([])
    }

    // 5) completion for chased sets
    const { data: chaseRows } = await supabase
      .from('chased_sets')
      .select('set_id')
      .eq('user_id', uid)
    const setIds = (chaseRows || []).map((r) => r.set_id)

    if (setIds.length === 0) {
      setChasedSets([])
    } else {
      const { data: setRows } = await supabase
        .from('sets')
        .select('id,name,total,logo_url')
        .in('id', setIds)
      const setById = {}
      for (const s of setRows || []) setById[s.id] = s

      const comps = await Promise.all(
        setIds.map((id) => completionForSet(id, uid))
      )
      const merged = setIds
        .map((id, i) => ({ set: setById[id], comp: comps[i] }))
        .filter((row) => row.set)
        .sort((a, b) => (b.comp?.pct ?? 0) - (a.comp?.pct ?? 0))
      setChasedSets(merged)
    }

    setLoading(false)
  }, [uid])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Realtime: refresh totals/trend when the user's collection or graded changes.
  useEffect(() => {
    if (!uid) return
    const channel = supabase
      .channel(`dashboard:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'pokevault', table: 'collection', filter: `user_id=eq.${uid}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'pokevault', table: 'graded', filter: `user_id=eq.${uid}` },
        () => load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [uid, load])

  const total = rawValue + gradedValue
  const avatarInitial = (session?.user?.email || 'S').trim().charAt(0).toUpperCase()
  const [dollars, cents] = fmtAUD(total).split('.')
  const topChase = chasedSets[0]

  return (
    <div className="space-y-4">
      {/* Header — wordmark + settings avatar */}
      <div className="flex items-center justify-between">
        <div className="bg-holo-gradient bg-clip-text text-xl font-extrabold text-transparent">
          PokéVault
        </div>
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-vault-surface2 text-[13px] font-semibold text-[#c4b8ff]"
        >
          {avatarInitial}
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!uid ? (
        <p className="text-gray-400">Sign in to see your portfolio.</p>
      ) : loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          {/* Hero — portfolio value */}
          <div className="rounded-[20px] bg-holo-gradient p-[2px]">
            <div className="rounded-[18px] bg-vault-hero p-[18px]">
              <div className="text-[11px] uppercase tracking-[1px] text-vault-muted">
                Portfolio value
              </div>
              <div className="mt-1 text-[34px] font-extrabold leading-none text-white">
                {dollars}
                {cents && <span className="text-lg text-vault-muted">.{cents}</span>}
              </div>
              {deltaPct != null && (
                <div
                  className={`mt-1 text-xs font-semibold ${
                    deltaPct >= 0 ? 'text-holo-cyan' : 'text-red-400'
                  }`}
                >
                  {deltaPct >= 0 ? '▲' : '▼'} {deltaPct >= 0 ? '+' : ''}
                  {deltaPct.toFixed(1)}% this month
                </div>
              )}
            </div>
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-[10px]">
            <StatMini label="Raw" value={fmtAUD(rawValue)} />
            <StatMini label="Graded" value={fmtAUD(gradedValue)} />
            <Link
              to={topChase ? `/sets/${topChase.set.id}` : '/sets'}
              className="col-span-2 flex items-center justify-between rounded-2xl border border-white/[0.06] bg-vault-surface p-[14px]"
            >
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-vault-muted">
                  Chasing
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-white">
                  {topChase
                    ? `${topChase.set.name} · ${topChase.comp?.pct ?? 0}%`
                    : 'Chase a set to track it'}
                </div>
              </div>
              <ProgressRing
                pct={topChase?.comp?.pct ?? 0}
                color="#67e8f9"
                size={40}
                thickness={4}
              />
            </Link>
          </div>

          {/* Fresh pulls */}
          {freshPulls.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[13px] font-bold text-[#e5deff]">Fresh pulls</div>
              <div className="flex gap-[10px] overflow-x-auto pb-1">
                {freshPulls.map((c) => (
                  <div
                    key={c.id}
                    className="h-[90px] w-[66px] shrink-0 overflow-hidden rounded-[10px] bg-black"
                  >
                    {c.image_small && (
                      <img
                        src={c.image_small}
                        alt={c.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Value trend (kept from the fuller dashboard) */}
          <section className="space-y-2.5 pt-2">
            <h2 className="text-[13px] font-bold text-[#e5deff]">Value trend</h2>
            <div className="rounded-2xl border border-white/[0.06] bg-vault-surface p-4">
              {trend.length >= 2 ? (
                <TrendChart points={trend} />
              ) : (
                <p className="text-sm text-gray-500">
                  Not enough history yet — values are captured daily.
                </p>
              )}
            </div>
          </section>

          {/* Chased sets */}
          {chasedSets.length > 0 && (
            <section className="space-y-2.5 pt-2">
              <h2 className="text-[13px] font-bold text-[#e5deff]">Chased sets</h2>
              <div className="grid grid-cols-1 gap-2">
                {chasedSets.map(({ set, comp }) => (
                  <CompletionRow key={set.id} set={set} comp={comp} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
