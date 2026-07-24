import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle | busy | confirm | error
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setStatus('busy')
    setError('')

    if (mode === 'signup') {
      const { data, error } = await signUp(email, password)
      if (error) {
        setError(error.message)
        setStatus('error')
      } else if (!data.session) {
        // email confirmation is enabled on the project
        setStatus('confirm')
      }
      // if a session came back, onAuthStateChange logs us straight in
      return
    }

    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
      setStatus('error')
    }
    // success -> AuthContext flips session, ProtectedRoute renders the app
  }

  if (status === 'confirm') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-xl">
          <div className="text-4xl mb-3">📬</div>
          <p className="font-medium">Confirm your email</p>
          <p className="mt-2 text-sm text-gray-400">
            We sent a confirmation link to{' '}
            <span className="text-gray-200">{email}</span>. Click it, then sign in
            with your password.
          </p>
          <button
            onClick={() => {
              setMode('signin')
              setStatus('idle')
              setPassword('')
            }}
            className="mt-4 text-sm text-indigo-400 hover:text-indigo-300"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-1">PokéVault</h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
        </p>

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

          <div>
            <label htmlFor="password" className="block text-sm text-gray-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {status === 'error' && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={status === 'busy'}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {status === 'busy'
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-400">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setStatus('idle')
              setError('')
            }}
            className="text-indigo-400 hover:text-indigo-300"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
