import { formatCurrency, formatDate } from '@/lib/utils'
import type { Sale } from '@/lib/types'

/* One sale in the list on the Sales page. Clicking it shows its lines.
   The page decides which row is open, so only one is open at a time. */
export function SaleRow({
  sale, baseCurrency, isOpen, onToggle,
}: {
  sale: Sale
  baseCurrency: string
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <button
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="font-mono text-xs font-medium text-indigo-700">
            {sale.invoice_no}
          </div>
          <div className="mt-1 text-sm text-slate-900">
            {sale.customer_name ?? '—'}
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <span className="text-slate-500">{formatDate(sale.sale_date)}</span>
          <span className="font-semibold text-slate-900">
            {formatCurrency(sale.total_amount, sale.currency)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <table className="w-full text-sm">
            <thead className="ledger-head text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Quantity</th>
                <th className="pb-2 text-right">Unit price</th>
                <th className="pb-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sale.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2">
                    <span className="font-mono text-xs text-slate-500">
                      {line.item_sku}
                    </span>{' '}
                    {line.item_name}
                  </td>
                  <td className="py-2 text-right">{line.quantity}</td>
                  <td className="py-2 text-right">
                    {formatCurrency(line.unit_price, sale.currency)}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrency(line.line_total, sale.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sale.currency !== baseCurrency && (
            <p className="mt-3 text-xs text-slate-500">
              {formatCurrency(sale.total_in_base_currency, baseCurrency)} @{' '}
              {sale.exchange_rate_used} — Converted at the rate on the day of sale.
            </p>
          )}
        </div>
      )}
    </li>
  )
}
