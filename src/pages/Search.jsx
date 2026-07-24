import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import CardTile from '../components/CardTile'
import AddToCollectionModal from '../components/AddToCollectionModal'

// Pick a representative price for a card from its price_cache rows:
// prefer the 'normal' variant, otherwise the highest market_price.
function representativePrice(rows) {
  if (!rows || rows.length === 0) return null
  const normal = rows.find((r) => r.variant_type === 'normal')
  if (normal && normal.market_price != null) return normal.market_price
  const prices = rows
    .map((r) => r.market_price)
    .filter((p) => p != null)
  if (prices.length === 0) return null
  return Math.max(...prices)
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState([])
  const [prices, setPrices] = useState({}) // card_id -> representative price
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [adding, setAdding] = useState(null) // card being added
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

    const { data: cardRows, error: cardErr } = await supabase
      .from('cards')
      .select(
        'id,set_id,name,number,rarity,image_small,image_large,language'
      )
      .ilike('name', `%${term}%`)
      .limit(60)

    if (id !== reqId.current) return // stale response

    if (cardErr) {
      setError(cardErr.message)
      setCards([])
      setPrices({})
      setLoading(false)
      return
    }

    const rows = cardRows || []
    setCards(rows)

    if (rows.length > 0) {
      const ids = rows.map((c) => c.id)
      const { data: priceRows } = await supabase
        .from('price_cache')
        .select('card_id,variant_type,market_price')
        .in('card_id', ids)

      if (id !== reqId.current) return

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

  function Section({ title, items }) {
    if (items.length === 0) return null
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          {title} <span className="text-gray-600">({items.length})</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              price={prices[card.id]}
              onAdd={setAdding}
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-4 text-2xl font-bold">Search</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runSearch(query)
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards by name…"
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-[#0b1020] px-4 py-2.5 text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </form>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Searching…</p>}

      {!loading && searched && cards.length === 0 && !error && (
        <p className="text-gray-400">
          No cards found for “{query.trim()}”.
        </p>
      )}

      {!loading && !searched && (
        <p className="text-gray-500">
          Start typing to search the card catalog.
        </p>
      )}

      {!loading && cards.length > 0 && (
        <div className="space-y-8">
          <Section title="English" items={english} />
          <Section title="Japanese" items={japanese} />
        </div>
      )}

      {adding && (
        <AddToCollectionModal
          card={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {}}
        />
      )}
    </div>
  )
}
