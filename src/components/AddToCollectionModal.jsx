import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const VARIANTS = [
  { value: 'normal', label: 'Normal' },
  { value: 'reverse_holo', label: 'Reverse Holo' },
  { value: 'holo', label: 'Holo' },
  { value: 'secret', label: 'Secret' },
  { value: 'special_art', label: 'Special Art' },
  { value: 'hyper', label: 'Hyper' },
]

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG']

const fieldClass =
  'w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

export default function AddToCollectionModal({ card, onClose, onSaved }) {
  const { session } = useAuth()
  const [variantType, setVariantType] = useState('normal')
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState('NM')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    if (!session?.user?.id) {
      setError('You must be signed in to add cards.')
      return
    }
    setSaving(true)
    setError('')

    const { error: insertError } = await supabase
      .from('collection')
      .insert({
        user_id: session.user.id,
        card_id: card.id,
        variant_type: variantType,
        quantity: Number(quantity) || 1,
        condition,
        notes: notes || null,
      })
      .select()

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

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
            <h2 className="text-lg font-bold text-gray-100">Add to Collection</h2>
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
          <div>
            <label className="mb-1 block text-sm text-gray-300">Variant</label>
            <select
              value={variantType}
              onChange={(e) => setVariantType(e.target.value)}
              className={fieldClass}
            >
              {VARIANTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-300">Quantity</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-300">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className={fieldClass}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
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
