/* Previous / next buttons for a list. The backend sends 25 rows per page. */
export function Pagination({
  page,
  total,
  onChange,
  pageSize = 25,
}: {
  page: number
  total: number
  onChange: (page: number) => void
  pageSize?: number
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  if (lastPage <= 1) return null

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
      <span className="text-slate-500">
        Page {page} of {lastPage}
      </span>
      <div className="flex gap-2">
        <button
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous"
        >
          &larr;
        </button>
        <button
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
          aria-label="Next"
        >
          &rarr;
        </button>
      </div>
    </div>
  )
}
