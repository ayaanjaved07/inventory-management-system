import { Link } from 'react-router-dom'
import type { LowStockItem } from '../lib/types'

// The dashboard card listing items at or below their reorder point.
// The backend sends them worst first and at most 20 of them.
export function LowStockCard({ items, total }: { items: LowStockItem[]; total: number }) {
  return (
    <div className="card">
      <div className="page-header">
        <h2>Low stock ({total})</h2>
        {total > 0 && <Link to="/items?stock=low">See all in Items</Link>}
      </div>

      {items.length === 0 ? (
        <p className="muted">Everything is above its reorder point.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th className="num">On hand</th>
                <th className="num">Reorder point</th>
                <th className="num">Short by</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/items/${item.id}`}>{item.name}</Link>{' '}
                    <span className="muted mono">{item.sku}</span>
                  </td>
                  <td>{item.category || '-'}</td>
                  <td className="num">
                    {item.on_hand <= 0 ? <span className="badge red">Out of stock</span> : item.on_hand}
                  </td>
                  <td className="num">{item.reorder_point}</td>
                  {/* How many to order to get back up to the reorder point. */}
                  <td className="num">{item.reorder_point - item.on_hand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > items.length && (
        <p className="muted">
          Showing {items.length} of {total}.
        </p>
      )}
    </div>
  )
}
