// Previous / next buttons under a list. The backend sends 25 rows per page.
const PAGE_SIZE = 25

export function Pagination({
  page,
  total,
  onChange,
}: {
  page: number
  total: number
  onChange: (page: number) => void
}) {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (lastPage <= 1) return null

  return (
    <div className="row" style={{ marginTop: 12 }}>
      <button className="secondary small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} of {lastPage}
      </span>
      <button className="secondary small" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  )
}
