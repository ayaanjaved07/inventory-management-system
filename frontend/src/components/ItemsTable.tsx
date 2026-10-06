import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Item } from '../lib/types'
import { ExpiryBadge } from './ExpiryBadge'

// The table on the Items page. It only shows the items it is given.
export function ItemsTable({ items }: { items: Item[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Image</th>
            <th>SKU</th>
            <th>Name</th>
            <th>Category</th>
            <th className="num">Unit cost</th>
            <th className="num">On hand</th>
            <th>Expiry</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.primary_image ? (
                  <img className="thumb" src={item.primary_image} alt="" />
                ) : (
                  <span className="muted">none</span>
                )}
              </td>
              <td className="mono">
                <Link to={`/items/${item.id}`}>{item.sku}</Link>
              </td>
              <td>{item.name}</td>
              <td>{item.category_name || '-'}</td>
              <td className="num">{formatCurrency(item.unit_cost, item.currency_code || 'INR')}</td>
              <td className="num">
                {item.on_hand} {item.is_low_stock && <span className="badge amber">Low stock</span>}
              </td>
              <td>
                {item.expiry_date ? formatDate(item.expiry_date) : '-'} <ExpiryBadge status={item.expiry_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
