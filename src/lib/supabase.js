import { createClient } from '@supabase/supabase-js'

// PokéVault lives in its own `pokevault` Postgres schema inside the shared
// Supabase project — so every .from('...') query resolves to pokevault.<table>.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    db: { schema: 'pokevault' },
    // Keep the session across app close/reopen. Distinct storageKey so the shared
    // Supabase project never clashes with the other apps' stored sessions.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'pokevault-auth',
    },
  }
)
