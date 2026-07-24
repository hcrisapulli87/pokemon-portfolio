import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signInWithOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setStatus('sending')
    setError('')
    const { error } = await signInWithOtp(email)
    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-1">PokéVault</h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          Sign in with a magic link
        </p>

        {status === 'sent' ? (
          <div className="text-center space-y-3">
            <div className="text-4xl">📬</div>
            <p className="font-medium">Check your email</p>
            <p className="text-sm text-gray-400">
              We sent a magic link to <span className="text-gray-200">{email}</span>.
              Click it to sign in.
            </p>
            <button
              onClick={() => {
                setStatus('idle')
                setEmail('')
              }}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {status === 'error' && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
