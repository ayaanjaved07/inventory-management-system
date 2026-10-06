import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Purchase } from '../lib/types'

// One purchase in a purchases table. When it is open, a second row shows its
// lines. The page decides which purchase is open, so only one is open at a time.
export function PurchaseRow({
  purchase,
  isOpen,
  onToggle,
}: {
  purchase: Purchase
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr>
        <td className="mono">{purchase.reference_no}</td>
        <td>
          <Link to={`/suppliers/${purchase.supplier}`}>{purchase.supplier_name}</Link>
        </td>
        <td>{formatDate(purchase.purchase_date)}</td>
        <td>{purchase.location_code}</td>
        <td className="num">{formatCurrency(purchase.total_amount)}</td>
        <td>
          <button className="secondary small" onClick={onToggle}>
            {isOpen ? 'Hide' : 'Show'}
          </button>
        </td>
      </tr>

      {isOpen && (
        <tr className="details">
          <td colSpan={6}>
            <table style={{ background: 'white' }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Quantity</th>
                  <th className="num">Unit cost</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {purchase.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.item_name} <span className="muted mono">{line.item_sku}</span>
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatCurrency(line.unit_cost)}</td>
                    <td className="num">{formatCurrency(line.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {purchase.note && <p className="muted">Note: {purchase.note}</p>}
          </td>
        </tr>
      )}
    </>
  )
}
