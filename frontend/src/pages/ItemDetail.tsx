import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { formatCurrency, formatDateTime } from '../lib/utils'
import type { Item, Paginated, StockMovement } from '../lib/types'
import { ImageUploader } from '../components/ImageUploader'

// One row of GET /items/<id>/stock/: how many are at each location.
interface LocationLevel {
  location_id: number
  location_code: string
  location_name: string
  quantity: number
}

export default function ItemDetail() {
  const { id } = useParams()
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const item = useApi<Item>(`/items/${id}/`)
  const levels = useApi<LocationLevel[]>(`/items/${id}/stock/`)
  const movements = useApi<Paginated<StockMovement>>(`/stock/movements/?item=${id}`)

  if (item.error) return <p className="error">{item.error}</p>
  if (!item.data) return <p>Loading...</p>

  const data = item.data

  return (
    <>
      <Link to="/items">&larr; Back to items</Link>

      <h1 style={{ marginTop: 12 }}>
        {data.name} <span className="muted mono">{data.sku}</span>{' '}
        {data.is_low_stock && <span className="badge amber">Low stock</span>}
      </h1>

      <div className="two-columns">
        <div className="card">
          <h2>Details</h2>
          <table>
            <tbody>
              <tr>
                <th>Category</th>
                <td>{data.category_name || '-'}</td>
              </tr>
              <tr>
                <th>Unit</th>
                <td>{data.unit}</td>
              </tr>
              <tr>
                <th>Unit cost</th>
                <td>{formatCurrency(data.unit_cost, data.currency_code || 'INR')}</td>
              </tr>
              <tr>
                <th>Reorder point</th>
                <td>{data.reorder_point}</td>
              </tr>
              <tr>
                <th>On hand</th>
                <td>{data.on_hand}</td>
              </tr>
              <tr>
                <th>Active</th>
                <td>{data.is_active ? 'Yes' : 'No'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Stock by location</h2>
          {levels.data && levels.data.length === 0 && (
            <p className="muted">No stock at any location.</p>
          )}
          {levels.data && levels.data.length > 0 && (
            <table>
              <tbody>
                {levels.data.map((level) => (
                  <tr key={level.location_id}>
                    <td>
                      {level.location_name} <span className="muted mono">{level.location_code}</span>
                    </td>
                    <td className="num">{level.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Images</h2>
        <ImageUploader itemId={data.id} canEdit={canEdit} />
      </div>

      <div className="card">
        <h2>Movements</h2>
        {movements.data && movements.data.results.length === 0 && (
          <p className="muted">No movements for this item yet.</p>
        )}
        {movements.data && movements.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th className="num">Quantity</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {movements.data.results.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.created_at)}</td>
                    <td>{m.movement_type_display}</td>
                    <td>{m.location_code}</td>
                    <td className="num">{m.quantity > 0 ? '+' + m.quantity : m.quantity}</td>
                    <td>{m.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
