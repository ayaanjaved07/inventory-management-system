import { Link } from 'react-router-dom'

import { useApi } from '../lib/useApi'
import { formatCurrency, formatDateTime, formatNumber } from '../lib/utils'
import type { DashboardStats, Paginated, StockMovement } from '../lib/types'

// One number in the grid at the top of the dashboard.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const stats = useApi<DashboardStats>('/stats/dashboard/')
  const movements = useApi<Paginated<StockMovement>>('/stock/movements/')

  if (stats.error) return <p className="error">{stats.error}</p>
  if (!stats.data) return <p>Loading...</p>

  const data = stats.data
  // The backend sends 25 movements; the dashboard only shows the newest 8.
  const recent = movements.data ? movements.data.results.slice(0, 8) : []

  return (
    <>
      <h1>Dashboard</h1>

      <div className="stats">
        <Stat label="Items tracked" value={formatNumber(data.total_items)} />
        <Stat label="Units on hand" value={formatNumber(data.total_units)} />
        <Stat label="Stock value" value={formatCurrency(data.stock_value)} />
        <Stat label="Low stock" value={formatNumber(data.low_stock_count)} />
        <Stat label="Revenue (30 days)" value={formatCurrency(data.revenue_30d, data.base_currency)} />
        <Stat label="Invoices" value={formatNumber(data.invoice_count)} />
        <Stat label="Active projects" value={formatNumber(data.active_projects)} />
      </div>

      <div className="two-columns">
        <div className="card">
          <h2>Items at or below reorder point</h2>
          {data.low_stock_items.length === 0 ? (
            <p className="muted">Everything is above its reorder point.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th className="num">On hand</th>
                  <th className="num">Reorder point</th>
                </tr>
              </thead>
              <tbody>
                {data.low_stock_items.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.sku}</td>
                    <td>
                      <Link to={`/items/${item.id}`}>{item.name}</Link>
                    </td>
                    <td className="num">{item.on_hand}</td>
                    <td className="num">{item.reorder_point}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Recent stock movements</h2>
          {movements.loading && <p>Loading...</p>}
          {!movements.loading && recent.length === 0 && (
            <p className="muted">No stock movements yet.</p>
          )}
          {recent.length > 0 && (
            <table>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td className="num">
                      <span className={m.quantity > 0 ? 'badge green' : 'badge red'}>
                        {m.quantity > 0 ? '+' + m.quantity : m.quantity}
                      </span>
                    </td>
                    <td>
                      <Link to={`/items/${m.item}`}>{m.item_name}</Link>
                      <div className="muted">
                        {m.movement_type_display} · {m.location_code}
                        {m.created_by_name && ' · ' + m.created_by_name}
                      </div>
                    </td>
                    <td className="muted">{formatDateTime(m.created_at)}</td>
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
