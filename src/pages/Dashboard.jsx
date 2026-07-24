import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { setCompletion } from '../lib/completion'

// ---- helpers ----------------------------------------------------------------

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 2,
})
const fmtAUD = (n) => AUD.format(Number(n) || 0)

const variantKey = (cardId, variant) => `${cardId}::${variant}`
const gradedKey = (cardId, company, grade) => `${cardId}::${company}::${grade}`

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

function StatCard({ label, value, note }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-100">{value}</div>
      {note && <div className="mt-0.5 text-xs text-gray-500">{note}</div>}
    </div>
  )
}

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
        <polyline points={area} fill="rgba(99,102,241,0.12)" stroke="none" />
        <polyline
          points={line}
          fill="none"
          stroke="rgb(129,140,248)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={xFor(n - 1)} cy={yFor(latest.total)} r="3.5" fill="rgb(129,140,248)" />
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
  return (
    <Link
      to={`/sets/${set.id}`}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-white/20"
    >
      <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-[#0b1020] p-1.5">
        {set.logo_url ? (
          <img
            src={set.logo_url}
            alt={set.name}
            loading="lazy"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xl text-gray-700">🃏</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-100" title={set.name}>
          {set.name}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${comp?.pct ?? 0}%` }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-gray-400">
        <div className="text-gray-200">
          {comp?.owned ?? 0}/{comp?.total ?? 0}
        </div>
        <div className="font-semibold text-emerald-400">{comp?.pct ?? 0}%</div>
      </div>
    </Link>
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
  const [chasedSets, setChasedSets] = useState([]) // [{ set, comp }]

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

  const total = rawValue + gradedValue

  if (!uid) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400">Sign in to see your portfolio.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Raw collection" value={fmtAUD(rawValue)} />
            <StatCard
              label="Graded value"
              value={fmtAUD(gradedValue)}
              note="asking prices"
            />
            <StatCard
              label="Total portfolio"
              value={fmtAUD(total)}
              note="graded portion is asking"
            />
            <StatCard
              label="Cards owned"
              value={collectionQty + gradedCount}
              note={`${collectionQty} raw · ${gradedCount} graded`}
            />
          </div>

          {/* Value trend */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Value trend
            </h2>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              {trend.length >= 2 ? (
                <TrendChart points={trend} />
              ) : (
                <p className="text-sm text-gray-500">
                  Not enough history yet — values are captured daily.
                </p>
              )}
            </div>
          </section>

          {/* Completion summary */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Chased sets
            </h2>
            {chasedSets.length === 0 ? (
              <p className="text-sm text-gray-500">
                Chase a set to track completion.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {chasedSets.map(({ set, comp }) => (
                  <CompletionRow key={set.id} set={set} comp={comp} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
