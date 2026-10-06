import { isoDateDaysAgo } from '../lib/utils'
import type { ActivityFilterValues } from '../lib/types'

// The filter boxes above the activity table.
export function ActivityFilters({
  filters,
  onChange,
}: {
  filters: ActivityFilterValues
  onChange: (filters: ActivityFilterValues) => void
}) {
  // Change one filter and keep the others.
  function set(field: keyof ActivityFilterValues, value: string) {
    onChange({ ...filters, [field]: value })
  }

  // Show the last `days` days, up to today.
  function lastDays(days: number) {
    onChange({ ...filters, date_from: isoDateDaysAgo(days), date_to: '' })
  }

  return (
    <>
      <div className="form-grid">
        <label>
          Search
          <input
            placeholder="Invoice, client or supplier"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </label>
        <label>
          Type
          <select value={filters.model_name} onChange={(e) => set('model_name', e.target.value)}>
            <option value="">All</option>
            <option value="Sale">Sales</option>
            <option value="Purchase">Purchases</option>
            <option value="Customer">Clients</option>
            <option value="Supplier">Suppliers</option>
          </select>
        </label>
        <label>
          Action
          <select value={filters.action} onChange={(e) => set('action', e.target.value)}>
            <option value="">All</option>
            <option value="CREATE">Created</option>
            <option value="UPDATE">Updated</option>
            <option value="DELETE">Deleted</option>
          </select>
        </label>
        <label>
          From
          <input type="date" value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={filters.date_to} onChange={(e) => set('date_to', e.target.value)} />
        </label>
      </div>

      <div className="row">
        <button type="button" className="secondary small" onClick={() => lastDays(0)}>
          Today
        </button>
        <button type="button" className="secondary small" onClick={() => lastDays(7)}>
          Last 7 days
        </button>
        <button type="button" className="secondary small" onClick={() => lastDays(30)}>
          Last 30 days
        </button>
        <button type="button" className="secondary small" onClick={() => lastDays(90)}>
          Last 90 days
        </button>
        <button
          type="button"
          className="secondary small"
          onClick={() => onChange({ search: '', model_name: '', action: '', date_from: '', date_to: '' })}
        >
          Clear filters
        </button>
      </div>
    </>
  )
}
