import { createClient } from '@supabase/supabase-js'

// Service-role writer, scoped to PokéVault's own `pokevault` Postgres schema
// (shared project; see supabase/schema.sql). auth.getUser() is unaffected by
// db.schema — it hits GoTrue, not the DB.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'pokevault' } }
)
