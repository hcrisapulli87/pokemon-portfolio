import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CardSearchOverlay from '../components/CardSearchOverlay'

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 2,
})
const fmtAUD = (n) => AUD.format(Number(n) || 0)

const FILTERS = ['All', 'EN', 'JP']

// Pick a price for a collection row: prefer the exact variant, then 'normal',
// then the highest cached price. Cards are often added as 'normal' while the
// only cached price is 'holo'/'reverse_holo', so an exact-only match would show
// nothing — this stays forgiving (matches the search overlay's behaviour).
function pickPrice(rows, variant) {
  if (!rows || rows.length === 0) return { price: null, source: null }
  const exact = rows.find((r) => r.variant_type === variant)
  if (exact && exact.market_price != null)
    return { price: exact.market_price, source: exact.source }
  const normal = rows.find((r) => r.variant_type === 'normal')
  if (normal && normal.market_price != null)
    return { price: normal.market_price, source: normal.source }
  const withPrice = rows.filter((r) => r.market_price != null)
  if (withPrice.length === 0) return { price: null, source: null }
  const best = withPrice.reduce((a, b) => (b.market_price > a.market_price ? b : a))
  return { price: best.market_price, source: best.source }
}

export default function Collection() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [items, setItems] = useState([]) // merged rows
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [lang, setLang] = useState('All') // All | EN | JP
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ done: 0, total: 0 })
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
        .select('id,set_id,name,name_en,number,rarity,image_small,image_large,language')
        .in('id', cardIds),
      supabase
        .from('price_cache')
        .select('card_id,variant_type,market_price,source')
        .in('card_id', cardIds),
    ])

    if (id !== reqId.current) return

    const cardById = {}
    for (const c of cardRows || []) cardById[c.id] = c

    const pricesByCard = {}
    for (const p of priceRows || []) {
      ;(pricesByCard[p.card_id] = pricesByCard[p.card_id] || []).push(p)
    }

    const merged = rows.map((r) => {
      const card = cardById[r.card_id] || {
        id: r.card_id,
        name: r.card_id,
        language: 'EN',
      }
      const { price: unitPrice, source } = pickPrice(
        pricesByCard[r.card_id],
        r.variant_type
      )
      const value = unitPrice != null ? unitPrice * (r.quantity || 1) : null
      // eBay = active-listing asking prices (JP raw); label as such.
      const asking = source === 'ebay'
      return { ...r, card, unitPrice, value, asking }
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

  // Refresh raw prices for every card in the collection (EN via tcgplayer; JP
  // has no free raw source yet, so those simply stay blank).
  async function refreshPrices() {
    if (refreshing || !session) return
    const cardIds = [...new Set(items.map((r) => r.card_id))]
    if (cardIds.length === 0) return

    setRefreshing(true)
    setRefreshProgress({ done: 0, total: cardIds.length })
    for (let i = 0; i < cardIds.length; i++) {
      try {
        await fetch('/api/price-refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ cardId: cardIds[i] }),
        })
      } catch {
        // best-effort; ignore individual failures
      }
      setRefreshProgress({ done: i + 1, total: cardIds.length })
    }
    setRefreshing(false)
    load()
  }

  const totalValue = items.reduce((sum, r) => sum + (r.value ?? 0), 0)

  const filtered = useMemo(() => {
    if (lang === 'All') return items
    return items.filter((r) => (r.card.language || 'EN') === lang)
  }, [items, lang])

  return (
    <div className="space-y-3.5">
      <div>
        <h1 className="text-[22px] font-extrabold text-white">Collection</h1>
        <div className="mt-0.5 text-xs text-vault-muted">
          {items.length} {items.length === 1 ? 'card' : 'cards'} ·{' '}
          <span className="font-bold text-holo-cyan">{fmtAUD(totalValue)}</span>
          {items.length > 0 && (
            <>
              {' · '}
              <button
                onClick={refreshPrices}
                disabled={refreshing}
                className="underline decoration-dotted underline-offset-2 transition hover:text-gray-200 disabled:opacity-50"
              >
                {refreshing
                  ? `Refreshing ${refreshProgress.done}/${refreshProgress.total}…`
                  : '↻ Refresh prices'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Language filter chips */}
      <div className="flex gap-2">
        {FILTERS.map((f) => {
          const active = lang === f
          return (
            <button
              key={f}
              onClick={() => setLang(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                active
                  ? 'bg-holo-cta font-bold text-vault-bg'
                  : 'bg-vault-surface text-vault-muted'
              }`}
            >
              {f}
            </button>
          )
        })}
      </div>

      {searching && (
        <CardSearchOverlay mode="raw" onClose={() => setSearching(false)} />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-gray-400">
          Your collection is empty. Tap the{' '}
          <span className="font-bold text-holo-cyan">＋</span> in the nav to search the
          catalog and add a card.
        </p>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && (
        <p className="text-gray-400">No {lang} cards in your collection.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((row) => (
            <div
              key={row.id}
              className="overflow-hidden rounded-2xl border border-white/[0.06] bg-vault-surface"
            >
              <div className="relative aspect-[3/4] bg-black">
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
                <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col gap-1">
                  {row.quantity > 1 && (
                    <span className="rounded bg-holo-indigo/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      ×{row.quantity}
                    </span>
                  )}
                  {row.variant_type !== 'normal' && (
                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                      {row.variant_type.replace(/_/g, ' ')}
                    </span>
                  )}
                  {row.asking && (
                    <span
                      className="rounded bg-holo-gold/80 px-1.5 py-0.5 text-[10px] font-semibold text-vault-bg"
                      title="eBay active-listing asking price (best-guess)"
                    >
                      asking
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2">
                <div className="truncate text-xs font-semibold text-white" title={row.card.name}>
                  {row.card.name}
                </div>
                <div className="mt-0.5 text-xs font-bold text-holo-cyan">
                  {row.value != null ? fmtAUD(row.value) : '—'}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleQuantity(row.id, row.quantity - 1)}
                      disabled={row.quantity <= 1}
                      className="flex h-6 w-6 items-center justify-center rounded bg-white/5 text-gray-300 transition hover:bg-white/10 disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-xs text-gray-200">
                      {row.quantity}
                    </span>
                    <button
                      onClick={() => handleQuantity(row.id, row.quantity + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded bg-white/5 text-gray-300 transition hover:bg-white/10"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(row.id)}
                    className="rounded px-1.5 py-1 text-[11px] text-red-400 transition hover:bg-red-500/10"
                    aria-label="Remove from collection"
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
