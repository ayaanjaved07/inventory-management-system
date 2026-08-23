import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import type { ActivityAction, ActivityLogEntry, Paginated } from '@/lib/types'
import {
  Badge, Card, EmptyState, ErrorNote, Input, Select, Spinner,
} from '@/components/ui'
import { Pagination } from '@/components/Pagination'

const ACTION_TONE: Record<ActivityAction, 'green' | 'teal' | 'red' | 'slate'> = {
  CREATE: 'green',
  UPDATE: 'teal',
  DELETE: 'red',
  LOGIN: 'slate',
  IMPORT: 'teal',
  EXPORT: 'slate',
}

const ACTIONS: ActivityAction[] = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'IMPORT', 'EXPORT']

/** Render one {field: [old, new]} pair readably. */
function ChangeLine({ field, from, to }: { field: string; from: unknown; to: unknown }) {
  const show = (v: unknown) =>
    v === null || v === '' ? '—' : typeof v === 'boolean' ? String(v) : String(v)
  return (
    <div className="flex flex-wrap items-baseline gap-1.5 text-xs">
      <span className="font-medium text-slate-600">{field}</span>
      <span className="text-slate-400 line-through">{show(from)}</span>
      <span className="text-slate-400">&rarr;</span>
      <span className="font-medium text-slate-800">{show(to)}</span>
    </div>
  )
}

export default function Activity() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)

  const activity = useQuery({
    queryKey: ['activity', search, action, page],
    queryFn: async () =>
      (await api.get<Paginated<ActivityLogEntry>>('/activity/', {
        params: {
          search: search || undefined,
          action: action || undefined,
          page,
        },
      })).data,
  })

  const rows = activity.data?.results ?? []
  const total = activity.data?.count ?? 0
  const locale = 'en-IN'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t('nav.activity')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('activity.subtitle')}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder={t('activity.search')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Select
            className="w-44"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('common.all')}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>

        {activity.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : activity.isError ? (
          <div className="p-4">
            <ErrorNote message={t('common.error')} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('activity.empty')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((entry) => {
              const changed = Object.entries(entry.changes ?? {})
              return (
                <li key={entry.id} className="flex gap-4 px-5 py-4">
                  <div className="w-20 shrink-0 pt-0.5">
                    <Badge tone={ACTION_TONE[entry.action] ?? 'slate'}>
                      {entry.action_display}
                    </Badge>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900">
                      <span className="font-medium">{entry.user_name ?? t('activity.system')}</span>
                      {' '}
                      <span className="text-slate-500">{entry.model_name}</span>
                      {entry.object_repr && (
                        <>
                          {' '}
                          <span className="font-medium">{entry.object_repr}</span>
                        </>
                      )}
                    </p>

                    {changed.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {changed.map(([field, pair]) => (
                          <ChangeLine key={field} field={field} from={pair?.[0]} to={pair?.[1]} />
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
                    {formatDateTime(entry.timestamp, locale)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <Pagination page={page} total={total} onChange={setPage} />
      </Card>
    </div>
  )
}
