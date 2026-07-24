// Build a Japanese(katakana) -> English Pokémon species-name map from PokeAPI's
// public CSV, written to api/lib/jp-species-map.json.
//
// TCGdex's Japanese catalog gives card names in katakana only (パラス, リザードン…).
// We annotate JP cards with their English species name so the collection is
// searchable/readable in English. This map is the lookup table for that.
//
// Source: PokeAPI data CSV (language_id 1 = ja-hrkt / katakana, 9 = English).
// Run once (or when new species ship): node scripts/build-jp-species-map.mjs
//
// Best-effort: only species names are mapped. Trainer/energy cards and any
// unmatched katakana simply get no English annotation.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'api', 'lib', 'jp-species-map.json')
const CSV =
  'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv'

// Minimal CSV parser (handles quoted fields with commas).
function parseCsv(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const fields = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') {
        fields.push(cur)
        cur = ''
      } else cur += ch
    }
    fields.push(cur)
    rows.push(fields)
  }
  return rows
}

const res = await fetch(CSV)
if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`)
const rows = parseCsv(await res.text())

// header: pokemon_species_id, local_language_id, name, genus
const header = rows.shift()
const idIdx = header.indexOf('pokemon_species_id')
const langIdx = header.indexOf('local_language_id')
const nameIdx = header.indexOf('name')

const kanaBySpecies = {} // id -> katakana
const enBySpecies = {} // id -> english
for (const r of rows) {
  const id = r[idIdx]
  const lang = r[langIdx]
  const name = r[nameIdx]
  if (!id || !name) continue
  if (lang === '1') kanaBySpecies[id] = name // ja-hrkt (katakana)
  else if (lang === '9') enBySpecies[id] = name // english
}

const map = {}
for (const id of Object.keys(kanaBySpecies)) {
  const kana = kanaBySpecies[id]
  const en = enBySpecies[id]
  if (kana && en) map[kana] = en
}

// Sort keys for a stable, diff-friendly file.
const sorted = {}
for (const k of Object.keys(map).sort()) sorted[k] = map[k]

writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n')
console.log(`Wrote ${Object.keys(sorted).length} species to ${OUT}`)
