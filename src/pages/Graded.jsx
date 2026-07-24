import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PriceLabel from '../components/PriceLabel'

function priceKey(cardId, company, grade) {
  return `${cardId}::${company}::${Number(grade)}`
}

function GradeBadge({ company, grade }) {
  return (
    <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
      {company} {grade}
    </span>
  )
}

export default function Graded() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [items, setItems] = useState([]) // merged rows
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
          schema: 'public',
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">Graded</h1>
        {items.length > 0 && (
          <div className="text-sm text-gray-400">
            {items.length} {items.length === 1 ? 'card' : 'cards'} ·{' '}
            <span className="text-gray-200">
              Total value <PriceLabel price={totalValue} asking />
            </span>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-gray-400">
          No graded cards yet. Add one from Search or your Collection.
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((row) => (
            <div
              key={row.id}
              className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-white/20"
            >
              <div className="relative aspect-[3/4] w-full bg-[#0b1020]">
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
                <div className="absolute left-1.5 top-1.5">
                  <GradeBadge company={row.company} grade={row.grade} />
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <div
                  className="truncate text-sm font-medium text-gray-100"
                  title={row.card.name}
                >
                  {row.card.name}
                </div>
                {row.card.number && (
                  <div className="text-xs text-gray-400">#{row.card.number}</div>
                )}
                {row.cert_number && (
                  <div className="truncate text-[11px] text-gray-500" title={row.cert_number}>
                    Cert {row.cert_number}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <PriceLabel price={row.avgPrice} asking />
                  <button
                    onClick={() => handleDelete(row.id)}
                    className="shrink-0 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                    aria-label="Remove graded card"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
