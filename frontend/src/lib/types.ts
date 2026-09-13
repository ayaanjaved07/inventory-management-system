export type Role = 'Admin' | 'Manager' | 'Storekeeper' | 'Viewer'

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  phone: string
  is_active: boolean
  is_superuser: boolean
  roles: Role[]
}

export interface Category {
  id: number
  name: string
  parent: number | null
  description: string
  item_count?: number
}

export interface Item {
  id: number
  sku: string
  name: string
  description: string
  category: number | null
  category_name: string | null
  unit: string
  unit_cost: string
  currency: number | null
  currency_code: string | null
  reorder_point: number
  is_active: boolean
  custom_fields: Record<string, unknown>
  on_hand: number
  is_low_stock: boolean
  primary_image: string | null
  created_at: string
  updated_at: string
}

export interface ItemImage {
  id: number
  item: number
  image: string
  is_primary: boolean
  alt_text: string
  created_at: string
}

/** Result of POST /items/import/, dry run or committed. */
export interface ImportReport {
  committed: boolean
  created: number
  updated: number
  errors: Array<{ row: number; sku: string; message: string }>
}

export interface Location {
  id: number
  name: string
  code: string
  address: string
  is_active: boolean
}

export type MovementType =
  | 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT'
  | 'TRANSFER_IN' | 'TRANSFER_OUT'
  | 'SALE' | 'RETURN'
  | 'PROJECT_ISSUE' | 'PROJECT_RETURN'

export interface StockMovement {
  id: number
  item: number
  item_sku: string
  item_name: string
  location: number
  location_code: string
  movement_type: MovementType
  movement_type_display: string
  quantity: number
  unit_cost: string | null
  note: string
  reference_type: string
  reference_id: string
  created_by: number | null
  created_by_name: string | null
  created_at: string
}

export interface StockLevel {
  item_id: number
  sku: string
  name: string
  category: string | null
  unit: string
  on_hand: number
  reorder_point: number
  is_low_stock: boolean
}

export type ProjectStatus =
  | 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'

export interface Project {
  id: number
  code: string
  name: string
  description: string
  status: ProjectStatus
  status_display: string
  start_date: string | null
  end_date: string | null
  manager: number | null
  manager_name: string | null
  allocation_count?: number
  created_at: string
  updated_at: string
}

export type AllocationStatus =
  | 'RESERVED' | 'PARTIAL' | 'ISSUED' | 'RETURNED' | 'CANCELLED'

export interface Allocation {
  id: number
  project: number
  project_code: string
  item: number
  item_sku: string
  item_name: string
  location: number
  location_code: string
  assigned_to: number | null
  assigned_to_name: string | null
  quantity_allocated: number
  quantity_issued: number
  quantity_returned: number
  /** Reserved but not yet issued -- what blocks other demand. */
  outstanding_reservation: number
  /** Issued but not yet returned -- what the assignee still holds. */
  quantity_outstanding: number
  status: AllocationStatus
  status_display: string
  note: string
  created_at: string
}

/** GET /allocations/availability/. `available` is the only number to offer a user. */
export interface Availability {
  item: number
  location: number | null
  on_hand: number
  reserved: number
  available: number
}

export interface Customer {
  id: number
  name: string
  email: string
  phone: string
  address: string
  sale_count?: number
  created_at: string
}

export interface SaleLine {
  id: number
  item: number
  item_sku: string
  item_name: string
  quantity: number
  unit_price: string
  line_total: string
}

export interface Sale {
  id: number
  invoice_no: string
  customer: number | null
  customer_name: string | null
  location: number
  location_code: string
  sale_date: string
  currency: string
  /** Frozen at sale time -- never recompute a historical total at today's rate. */
  exchange_rate_used: string
  total_amount: string
  total_in_base_currency: string
  note: string
  lines: SaleLine[]
  created_at: string
}

export interface SalesStats {
  days: number
  base_currency: string
  invoice_count: number
  revenue_total: string
  revenue_by_month: Array<{ month: string; revenue: string }>
  top_items: Array<{ sku: string; name: string; quantity: number; revenue: string }>
}

export interface DashboardStats {
  total_items: number
  total_units: number
  stock_value: string
  low_stock_count: number
  low_stock_items: Array<{
    id: number; sku: string; name: string
    on_hand: number; reorder_point: number
  }>
  locations: number
  active_projects: number
  invoice_count: number
  revenue_30d: string
  base_currency: string
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type ActivityAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'IMPORT' | 'EXPORT'

export interface ActivityLogEntry {
  id: number
  user: number | null
  user_name: string | null
  action: ActivityAction
  action_display: string
  model_name: string
  object_id: string
  object_repr: string
  /** {field: [old, new]} -- empty for CREATE/DELETE/LOGIN. */
  changes: Record<string, [unknown, unknown]>
  timestamp: string
}
