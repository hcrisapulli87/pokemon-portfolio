import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Settings() {
  const { session, signOut } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const email = session?.user?.email

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Account
        </h2>
        <div className="mt-2 text-gray-100">{email || '—'}</div>
      </section>

      <button
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg bg-red-600/90 px-4 py-2.5 font-medium text-white transition hover:bg-red-600 sm:w-auto"
      >
        Sign out
      </button>

      {confirming && (
        <ConfirmDialog
          title="Sign out?"
          message="You'll need to sign in again with your email and password."
          confirmLabel="Sign out"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            signOut()
          }}
        />
      )}
    </div>
  )
}
