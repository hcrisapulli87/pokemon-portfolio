import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CardTile from '../components/CardTile'
import PriceLabel from '../components/PriceLabel'

function priceKey(cardId, variant) {
  return `${cardId}::${variant}`
}

export default function Collection() {
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

    // 1) collection rows for this user
    const { data: collRows, error: collErr } = await supabase
      .from('collection')
      .select('id,card_id,variant_type,quantity,condition,notes')
      .eq('user_id', userId)

    if (id !== reqId.current) return
    if (collErr) {
      setError(collErr.message)
      setLoading(false)
      return
    }

    const rows = collRows || []
    if (rows.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    const cardIds = [...new Set(rows.map((r) => r.card_id))]

    // 2) referenced cards + their prices
    const [{ data: cardRows }, { data: priceRows }] = await Promise.all([
      supabase
        .from('cards')
        .select('id,set_id,name,number,rarity,image_small,image_large,language')
        .in('id', cardIds),
      supabase
        .from('price_cache')
        .select('card_id,variant_type,market_price')
        .in('card_id', cardIds),
    ])

    if (id !== reqId.current) return

    const cardById = {}
    for (const c of cardRows || []) cardById[c.id] = c

    const priceByVariant = {}
    for (const p of priceRows || []) {
      priceByVariant[priceKey(p.card_id, p.variant_type)] = p.market_price
    }

    const merged = rows.map((r) => {
      const card = cardById[r.card_id] || {
        id: r.card_id,
        name: r.card_id,
        language: 'EN',
      }
      const unitPrice =
        priceByVariant[priceKey(r.card_id, r.variant_type)] ?? null
      const value = unitPrice != null ? unitPrice * (r.quantity || 1) : null
      return { ...r, card, unitPrice, value }
    })

    merged.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))

    setItems(merged)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Realtime: reload on any change to this user's collection
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`collection:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'pokevault',
          table: 'collection',
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
    // optimistic
    setItems((prev) => prev.filter((r) => r.id !== rowId))
    const { error: delErr } = await supabase
      .from('collection')
      .delete()
      .eq('id', rowId)
    if (delErr) {
      setError(delErr.message)
      load()
    }
  }

  async function handleQuantity(rowId, nextQty) {
    const qty = Math.max(1, Number(nextQty) || 1)
    setItems((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              quantity: qty,
              value: r.unitPrice != null ? r.unitPrice * qty : null,
            }
          : r
      )
    )
    const { error: updErr } = await supabase
      .from('collection')
      .update({ quantity: qty })
      .eq('id', rowId)
    if (updErr) {
      setError(updErr.message)
      load()
    }
  }

  const totalValue = items.reduce((sum, r) => sum + (r.value ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">Collection</h1>
        {items.length > 0 && (
          <div className="text-sm text-gray-400">
            {items.length} {items.length === 1 ? 'entry' : 'entries'} ·{' '}
            <span className="text-gray-200">
              Total value <PriceLabel price={totalValue} />
            </span>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-gray-400">
          Your collection is empty. Head to Search to add cards.
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((row) => (
            <div key={row.id} className="flex flex-col gap-2">
              <div className="relative">
                <CardTile card={row.card} price={row.value} />
                <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col gap-1">
                  <span className="rounded bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    ×{row.quantity}
                  </span>
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-gray-200">
                    {row.condition}
                  </span>
                  {row.variant_type !== 'normal' && (
                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                      {row.variant_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-1 px-0.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleQuantity(row.id, row.quantity - 1)}
                    disabled={row.quantity <= 1}
                    className="h-6 w-6 rounded bg-white/5 text-gray-300 transition hover:bg-white/10 disabled:opacity-40"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm text-gray-200">
                    {row.quantity}
                  </span>
                  <button
                    onClick={() => handleQuantity(row.id, row.quantity + 1)}
                    className="h-6 w-6 rounded bg-white/5 text-gray-300 transition hover:bg-white/10"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => handleDelete(row.id)}
                  className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                  aria-label="Remove from collection"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
