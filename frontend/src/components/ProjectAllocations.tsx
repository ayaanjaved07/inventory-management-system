import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import type {
  Allocation, AllocationStatus, Availability, Item, Location, Paginated,
} from '@/lib/types'
import { Badge, Button, EmptyState, ErrorNote, Field, Input, Select, Spinner } from '@/components/ui'

const TONE: Record<AllocationStatus, 'slate' | 'green' | 'amber' | 'red' | 'teal'> = {
  RESERVED: 'amber',
  PARTIAL: 'teal',
  ISSUED: 'green',
  RETURNED: 'slate',
  CANCELLED: 'red',
}

/** Allocations for one project, plus the allocate / issue / return controls. */
export function ProjectAllocations({
  projectId,
  canEdit,
}: {
  projectId: number
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const allocations = useQuery({
    queryKey: ['allocations', projectId],
    queryFn: async () =>
      (await api.get<Paginated<Allocation>>('/allocations/', {
        params: { project: projectId },
      })).data,
  })

  const items = useQuery({
    queryKey: ['items', 'all'],
    queryFn: async () =>
      (await api.get<Paginated<Item>>('/items/', { params: { page_size: 200 } })).data,
  })

  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<Paginated<Location>>('/locations/')).data,
  })

  // What may actually be promised. Never on_hand -- that includes units already
  // reserved for someone else.
  const availability = useQuery({
    queryKey: ['availability', itemId, locationId],
    enabled: Boolean(itemId),
    queryFn: async () =>
      (await api.get<Availability>('/allocations/availability/', {
        params: { item: itemId, location: locationId || undefined },
      })).data,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['allocations'] })
    queryClient.invalidateQueries({ queryKey: ['availability'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    // Issuing and returning write to the ledger, so stock views are stale.
    queryClient.invalidateQueries({ queryKey: ['items'] })
    queryClient.invalidateQueries({ queryKey: ['movements'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<Allocation>('/allocations/', {
        project: projectId,
        item: Number(itemId),
        location: Number(locationId),
        quantity: Number(quantity),
        note,
      })).data,
    onSuccess: () => {
      invalidate()
      setShowForm(false)
      setItemId('')
      setQuantity('1')
      setNote('')
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const act = useMutation({
    mutationFn: async ({
      id, verb, qty,
    }: { id: number; verb: 'issue' | 'return' | 'cancel'; qty?: number }) =>
      (await api.post(
        `/allocations/${id}/${verb}/`,
        verb === 'cancel' ? {} : { quantity: qty },
      )).data,
    onSuccess: () => {
      invalidate()
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const rows = allocations.data?.results ?? []

  return (
    <div className="space-y-3">
      {error && <ErrorNote message={error} />}

      {canEdit && (
        <div>
          <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('projects.allocate')}
          </Button>
        </div>
      )}

      {showForm && canEdit && (
        <form
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('projects.item')}>
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">—</option>
                {items.data?.results.map((i) => (
                  <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('projects.location')}>
              <Select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required
              >
                <option value="">—</option>
                {locations.data?.results.map((l) => (
                  <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
                ))}
              </Select>
            </Field>
            <Field
              label={t('projects.quantity')}
              hint={
                availability.data
                  ? t('projects.availableHint', {
                      available: availability.data.available,
                      onHand: availability.data.on_hand,
                      reserved: availability.data.reserved,
                    })
                  : undefined
              }
            >
              <Input
                type="number"
                min="1"
                max={availability.data?.available || undefined}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </Field>
            <Field label={t('projects.note')}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={create.isPending}>
              {create.isPending ? t('common.loading') : t('common.save')}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}

      {allocations.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('projects.noAllocations')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="ledger-head bg-slate-50 text-left">
              <tr className="text-xs font-semibold text-slate-600">
                <th className="px-4 py-2.5">{t('projects.item')}</th>
                <th className="px-4 py-2.5">{t('projects.location')}</th>
                <th className="px-4 py-2.5 text-right">{t('projects.allocated')}</th>
                <th className="px-4 py-2.5 text-right">{t('projects.issued')}</th>
                <th className="px-4 py-2.5 text-right">{t('projects.returned')}</th>
                <th className="px-4 py-2.5">{t('projects.status')}</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{a.item_name}</div>
                    <div className="font-mono text-xs text-slate-500">{a.item_sku}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                    {a.location_code}
                  </td>
                  <td className="px-4 py-2.5 text-right">{a.quantity_allocated}</td>
                  <td className="px-4 py-2.5 text-right">{a.quantity_issued}</td>
                  <td className="px-4 py-2.5 text-right">{a.quantity_returned}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TONE[a.status]}>{a.status_display}</Badge>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {a.outstanding_reservation > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() =>
                              act.mutate({
                                id: a.id,
                                verb: 'issue',
                                qty: a.outstanding_reservation,
                              })
                            }
                          >
                            {t('projects.issue')}
                          </Button>
                        )}
                        {a.quantity_outstanding > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() =>
                              act.mutate({
                                id: a.id,
                                verb: 'return',
                                qty: a.quantity_outstanding,
                              })
                            }
                          >
                            {t('projects.return')}
                          </Button>
                        )}
                        {/* Cancel only frees an untouched reservation; the API
                            refuses it once anything has been issued. */}
                        {a.quantity_issued === 0 && a.status !== 'CANCELLED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ id: a.id, verb: 'cancel' })}
                          >
                            {t('projects.cancel')}
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
