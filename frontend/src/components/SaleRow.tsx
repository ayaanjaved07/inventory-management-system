import { formatCurrency, formatDate } from '../lib/utils'
import type { Sale } from '../lib/types'

// One sale in the Sales table. When it is open, a second row shows its lines.
// The page decides which sale is open, so only one is open at a time.
export function SaleRow({
  sale,
  baseCurrency,
  isOpen,
  onToggle,
}: {
  sale: Sale
  baseCurrency: string
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr>
        <td className="mono">{sale.invoice_no}</td>
        <td>{sale.customer_name || '-'}</td>
        <td>{formatDate(sale.sale_date)}</td>
        <td className="num">{formatCurrency(sale.total_amount, sale.currency)}</td>
        <td>
          <button className="secondary small" onClick={onToggle}>
            {isOpen ? 'Hide' : 'Show'}
          </button>
        </td>
      </tr>

      {isOpen && (
        <tr className="details">
          <td colSpan={5}>
            <table style={{ background: 'white' }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Quantity</th>
                  <th className="num">Unit price</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.item_name} <span className="muted mono">{line.item_sku}</span>
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatCurrency(line.unit_price, sale.currency)}</td>
                    <td className="num">{formatCurrency(line.line_total, sale.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* A sale in another currency also shows its value in our currency,
                at the rate saved on the day of the sale. */}
            {sale.currency !== baseCurrency && (
              <p className="muted">
                {formatCurrency(sale.total_in_base_currency, baseCurrency)} at rate{' '}
                {sale.exchange_rate_used} (the rate on the day of the sale).
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
