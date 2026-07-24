import PriceLabel from './PriceLabel'

function LangBadge({ language }) {
  const isJP = language === 'JP'
  const cls = isJP
    ? 'bg-red-500/20 text-red-300 border-red-500/30'
    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {language || 'EN'}
    </span>
  )
}

function GradeBadge({ company, grade }) {
  return (
    <span className="rounded border border-holo-gold/40 bg-holo-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-holo-gold">
      {company} {grade}
    </span>
  )
}

// graded (optional): { company, grade, cert_number } — presence switches the
// tile to the gradient-bordered slab treatment + gold grade badge.
// onDelete (optional): renders a Delete action next to the price (used by Graded.jsx).
export default function HoloCardTile({ card, price, onAdd, onAddGraded, graded, onDelete }) {
  const isGraded = !!graded

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl transition ${
        isGraded
          ? 'holo-border'
          : 'border border-white/10 bg-vault-surface hover:border-white/20'
      }`}
    >
      <div className="relative aspect-[3/4] w-full bg-vault-bg">
        {card.image_small ? (
          <img
            src={card.image_small}
            alt={card.name}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-gray-700">
            🃏
          </div>
        )}
        <div className="absolute right-1.5 top-1.5">
          <LangBadge language={card.language} />
        </div>
        {isGraded && (
          <div className="absolute left-1.5 top-1.5">
            <GradeBadge company={graded.company} grade={graded.grade} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="truncate text-sm font-medium text-gray-100" title={card.name}>
          {card.name}
        </div>
        {card.name_en && card.name_en !== card.name && (
          <div className="truncate text-xs text-gray-400" title={card.name_en}>
            {card.name_en}
          </div>
        )}
        <div className="text-xs text-gray-400">
          {card.number ? `#${card.number}` : ''}
          {card.rarity ? `${card.number ? ' · ' : ''}${card.rarity}` : ''}
        </div>
        {isGraded && graded.cert_number && (
          <div className="truncate text-[11px] text-gray-500" title={graded.cert_number}>
            Cert {graded.cert_number}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <PriceLabel price={price} asking={isGraded} />
          {(onAdd || onAddGraded || onDelete) && (
            <div className="flex shrink-0 items-center gap-1">
              {onAdd && (
                <button
                  onClick={() => onAdd(card)}
                  className="rounded-lg bg-holo-cta px-2.5 py-1 text-xs font-medium text-vault-bg transition hover:opacity-90"
                >
                  Add
                </button>
              )}
              {onAddGraded && (
                <button
                  onClick={() => onAddGraded(card)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs font-medium text-gray-200 transition hover:bg-white/10"
                >
                  Graded
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  aria-label="Remove"
                  className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
