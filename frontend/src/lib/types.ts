// The shapes of the data the backend sends. Only the fields the pages use
// are listed here; the backend may send more.

export type Role = 'Admin' | 'Manager' | 'Storekeeper' | 'Viewer'
export const ROLES: Role[] = ['Admin', 'Manager', 'Storekeeper', 'Viewer']

// Every list endpoint returns one page of results plus the total count.
export interface Paginated<T> {
  count: number
  results: T[]
}

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_active: boolean
  is_superuser: boolean
  roles: Role[]
}

export interface Category {
  id: number
  name: string
}

export interface Item {
  id: number
  sku: string
  name: string
  category_name: string | null
  unit: string
  unit_cost: string
  currency_code: string | null
  reorder_point: number
  is_active: boolean
  on_hand: number
  is_low_stock: boolean
  primary_image: string | null
}

export interface ItemImage {
  id: number
  image: string
  is_primary: boolean
  alt_text: string
}

export interface Location {
  id: number
  name: string
  code: string
}

export interface StockMovement {
  id: number
  item: number
  item_sku: string
  item_name: string
  location_code: string
  movement_type_display: string
  quantity: number
  note: string
  created_by_name: string | null
  created_at: string
}

export interface Project {
  id: number
  code: string
  name: string
  status_display: string
  start_date: string | null
  allocation_count: number
}

export interface Allocation {
  id: number
  item_sku: string
  item_name: string
  location_code: string
  quantity_allocated: number
  quantity_issued: number
  quantity_returned: number
  // Reserved but not issued yet.
  outstanding_reservation: number
  // Issued but not returned yet.
  quantity_outstanding: number
  status: string
  status_display: string
}

// `available` is the number to offer a user, not `on_hand`.
export interface Availability {
  on_hand: number
  reserved: number
  available: number
}

export interface Customer {
  id: number
  name: string
}

export interface SaleLine {
  id: number
  item_sku: string
  item_name: string
  quantity: number
  unit_price: string
  line_total: string
}

export interface Sale {
  id: number
  invoice_no: string
  customer_name: string | null
  sale_date: string
  currency: string
  // The rate on the day of the sale. Never recompute it at today's rate.
  exchange_rate_used: string
  total_amount: string
  total_in_base_currency: string
  lines: SaleLine[]
}

export interface SalesStats {
  base_currency: string
  invoice_count: number
  revenue_total: string
  revenue_by_month: { month: string; revenue: string }[]
  top_items: { sku: string; name: string; quantity: number; revenue: string }[]
}

export interface DashboardStats {
  total_items: number
  total_units: number
  stock_value: string
  low_stock_count: number
  low_stock_items: { id: number; sku: string; name: string; on_hand: number; reorder_point: number }[]
  active_projects: number
  invoice_count: number
  revenue_30d: string
  base_currency: string
}

export interface ActivityLogEntry {
  id: number
  user_name: string | null
  action_display: string
  model_name: string
  object_repr: string
  // {field: [old value, new value]}. Empty for create, delete and login.
  changes: Record<string, [unknown, unknown]>
  timestamp: string
}

// Result of POST /items/import/, checked or applied.
export interface ImportReport {
  committed: boolean
  created: number
  updated: number
  errors: { row: number; sku: string; message: string }[]
}
