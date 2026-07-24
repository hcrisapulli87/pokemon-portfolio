// Seed the full EN + JP catalog by calling the deployed catalog-sync endpoint
// ONE SET AT A TIME (each request stays well under Vercel's function timeout).
//
// Usage:
//   node scripts/seed-catalog.mjs            # both EN and JP
//   node scripts/seed-catalog.mjs EN         # EN only
//   node scripts/seed-catalog.mjs JP         # JP only
//
// Reads from .env (or the environment):
//   APP_URL             e.g. https://pokemon-portfolio-three.vercel.app
//   ADMIN_SYNC_TOKEN    the admin gate token
//   POKEMONTCG_API_KEY  for listing EN set ids
//
// Safe to re-run: catalog-sync upserts, so re-seeding just refreshes rows.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Minimal .env loader (no dependency).
function loadEnv() {
  try {
    const txt = readFileSync(join(__dirname, '..', '.env'), 'utf8')
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {
    /* no .env — rely on real environment */
  }
}
loadEnv()

const APP_URL = (process.env.APP_URL || 'https://pokemon-portfolio-three.vercel.app').replace(/\/$/, '')
const ADMIN_TOKEN = process.env.ADMIN_SYNC_TOKEN
const PTCG_KEY = process.env.POKEMONTCG_API_KEY

if (!ADMIN_TOKEN) {
  console.error('Missing ADMIN_SYNC_TOKEN (set it in .env)')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function enSetIds() {
  if (!PTCG_KEY) throw new Error('Missing POKEMONTCG_API_KEY for EN set listing')
  const ids = []
  let page = 1
  for (;;) {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/sets?select=id&page=${page}&pageSize=250`,
      { headers: { 'X-Api-Key': PTCG_KEY } }
    )
    if (!res.ok) throw new Error(`pokemontcg /sets page ${page} -> ${res.status}`)
    const body = await res.json()
    const batch = (body.data || []).map((s) => s.id)
    ids.push(...batch)
    if (batch.length < 250) break
    page += 1
  }
  return ids
}

async function jpSetIds() {
  const res = await fetch('https://api.tcgdex.net/v2/ja/sets')
  if (!res.ok) throw new Error(`tcgdex /ja/sets -> ${res.status}`)
  const body = await res.json()
  return (body || []).map((s) => s.id)
}

async function syncSet(lang, setId) {
  const url = `${APP_URL}/api/catalog-sync?lang=${lang}&set=${encodeURIComponent(setId)}`
  const res = await fetch(url, { headers: { 'x-admin-token': ADMIN_TOKEN } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`)
  return JSON.parse(text)
}

async function seedLang(lang) {
  const ids = lang === 'EN' ? await enSetIds() : await jpSetIds()
  console.log(`\n=== ${lang}: ${ids.length} sets ===`)
  let ok = 0
  let cards = 0
  const failed = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    try {
      const r = await syncSet(lang, id)
      ok += 1
      cards += r.cardsUpserted || 0
      console.log(
        `[${lang} ${i + 1}/${ids.length}] ${id}: ${r.cardsUpserted} cards, ${r.variantsUpserted} variants`
      )
    } catch (e) {
      failed.push(id)
      console.warn(`[${lang} ${i + 1}/${ids.length}] ${id}: FAILED ${e.message}`)
    }
    await sleep(400) // be gentle on upstream + our function
  }
  console.log(`--- ${lang} done: ${ok}/${ids.length} sets, ${cards} cards. Failed: ${failed.join(', ') || 'none'}`)
}

const arg = (process.argv[2] || '').toUpperCase()
const langs = arg === 'EN' || arg === 'JP' ? [arg] : ['EN', 'JP']

for (const lang of langs) {
  await seedLang(lang)
}
console.log('\nSeeding complete.')
