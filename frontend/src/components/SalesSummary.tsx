import { formatCurrency, formatNumber } from '../lib/utils'
import type { SalesStats } from '../lib/types'

// The totals, revenue by month and best sellers at the top of the Sales page.
export function SalesSummary({ stats }: { stats: SalesStats }) {
  const currency = stats.base_currency

  // The biggest month gets a full-width bar; the others are a share of it.
  let biggest = 0
  for (const row of stats.revenue_by_month) {
    biggest = Math.max(biggest, Number(row.revenue))
  }

  return (
    <>
      <div className="stats">
        <div className="card">
          <div className="muted">Revenue</div>
          <div className="value">{formatCurrency(stats.revenue_total, currency)}</div>
        </div>
        <div className="card">
          <div className="muted">Invoices</div>
          <div className="value">{formatNumber(stats.invoice_count)}</div>
        </div>
      </div>

      <div className="two-columns">
        <div className="card">
          <h2>Revenue by month</h2>
          {stats.revenue_by_month.length === 0 ? (
            <p className="muted">No sales in this period.</p>
          ) : (
            <table>
              <tbody>
                {stats.revenue_by_month.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td style={{ width: '50%' }}>
                      <div className="bar" style={{ width: (Number(row.revenue) / biggest) * 100 + '%' }} />
                    </td>
                    <td className="num">{formatCurrency(row.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Best sellers</h2>
          {stats.top_items.length === 0 ? (
            <p className="muted">No sales in this period.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Quantity</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_items.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      {row.name} <span className="muted mono">{row.sku}</span>
                    </td>
                    <td className="num">{row.quantity}</td>
                    <td className="num">{formatCurrency(row.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
