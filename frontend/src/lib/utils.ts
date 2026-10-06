// Formatting helpers. 'en-IN' groups numbers the Indian way (1,00,000).

export function formatCurrency(amount: number | string, currency = 'INR') {
  const value = Number(amount)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value)
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// The date `days` days ago as 'YYYY-MM-DD', in the user's own time zone.
// That is the format <input type="date"> and the backend both use.
export function isoDateDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
