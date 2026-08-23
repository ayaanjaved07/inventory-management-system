import { useTranslation } from 'react-i18next'

/**
 * Page controls for a DRF-paginated list. Lifted out of Activity.tsx once a
 * second list needed the same thing.
 *
 * PAGE_SIZE is a global 25 on the backend, so `pageSize` defaults to it rather
 * than being passed at every call site.
 */
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
  const { t } = useTranslation()
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  if (lastPage <= 1) return null

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
      <span className="text-slate-500">
        {t('common.page')} {page} {t('common.of')} {lastPage}
      </span>
      <div className="flex gap-2">
        <button
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label={t('common.previous')}
        >
          &larr;
        </button>
        <button
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
          aria-label={t('common.next')}
        >
          &rarr;
        </button>
      </div>
    </div>
  )
}
