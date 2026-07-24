import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { setCompletion } from '../lib/completion'
import ProgressRing from '../components/ProgressRing'

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

// Compute completion for a single chased set with three light queries.
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

export default function MasterSets() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const navigate = useNavigate()

  const [sets, setSets] = useState([])
  const [chased, setChased] = useState(new Set()) // set_ids
  const [completion, setCompletionState] = useState({}) // set_id -> {owned,total,pct}
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lang, setLang] = useState('All') // All | EN | JP
  const [search, setSearch] = useState('')

  // Load all sets + the user's chased sets.
  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError('')

      let { data: setRows, error: setErr } = await supabase
        .from('sets')
        .select('id,name,series,language,total,logo_url')
        .order('release_date', { ascending: false, nullsFirst: false })

      // Fallback if ordering on nulls is unsupported.
      if (setErr) {
        const alt = await supabase
          .from('sets')
          .select('id,name,name_en,series,language,total,logo_url')
          .order('name', { ascending: true })
        setRows = alt.data
        setErr = alt.error
      }

      if (!alive) return
      if (setErr) {
        setError(setErr.message)
        setLoading(false)
        return
      }

      setSets(setRows || [])

      if (uid) {
        const { data: chaseRows } = await supabase
          .from('chased_sets')
          .select('set_id')
          .eq('user_id', uid)
        if (!alive) return
        setChased(new Set((chaseRows || []).map((r) => r.set_id)))
      }

      setLoading(false)
    }
    load()
    return () => {
      alive = false
    }
  }, [uid])

  // Compute completion for every chased set (usually few).
  const chasedKey = useMemo(() => [...chased].sort().join(','), [chased])
  useEffect(() => {
    if (!uid) return
    const ids = chasedKey ? chasedKey.split(',') : []
    if (ids.length === 0) {
      setCompletionState({})
      return
    }
    let alive = true
    Promise.all(ids.map((id) => completionForSet(id, uid))).then((results) => {
      if (!alive) return
      const next = {}
      ids.forEach((id, i) => {
        next[id] = results[i]
      })
      setCompletionState(next)
    })
    return () => {
      alive = false
    }
  }, [chasedKey, uid])

  const toggleChase = useCallback(
    async (setId) => {
      if (!uid) return
      const isChased = chased.has(setId)

      // Optimistic local update.
      setChased((prev) => {
        const next = new Set(prev)
        if (isChased) next.delete(setId)
        else next.add(setId)
        return next
      })

      const { error: mutErr } = isChased
        ? await supabase
            .from('chased_sets')
            .delete()
            .eq('user_id', uid)
            .eq('set_id', setId)
        : await supabase
            .from('chased_sets')
            .insert({ user_id: uid, set_id: setId })

      if (mutErr) {
        // Revert on failure.
        setError(mutErr.message)
        setChased((prev) => {
          const next = new Set(prev)
          if (isChased) next.add(setId)
          else next.delete(setId)
          return next
        })
      }
    },
    [uid, chased]
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sets.filter((s) => {
      if (lang !== 'All' && (s.language || 'EN') !== lang) return false
      if (
        term &&
        !s.name.toLowerCase().includes(term) &&
        !(s.name_en || '').toLowerCase().includes(term)
      )
        return false
      return true
    })
  }, [sets, lang, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Sets</h1>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-vault-surface p-1">
          {['All', 'EN', 'JP'].map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                lang === l
                  ? 'bg-holo-cta text-vault-bg'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter sets by name…"
        className="w-full rounded-lg border border-white/10 bg-vault-bg px-4 py-2.5 text-gray-100 placeholder-gray-500 outline-none focus:border-holo-cyan focus:ring-1 focus:ring-holo-cyan"
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && filtered.length === 0 && !error && (
        <p className="text-gray-400">No sets match your filters.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => {
            const isChased = chased.has(s.id)
            const comp = completion[s.id]
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-vault-surface p-4 transition hover:border-white/20"
              >
                <button
                  onClick={() => navigate(`/sets/${s.id}`)}
                  className="flex items-center gap-3 text-left"
                >
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-vault-bg p-2">
                    {s.logo_url ? (
                      <img
                        src={s.logo_url}
                        alt={s.name}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-2xl text-gray-700">🃏</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate font-semibold text-gray-100"
                      title={s.name_en ? `${s.name} (${s.name_en})` : s.name}
                    >
                      {s.name}
                    </div>
                    {s.name_en && s.name_en !== s.name && (
                      <div className="truncate text-xs text-gray-400" title={s.name_en}>
                        {s.name_en}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                      <LangBadge language={s.language} />
                      <span>{s.total ?? 0} cards</span>
                    </div>
                  </div>
                </button>

                {isChased && comp && (
                  <div className="flex items-center gap-3">
                    <ProgressRing pct={comp.pct} color="#8b7cf6" size={36} thickness={3.5} />
                    <span className="text-xs text-gray-400">
                      {comp.owned}/{comp.total}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => toggleChase(s.id)}
                  disabled={!uid}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${
                    isChased
                      ? 'bg-holo-cta text-vault-bg hover:opacity-90'
                      : 'bg-vault-surface2 text-gray-300 hover:text-gray-100'
                  }`}
                >
                  {isChased ? 'Chasing ✓' : 'Chase'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
