import { Link } from 'react-router-dom'
import { ImageOff } from 'lucide-react'

import { formatCurrency } from '@/lib/utils'
import type { Item } from '@/lib/types'
import { Badge } from '@/components/ui'

/* The table on the Items page. It only displays the items it is given. */
export function ItemsTable({ items }: { items: Item[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="ledger-head bg-slate-50 text-left">
          <tr className="text-xs font-semibold text-slate-600">
            <th className="w-14 px-5 py-3">
              <span className="sr-only">Images</span>
            </th>
            <th className="px-5 py-3">SKU</th>
            <th className="px-5 py-3">Name</th>
            <th className="px-5 py-3">Category</th>
            <th className="px-5 py-3 text-right">Unit cost</th>
            <th className="px-5 py-3 text-right">On hand</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="py-3 pl-5 pr-0">
                {item.primary_image ? (
                  <img
                    src={item.primary_image}
                    alt=""
                    className="h-9 w-9 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-100">
                    <ImageOff className="h-4 w-4 text-slate-300" />
                  </div>
                )}
              </td>
              <td className="px-5 py-3">
                <Link
                  to={`/items/${item.id}`}
                  className="font-mono text-xs font-medium text-indigo-700 hover:underline"
                >
                  {item.sku}
                </Link>
              </td>
              <td className="px-5 py-3">
                <div className="font-medium text-slate-900">{item.name}</div>
              </td>
              <td className="px-5 py-3 text-slate-600">{item.category_name ?? '—'}</td>
              <td className="px-5 py-3 text-right text-slate-600">
                {formatCurrency(item.unit_cost, item.currency_code ?? 'INR')}
              </td>
              <td className="px-5 py-3 text-right">
                <span className="mr-2 font-medium text-slate-900">{item.on_hand}</span>
                {item.is_low_stock && <Badge tone="amber">Low stock</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
