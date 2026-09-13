import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, apiError } from '@/lib/api'
import type { Category, Item, Paginated } from '@/lib/types'
import { Button, Card, ErrorNote, Field, Input, Select } from '@/components/ui'

interface ItemForm {
  sku: string
  name: string
  category: string
  unit: string
  unit_cost: string
  reorder_point: string
}

const EMPTY_FORM: ItemForm = {
  sku: '', name: '', category: '',
  unit: 'pc', unit_cost: '0', reorder_point: '0',
}

/* The "New item" form on the Items page. */
export function NewItemForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [error, setError] = useState('')

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Paginated<Category>>('/categories/')).data,
  })

  const createItem = useMutation({
    mutationFn: async (payload: ItemForm) =>
      (await api.post<Item>('/items/', {
        ...payload,
        category: payload.category || null,
        unit_cost: payload.unit_cost || '0',
        reorder_point: Number(payload.reorder_point) || 0,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSaved()
    },
    onError: (err) => setError(apiError(err)),
  })

  return (
    <Card className="p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          createItem.mutate(form)
        }}
      >
        {error && <ErrorNote message={error} />}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="SKU">
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              required
            />
          </Field>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Category">
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">—</option>
              {categories.data?.results.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Unit">
            <Select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              <option value="pc">Piece</option>
              <option value="box">Box</option>
              <option value="kg">Kilogram</option>
              <option value="l">Litre</option>
              <option value="m">Metre</option>
              <option value="set">Set</option>
            </Select>
          </Field>
          <Field label="Unit cost">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.unit_cost}
              onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
            />
          </Field>
          <Field
            label="Reorder point"
            hint="The item shows as low stock at or below this number."
          >
            <Input
              type="number"
              min="0"
              value={form.reorder_point}
              onChange={(e) => setForm({ ...form, reorder_point: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={createItem.isPending}>
            {createItem.isPending ? 'Loading...' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
