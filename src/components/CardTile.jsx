import PriceLabel from './PriceLabel'

function LangBadge({ language }) {
  const isJP = language === 'JP'
  const cls = isJP
    ? 'bg-red-500/20 text-red-300 border-red-500/30'
    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      {language || 'EN'}
    </span>
  )
}

export default function CardTile({ card, price, onAdd, onAddGraded }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-white/20">
      <div className="relative aspect-[3/4] w-full bg-[#0b1020]">
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

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <PriceLabel price={price} />
          {(onAdd || onAddGraded) && (
            <div className="flex shrink-0 items-center gap-1">
              {onAdd && (
                <button
                  onClick={() => onAdd(card)}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-500"
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
