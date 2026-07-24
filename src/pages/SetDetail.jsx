import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { setCompletion } from '../lib/completion'

function LangBadge({ language }) {
  const isJP = language === 'JP'
  const cls = isJP
    ? 'bg-red-500/20 text-red-300 border-red-500/30'
    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      {language || 'EN'}
    </span>
  )
}

// number is stored as text; sort numerically where possible, else lexically.
function compareNumber(a, b) {
  const na = parseInt(a.number, 10)
  const nb = parseInt(b.number, 10)
  const aNum = !Number.isNaN(na)
  const bNum = !Number.isNaN(nb)
  if (aNum && bNum && na !== nb) return na - nb
  if (aNum && !bNum) return -1
  if (!aNum && bNum) return 1
  return String(a.number || '').localeCompare(String(b.number || ''))
}

const ownKey = (cardId, variant) => `${cardId}|${variant}`

export default function SetDetail() {
  const { setId } = useParams()
  const { session } = useAuth()
  const uid = session?.user?.id
  const navigate = useNavigate()

  const [set, setSet] = useState(null)
  const [cards, setCards] = useState([])
  const [variantsByCard, setVariantsByCard] = useState({}) // card_id -> [variant_type]
  const [allVariants, setAllVariants] = useState([]) // [{card_id,variant_type}] for completion
  const [owned, setOwned] = useState(new Set()) // "card_id|variant_type"
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ done: 0, total: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setNotFound(false)

    const { data: setRow, error: setErr } = await supabase
      .from('sets')
      .select('id,name,series,language,total,logo_url')
      .eq('id', setId)
      .maybeSingle()

    if (setErr) {
      setError(setErr.message)
      setLoading(false)
      return
    }
    if (!setRow) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setSet(setRow)

    const { data: cardRows, error: cardErr } = await supabase
      .from('cards')
      .select('id,set_id,name,number,rarity,image_small,image_large,language')
      .eq('set_id', setId)

    if (cardErr) {
      setError(cardErr.message)
      setLoading(false)
      return
    }

    const sortedCards = [...(cardRows || [])].sort(compareNumber)
    setCards(sortedCards)

    const cardIds = sortedCards.map((c) => c.id)
    if (cardIds.length === 0) {
      setVariantsByCard({})
      setAllVariants([])
      setOwned(new Set())
      setLoading(false)
      return
    }

    const [{ data: variantRows }, { data: ownedRows }] = await Promise.all([
      supabase
        .from('card_variants')
        .select('card_id,variant_type')
        .in('card_id', cardIds),
      uid
        ? supabase
            .from('collection')
            .select('card_id,variant_type')
            .eq('user_id', uid)
            .in('card_id', cardIds)
        : Promise.resolve({ data: [] }),
    ])

    const byCard = {}
    for (const v of variantRows || []) {
      ;(byCard[v.card_id] = byCard[v.card_id] || []).push(v.variant_type)
    }
    setVariantsByCard(byCard)
    setAllVariants(variantRows || [])
    setOwned(new Set((ownedRows || []).map((r) => ownKey(r.card_id, r.variant_type))))

    setLoading(false)
  }, [setId, uid])

  useEffect(() => {
    load()
  }, [load])

  const completion = useMemo(() => {
    const ownedArr = [...owned].map((k) => {
      const [card_id, variant_type] = k.split('|')
      return { card_id, variant_type }
    })
    return setCompletion(allVariants, ownedArr)
  }, [allVariants, owned])

  const toggleVariant = useCallback(
    async (cardId, variantType) => {
      if (!uid) return
      const key = ownKey(cardId, variantType)
      const isOwned = owned.has(key)

      // Optimistic
      setOwned((prev) => {
        const next = new Set(prev)
        if (isOwned) next.delete(key)
        else next.add(key)
        return next
      })

      const { error: mutErr } = isOwned
        ? await supabase
            .from('collection')
            .delete()
            .eq('user_id', uid)
            .eq('card_id', cardId)
            .eq('variant_type', variantType)
        : await supabase.from('collection').insert({
            user_id: uid,
            card_id: cardId,
            variant_type: variantType,
            quantity: 1,
            condition: 'NM',
          })

      if (mutErr) {
        setError(mutErr.message)
        load() // reload authoritative state on error
      }
    },
    [uid, owned, load]
  )

  async function refreshPrices() {
    if (refreshing || !session) return
    const enCards = cards.filter((c) => (c.language || 'EN') !== 'JP')
    if (enCards.length === 0) return

    setRefreshing(true)
    setRefreshProgress({ done: 0, total: enCards.length })

    for (let i = 0; i < enCards.length; i++) {
      try {
        await fetch('/api/price-refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ cardId: enCards[i].id }),
        })
      } catch {
        // best-effort; ignore individual failures
      }
      setRefreshProgress({ done: i + 1, total: enCards.length })
    }

    setRefreshing(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/sets')}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Sets
        </button>
        <p className="text-gray-400">Loading…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/sets')}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Sets
        </button>
        <p className="text-gray-400">Set not found.</p>
      </div>
    )
  }

  const hasEn = cards.some((c) => (c.language || 'EN') !== 'JP')

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/sets')}
        className="text-sm text-indigo-400 hover:text-indigo-300"
      >
        ← Sets
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-[#0b1020] p-2">
          {set?.logo_url ? (
            <img
              src={set.logo_url}
              alt={set.name}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-2xl text-gray-700">🃏</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold" title={set?.name}>
              {set?.name}
            </h1>
            <LangBadge language={set?.language} />
          </div>
          {set?.series && (
            <div className="text-sm text-gray-400">{set.series}</div>
          )}
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-sm text-gray-300">
              <span>
                {completion.owned}/{completion.total} variants
              </span>
              <span className="font-semibold text-emerald-400">
                {completion.pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${completion.pct}%` }}
              />
            </div>
          </div>
        </div>
        {hasEn && (
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {refreshing
              ? `Refreshing ${refreshProgress.done}/${refreshProgress.total}…`
              : 'Refresh prices'}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {cards.length === 0 && (
        <p className="text-gray-400">This set has no cards yet.</p>
      )}

      {/* Card grid */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {cards.map((card) => {
            const variants = variantsByCard[card.id] || []
            return (
              <div
                key={card.id}
                className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5"
              >
                <div className="relative aspect-[3/4] w-full bg-[#0b1020]">
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
                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                  <div
                    className="truncate text-sm font-medium text-gray-100"
                    title={card.name}
                  >
                    {card.name}
                  </div>
                  <div className="text-xs text-gray-400">
                    {card.number ? `#${card.number}` : ''}
                    {card.rarity
                      ? `${card.number ? ' · ' : ''}${card.rarity}`
                      : ''}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    {variants.length === 0 && (
                      <span className="text-[10px] text-gray-600">
                        no variants
                      </span>
                    )}
                    {variants.map((v) => {
                      const isOwned = owned.has(ownKey(card.id, v))
                      return (
                        <button
                          key={v}
                          onClick={() => toggleVariant(card.id, v)}
                          disabled={!uid}
                          title={
                            isOwned
                              ? 'Owned — click to remove'
                              : 'Click to add to collection'
                          }
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition disabled:opacity-40 ${
                            isOwned
                              ? 'bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/40'
                              : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                          }`}
                        >
                          {v.replace(/_/g, ' ')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
