import { useApi } from '../lib/useApi'
import { NO_ITEM_FILTERS } from '../lib/types'
import type { Category, ItemFilterValues, Paginated } from '../lib/types'

// The filter boxes above the items table.
export function ItemFilters({
  filters,
  onChange,
}: {
  filters: ItemFilterValues
  onChange: (filters: ItemFilterValues) => void
}) {
  const categories = useApi<Paginated<Category>>('/categories/?page_size=500')

  // Change one filter and keep the others.
  function set(field: keyof ItemFilterValues, value: string) {
    onChange({ ...filters, [field]: value })
  }

  return (
    <>
      <div className="form-grid">
        <label>
          Search
          <input
            placeholder="SKU, name or description"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </label>
        <label>
          Category
          <select value={filters.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All</option>
            {categories.data?.results.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unit
          <select value={filters.unit} onChange={(e) => set('unit', e.target.value)}>
            <option value="">All</option>
            <option value="pc">Piece</option>
            <option value="box">Box</option>
            <option value="kg">Kilogram</option>
            <option value="l">Litre</option>
            <option value="m">Metre</option>
            <option value="set">Set</option>
          </select>
        </label>
        <label>
          Stock
          <select value={filters.stock} onChange={(e) => set('stock', e.target.value)}>
            <option value="">All</option>
            <option value="ok">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
        <label>
          On hand from
          <input type="number" min="0" value={filters.min_stock} onChange={(e) => set('min_stock', e.target.value)} />
        </label>
        <label>
          On hand up to
          <input type="number" min="0" value={filters.max_stock} onChange={(e) => set('max_stock', e.target.value)} />
        </label>
        <label>
          Unit cost from
          <input
            type="number"
            min="0"
            step="0.01"
            value={filters.unit_cost__gte}
            onChange={(e) => set('unit_cost__gte', e.target.value)}
          />
        </label>
        <label>
          Unit cost up to
          <input
            type="number"
            min="0"
            step="0.01"
            value={filters.unit_cost__lte}
            onChange={(e) => set('unit_cost__lte', e.target.value)}
          />
        </label>
        <label>
          Expiry
          <select value={filters.expiry} onChange={(e) => set('expiry', e.target.value)}>
            <option value="">All</option>
            <option value="soon">Expired or expiring in 30 days</option>
            <option value="expired">Expired</option>
            <option value="none">No expiry date</option>
          </select>
        </label>
        <label>
          Status
          <select value={filters.is_active} onChange={(e) => set('is_active', e.target.value)}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Deleted</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={filters.ordering} onChange={(e) => set('ordering', e.target.value)}>
            <option value="name">Name (A to Z)</option>
            <option value="-name">Name (Z to A)</option>
            <option value="on_hand">On hand (lowest first)</option>
            <option value="-on_hand">On hand (highest first)</option>
            <option value="unit_cost">Unit cost (lowest first)</option>
            <option value="-unit_cost">Unit cost (highest first)</option>
            <option value="expiry_date">Expiry date (soonest first)</option>
            <option value="-created_at">Newest first</option>
          </select>
        </label>
      </div>

      <button type="button" className="secondary small" onClick={() => onChange(NO_ITEM_FILTERS)}>
        Clear filters
      </button>
    </>
  )
}
