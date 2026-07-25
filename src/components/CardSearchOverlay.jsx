import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import AddToCollectionModal from './AddToCollectionModal'
import AddGradedModal from './AddGradedModal'

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 2,
})
const fmtAUD = (n) => (n == null ? '—' : AUD.format(Number(n) || 0))

// Pick a representative price for a card from its price_cache rows:
// prefer the 'normal' variant, otherwise the highest market_price.
function representativePrice(rows) {
  if (!rows || rows.length === 0) return null
  const normal = rows.find((r) => r.variant_type === 'normal')
  if (normal && normal.market_price != null) return normal.market_price
  const prices = rows.map((r) => r.market_price).filter((p) => p != null)
  if (prices.length === 0) return null
  return Math.max(...prices)
}

// Full-screen card-search sheet.
//   mode: 'raw'   -> tap a card to add it to the collection
//   mode: 'graded'-> tap a card to add it as a graded card
export default function CardSearchOverlay({ mode = 'raw', onClose }) {
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState([])
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [picked, setPicked] = useState(null) // card being added
  const reqId = useRef(0)

  async function runSearch(q) {
    const term = q.trim()
    if (!term) {
      setCards([])
      setPrices({})
      setSearched(false)
      return
    }

    const id = ++reqId.current
    setLoading(true)
    setError('')
    setSearched(true)

    const like = `%${term}%`
    const { data: cardRows, error: cardErr } = await supabase
      .from('cards')
      .select(
        'id,set_id,name,name_en,number,rarity,image_small,image_large,language,sets(release_date)'
      )
      // English name lets JP cards be found by their English species name.
      .or(`name.ilike.${like},name_en.ilike.${like},number.ilike.${like}`)
      .limit(60)

    if (id !== reqId.current) return

    if (cardErr) {
      setError(cardErr.message)
      setCards([])
      setPrices({})
      setLoading(false)
      return
    }

    // Newest sets first (by release date); undated fall to the end.
    const rows = (cardRows || []).slice().sort((a, b) => {
      const da = a.sets?.release_date || ''
      const db = b.sets?.release_date || ''
      if (da === db) return 0
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    })
    setCards(rows)

    if (rows.length > 0) {
      const ids = rows.map((c) => c.id)
      const { data: priceRows, error: priceErr } = await supabase
        .from('price_cache')
        .select('card_id,variant_type,market_price')
        .in('card_id', ids)

      if (id !== reqId.current) return
      if (priceErr) console.warn('price_cache fetch failed:', priceErr.message)

      const byCard = {}
      for (const p of priceRows || []) {
        ;(byCard[p.card_id] = byCard[p.card_id] || []).push(p)
      }
      const repr = {}
      for (const cid of ids) repr[cid] = representativePrice(byCard[cid])
      setPrices(repr)
    } else {
      setPrices({})
    }

    setLoading(false)
  }

  // Debounced search on query change
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const english = cards.filter((c) => c.language !== 'JP')
  const japanese = cards.filter((c) => c.language === 'JP')

  const heading = mode === 'graded' ? 'Add graded card' : 'Add card'

  function Section({ title, items }) {
    if (items.length === 0) return null
    return (
      <section className="space-y-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[1px] text-vault-muted">
          {title} ({items.length})
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {items.map((card) => (
            <div
              key={card.id}
              className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-vault-surface"
            >
              <div className="aspect-[3/4] bg-black">
                {card.image_small ? (
                  <img
                    src={card.image_small}
                    alt={card.name}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-gray-700">
                    🃏
                  </div>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-xs font-semibold text-white" title={card.name}>
                  {card.name}
                </div>
                <div className="mt-0.5 text-xs font-bold text-holo-cyan">
                  {fmtAUD(prices[card.id])}
                </div>
              </div>
              <button
                onClick={() => setPicked(card)}
                aria-label={`Add ${card.name}`}
                className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-lg bg-holo-cta text-sm font-extrabold leading-none text-vault-bg"
              >
                +
              </button>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[460px] flex-col bg-vault-bg">
      {/* Header + search box */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-vault-bg/95 px-[18px] pb-3 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h1 className="text-[17px] font-extrabold text-white">{heading}</h1>
          <button
            onClick={onClose}
            className="text-xs text-vault-muted transition hover:text-gray-200"
            aria-label="Close search"
          >
            ✕ Close
          </button>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards by name or number…"
          autoFocus
          className="w-full rounded-xl border border-white/[0.08] bg-vault-surface px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-holo-cyan focus:ring-1 focus:ring-holo-cyan"
        />
      </div>

      {/* Results */}
      <div className="flex-1 space-y-6 overflow-y-auto px-[18px] py-3.5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && <p className="text-gray-400">Searching…</p>}

        {!loading && searched && cards.length === 0 && !error && (
          <p className="text-gray-400">No cards found for “{query.trim()}”.</p>
        )}

        {!loading && !searched && (
          <p className="text-gray-500">Start typing to search the card catalog.</p>
        )}

        {!loading && cards.length > 0 && (
          <div className="space-y-6">
            <Section title="English" items={english} />
            <Section title="Japanese" items={japanese} />
          </div>
        )}
      </div>

      {/* Add form — stays open so several cards can be added in a row */}
      {picked && mode === 'raw' && (
        <AddToCollectionModal card={picked} onClose={() => setPicked(null)} onSaved={() => {}} />
      )}
      {picked && mode === 'graded' && (
        <AddGradedModal card={picked} onClose={() => setPicked(null)} onSaved={() => {}} />
      )}
    </div>
  )
}
