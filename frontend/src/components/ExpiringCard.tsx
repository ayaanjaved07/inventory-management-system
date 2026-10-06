import { Link } from 'react-router-dom'
import { formatDate } from '../lib/utils'
import type { ExpiringItem } from '../lib/types'
import { ExpiryBadge } from './ExpiryBadge'

// The dashboard card listing items that have expired or expire within 30 days.
export function ExpiringCard({ items, total }: { items: ExpiringItem[]; total: number }) {
  return (
    <div className="card">
      <div className="page-header">
        <h2>Expiring soon ({total})</h2>
        {total > 0 && <Link to="/items?expiry=soon">See all in Items</Link>}
      </div>

      {items.length === 0 ? (
        <p className="muted">Nothing expires in the next 30 days.</p>
      ) : (
        <table>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/items/${item.id}`}>{item.name}</Link>
                  <div className="muted">{item.on_hand} on hand</div>
                </td>
                <td>{formatDate(item.expiry_date)}</td>
                <td>
                  <ExpiryBadge status={item.expiry_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
