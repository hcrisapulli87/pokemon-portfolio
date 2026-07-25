import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { setCompletion } from '../lib/completion'
import ProgressRing from '../components/ProgressRing'

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
    <div className="space-y-3.5">
      <h1 className="text-[22px] font-extrabold text-white">Sets</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter sets by name…"
        className="w-full rounded-xl border border-white/[0.08] bg-vault-surface px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-holo-cyan focus:ring-1 focus:ring-holo-cyan"
      />

      <div className="flex gap-2">
        {['All', 'EN', 'JP'].map((l) => {
          const active = lang === l
          return (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                active
                  ? 'bg-holo-cta font-bold text-vault-bg'
                  : 'bg-vault-surface text-vault-muted'
              }`}
            >
              {l}
            </button>
          )
        })}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && filtered.length === 0 && !error && (
        <p className="text-gray-400">No sets match your filters.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {filtered.map((s) => {
            const isChased = chased.has(s.id)
            const comp = completion[s.id]
            const meta = [
              `${s.total ?? 0} cards`,
              s.language || 'EN',
              isChased && comp ? `${comp.owned}/${comp.total}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-vault-surface p-[14px]"
              >
                <button
                  onClick={() => navigate(`/sets/${s.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {isChased && comp ? (
                    <ProgressRing pct={comp.pct} color="#67e8f9" size={44} thickness={5} />
                  ) : s.logo_url ? (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-vault-surface2 p-1.5">
                      <img
                        src={s.logo_url}
                        alt={s.name}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="h-11 w-11 shrink-0 rounded-lg bg-vault-surface2" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-sm font-semibold text-white"
                      title={s.name_en ? `${s.name} (${s.name_en})` : s.name}
                    >
                      {s.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-vault-muted">{meta}</div>
                  </div>
                </button>

                <button
                  onClick={() => toggleChase(s.id)}
                  disabled={!uid}
                  className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-40 ${
                    isChased
                      ? 'bg-holo-cta text-vault-bg'
                      : 'bg-vault-surface2 text-vault-muted'
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
