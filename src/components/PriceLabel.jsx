const FORMATTERS = {}

function formatMoney(price, currency) {
  if (!FORMATTERS[currency]) {
    try {
      FORMATTERS[currency] = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      })
    } catch {
      FORMATTERS[currency] = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency,
      })
    }
  }
  return FORMATTERS[currency].format(price)
}

export default function PriceLabel({ price, currency = 'AUD', asking = false }) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) {
    return (
      <span className="text-xs text-gray-500" title="No price data">
        — <span className="text-gray-600">no data</span>
      </span>
    )
  }

  return (
    <span className="text-sm font-semibold text-emerald-400">
      {formatMoney(Number(price), currency)}
      {asking && (
        <span className="ml-1 align-middle text-[10px] font-normal text-gray-500">
          (asking)
        </span>
      )}
    </span>
  )
}
