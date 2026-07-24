import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const COMPANIES = ['PSA', 'CGC', 'BGS', 'SGC']

const fieldClass =
  'w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

export default function AddGradedModal({ card, onClose, onSaved }) {
  const { session } = useAuth()
  const [company, setCompany] = useState('PSA')
  const [grade, setGrade] = useState('10')
  const [certNumber, setCertNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    if (!session?.user?.id) {
      setError('You must be signed in to add graded cards.')
      return
    }
    const gradeNum = Number(grade)
    if (Number.isNaN(gradeNum)) {
      setError('Enter a valid grade.')
      return
    }
    setSaving(true)
    setError('')

    const { error: insertError } = await supabase
      .from('graded')
      .insert({
        user_id: session.user.id,
        card_id: card.id,
        company,
        grade: gradeNum,
        cert_number: certNumber || null,
        notes: notes || null,
      })
      .select()

    if (insertError) {
      setSaving(false)
      setError(insertError.message)
      return
    }

    // Best-effort price refresh — don't block success on it.
    try {
      await fetch('/api/price-refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          cardId: card.id,
          graded: [{ company, grade: gradeNum }],
        }),
      })
    } catch {
      // ignore — prices can be filled in later
    }

    setSaving(false)
    onSaved?.()
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1020] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-100">Add Graded Card</h2>
            <p className="truncate text-sm text-gray-400" title={card.name}>
              {card.name}
              {card.number ? ` · #${card.number}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-400 transition hover:bg-white/5 hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-300">Company</label>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className={fieldClass}
              >
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-300">Grade</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="10"
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">
              Cert number
            </label>
            <input
              type="text"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-gray-300 transition hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
