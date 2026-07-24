import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PriceLabel from '../components/PriceLabel'
import CardSearchOverlay from '../components/CardSearchOverlay'
import HoloCardTile from '../components/HoloCardTile'

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Graded</h1>
        <button
          onClick={() => setSearching(true)}
          className="rounded-lg bg-holo-cta px-3 py-2 text-sm font-medium text-vault-bg transition hover:opacity-90"
        >
          ＋ Add graded
        </button>
      </div>
      {items.length > 0 && (
        <div className="text-sm text-gray-400">
          {items.length} {items.length === 1 ? 'card' : 'cards'} ·{' '}
          <span className="text-gray-200">
            Total value <PriceLabel price={totalValue} asking />
          </span>
        </div>
      )}

      {searching && (
        <CardSearchOverlay mode="graded" onClose={() => setSearching(false)} />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-gray-400">
          No graded cards yet. Tap <span className="text-gray-200">＋ Add graded</span> to
          search the catalog and add one.
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((row) => (
            <HoloCardTile
              key={row.id}
              card={row.card}
              price={row.avgPrice}
              graded={{ company: row.company, grade: row.grade, cert_number: row.cert_number }}
              onDelete={() => handleDelete(row.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
