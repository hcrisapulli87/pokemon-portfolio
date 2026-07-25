import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CardSearchOverlay from '../components/CardSearchOverlay'

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
})
const fmtAUD = (n) => AUD.format(Number(n) || 0)

function priceKey(cardId, company, grade) {
  return `${cardId}::${company}::${Number(grade)}`
}

export default function Graded() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [items, setItems] = useState([]) // merged rows
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    if (!userId) {
      setItems([])
      setLoading(false)
      return
    }
    const id = ++reqId.current
    setError('')

    // 1) graded rows for this user
    const { data: gradedRows, error: gradedErr } = await supabase
      .from('graded')
      .select('id,card_id,company,grade,cert_number,notes')
      .eq('user_id', userId)

    if (id !== reqId.current) return
    if (gradedErr) {
      setError(gradedErr.message)
      setLoading(false)
      return
    }

    const rows = gradedRows || []
    if (rows.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    const cardIds = [...new Set(rows.map((r) => r.card_id))]

    // 2) referenced cards + graded price cache
    const [{ data: cardRows }, { data: priceRows }] = await Promise.all([
      supabase
        .from('cards')
        .select('id,set_id,name,number,image_small,image_large,language')
        .in('id', cardIds),
      supabase
        .from('graded_price_cache')
        .select('card_id,company,grade,avg_price')
        .in('card_id', cardIds),
    ])

    if (id !== reqId.current) return

    const cardById = {}
    for (const c of cardRows || []) cardById[c.id] = c

    const priceByKey = {}
    for (const p of priceRows || []) {
      priceByKey[priceKey(p.card_id, p.company, p.grade)] = p.avg_price
    }

    const merged = rows.map((r) => {
      const card = cardById[r.card_id] || {
        id: r.card_id,
        name: r.card_id,
        language: 'EN',
      }
      const avgPrice = priceByKey[priceKey(r.card_id, r.company, r.grade)] ?? null
      return { ...r, card, avgPrice }
    })

    merged.sort((a, b) => (b.avgPrice ?? -1) - (a.avgPrice ?? -1))

    setItems(merged)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Realtime: reload on any change to this user's graded cards
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`graded:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'pokevault',
          table: 'graded',
          filter: `user_id=eq.${userId}`,
        },
        () => load()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, load])

  async function handleDelete(rowId) {
    if (!window.confirm('Remove this graded card?')) return
    // optimistic
    setItems((prev) => prev.filter((r) => r.id !== rowId))
    const { error: delErr } = await supabase
      .from('graded')
      .delete()
      .eq('id', rowId)
    if (delErr) {
      setError(delErr.message)
      load()
    }
  }

  const totalValue = items.reduce((sum, r) => sum + (r.avgPrice ?? 0), 0)

  return (
    <div className="space-y-3.5">
      <div>
        <h1 className="text-[22px] font-extrabold text-white">Graded</h1>
        <div className="mt-0.5 text-xs text-vault-muted">
          {items.length} {items.length === 1 ? 'slab' : 'slabs'} ·{' '}
          <span className="font-bold text-holo-gold">{fmtAUD(totalValue)} (asking)</span>
        </div>
      </div>

      {searching && (
        <CardSearchOverlay mode="graded" onClose={() => setSearching(false)} />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-gray-400">
          No graded cards yet. Tap the{' '}
          <span className="font-bold text-holo-cyan">＋</span> in the nav and add one as a
          graded card.
        </p>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {items.map((row) => (
              <div key={row.id} className="rounded-2xl bg-holo-gradient p-[2px]">
                <div className="overflow-hidden rounded-[14px] bg-vault-hero">
                  <div className="relative aspect-[3/4] bg-black p-2">
                    {row.card.image_small ? (
                      <img
                        src={row.card.image_small}
                        alt={row.card.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl text-gray-700">
                        🃏
                      </div>
                    )}
                    <button
                      onClick={() => handleDelete(row.id)}
                      aria-label="Remove graded card"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-red-300 transition hover:bg-black/80"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-2">
                    <div className="text-[10px] font-extrabold tracking-[0.5px] text-holo-gold">
                      {row.company} {row.grade}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-white" title={row.card.name}>
                      {row.card.name}
                    </div>
                    <div className="mt-0.5 text-[13px] font-bold text-holo-cyan">
                      {row.avgPrice != null ? fmtAUD(row.avgPrice) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] text-[#7a7599]">
            Graded values are eBay active-listing asking prices
          </p>
        </>
      )}
    </div>
  )
}
