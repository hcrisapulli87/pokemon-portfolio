// Auth gates for serverless write endpoints. These handlers use the service-role
// client (bypasses RLS), so they MUST NOT be publicly callable — otherwise anyone
// with the URL could trigger expensive catalog syncs / price refreshes (DoS) or
// write to shared tables.
//
//  - requireAdmin: for admin/cron-only endpoints (catalog-sync, cron-snapshot).
//    Accepts an `x-admin-token` header matching ADMIN_SYNC_TOKEN, OR Vercel Cron's
//    automatic `Authorization: Bearer ${CRON_SECRET}`.
//  - requireUser: for user-triggered endpoints (price-refresh). Verifies a Supabase
//    access token (Authorization: Bearer <jwt>). The admin token is also accepted so
//    the same endpoint can be reused by cron.

import { supabaseAdmin } from './supabaseAdmin.js'

function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

function adminTokenOk(req) {
  const expected = process.env.ADMIN_SYNC_TOKEN
  if (!expected) return false
  const header = req.headers?.['x-admin-token']
  if (header && header === expected) return true
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const token = bearer(req)
  if (token && (token === expected || token === process.env.CRON_SECRET)) return true
  return false
}

// Returns true if authorized; otherwise sends 401 and returns false.
export function requireAdmin(req, res) {
  if (adminTokenOk(req)) return true
  res.status(401).json({ error: 'unauthorized' })
  return false
}

// Returns the authenticated user object if authorized; otherwise sends 401 and
// returns null. Admin token is accepted too (returns a sentinel { admin: true }).
export async function requireUser(req, res) {
  if (adminTokenOk(req)) return { admin: true }
  const token = bearer(req)
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (!error && data?.user) return data.user
  }
  res.status(401).json({ error: 'unauthorized' })
  return null
}
