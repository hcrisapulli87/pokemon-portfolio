// Master-set completion math.
// A "variant" is uniquely keyed by `card_id|variant_type`.

const keyOf = (v) => `${v.card_id}|${v.variant_type}`

export function setCompletion(variants, owned) {
  const totalSet = new Set(variants.map(keyOf))
  const ownedSet = new Set(owned.map(keyOf))

  const total = totalSet.size
  // Only count owned rows that correspond to a real variant in the set.
  let ownedCount = 0
  for (const key of ownedSet) {
    if (totalSet.has(key)) ownedCount += 1
  }

  const pct = total === 0 ? 0 : Math.round((ownedCount / total) * 100)
  return { owned: ownedCount, total, pct }
}
