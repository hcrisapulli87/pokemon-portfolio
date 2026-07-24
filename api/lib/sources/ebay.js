// eBay adapter — graded-card ASKING prices (EBAY_AU marketplace).
//
// IMPORTANT: eBay's Browse API returns ACTIVE ASKING prices, not sold prices.
// The old Finding/sold-price API was decommissioned, so these values are a
// best-guess signal only and MUST be labelled "asking" in the UI — never
// presented as realised/sold market value.
//
// Env: EBAY_APP_ID (client id), EBAY_CERT_ID (client secret).

const OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const BROWSE_SEARCH_URL =
  'https://api.ebay.com/buy/browse/v1/item_summary/search'
const SCOPE = 'https://api.ebay.com/oauth/api_scope'

// --- pure helper (unit-tested; no network) ---

// Summarize a list of numeric prices into { avg, min, max, num }.
// avg is rounded to 2dp. Returns null for an empty/invalid list.
export function summarizePrices(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && !Number.isNaN(v))
  if (nums.length === 0) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return {
    avg: Math.round((sum / nums.length) * 100) / 100,
    min: Math.min(...nums),
    max: Math.max(...nums),
    num: nums.length,
  }
}

// --- OAuth client-credentials token (module-cached) ---

let cachedToken = null // { token, expiresAt } (epoch ms)

export async function getEbayToken() {
  const now = Date.now()
  // Reuse until ~60s before expiry.
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token
  }

  const appId = process.env.EBAY_APP_ID
  const certId = process.env.EBAY_CERT_ID
  const basic = Buffer.from(`${appId}:${certId}`).toString('base64')

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  })
  if (!res.ok) {
    throw new Error(`eBay token request failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const expiresInMs = (data.expires_in ?? 7200) * 1000
  cachedToken = { token: data.access_token, expiresAt: Date.now() + expiresInMs }
  return cachedToken.token
}

// Grading-company / slab keywords used to exclude graded listings from a RAW
// price search (a PSA 10 slab is 10-50x the raw single and would wreck the avg).
const GRADED_RE = /\b(PSA|CGC|BGS|SGC|AGS|TCC|GMA|GEM|PRISTINE|GRADED|SLAB)\b/i

// Median is robust to the bundle/lot/mispriced outliers common in raw listings.
function median(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : Math.round(((nums[mid - 1] + nums[mid]) / 2) * 100) / 100
}

// --- raw single search (JP) ---

// Search eBay AU for a raw (ungraded) single's asking price. Filters results to
// listings whose title contains the card's collector number (e.g. "003/187")
// and excludes graded slabs, then returns the MEDIAN asking price.
// Returns { price, min, max, num } (AUD) or null if no clean listings.
// ASKING price (active listings) — label "asking" in the UI, never as sold value.
export async function searchRaw({ name, nameEn, number, isJapanese }) {
  const token = await getEbayToken()
  const display = nameEn || name
  const q = isJapanese
    ? `${display} ${number} japanese pokemon`
    : `${display} ${number} pokemon`

  const url = `${BROWSE_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=50`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
    },
  })
  if (!res.ok) {
    throw new Error(`eBay raw search failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const summaries = data.itemSummaries ?? []

  const n = parseInt(number, 10)
  // match "3/…", "003/…" but not "13/…" (word boundary before the number)
  const numRe = Number.isNaN(n) ? null : new RegExp(`\\b0*${n}\\s*/\\s*\\d`)

  const values = summaries
    .filter((it) => {
      const t = it?.title || ''
      if (GRADED_RE.test(t)) return false
      if (numRe && !numRe.test(t)) return false
      return true
    })
    .map((it) => Number(it?.price?.value))
    .filter((v) => typeof v === 'number' && !Number.isNaN(v) && v > 0)

  const price = median(values)
  if (price === null) return null
  return { price, min: Math.min(...values), max: Math.max(...values), num: values.length }
}

// --- graded search ---

// Search eBay AU for graded-card asking prices.
// For EN cards, query by name; for JP cards, query by set code + number
// (Japanese-script names don't match eBay listings — salvaged from the old app).
// Returns { avg, min, max, num } (num = count of listings) or null if none.
export async function searchGraded({
  name,
  number,
  company,
  grade,
  setCode,
  isJapanese,
}) {
  const token = await getEbayToken()

  const q = isJapanese
    ? `${setCode} ${number} ${company} ${grade}`
    : `${name} ${number} ${company} ${grade}`

  const url = `${BROWSE_SEARCH_URL}?q=${encodeURIComponent(q)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
    },
  })
  if (!res.ok) {
    throw new Error(`eBay search failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const summaries = data.itemSummaries ?? []
  // price.value is a string in AUD (marketplace is EBAY_AU) — coerce to number.
  const values = summaries
    .map((it) => Number(it?.price?.value))
    .filter((v) => typeof v === 'number' && !Number.isNaN(v))

  return summarizePrices(values)
}
