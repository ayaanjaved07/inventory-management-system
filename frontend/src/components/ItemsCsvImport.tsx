import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api, apiError } from '@/lib/api'
import type { ImportReport } from '@/lib/types'
import { Badge, Button, Card, ErrorNote } from '@/components/ui'

/* The "Import CSV" panel on the Items page.
   It sends the file twice: first as a check (nothing is saved), then again
   with commit=true once the user clicks Apply. */
export function ItemsCsvImport() {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState('')

  const runImport = useMutation({
    mutationFn: async ({ selected, commit }: { selected: File; commit: boolean }) => {
      const body = new FormData()
      body.append('file', selected)
      // Content-Type is left unset on purpose: axios omits it for FormData so
      // the browser can generate the multipart boundary.
      const { data } = await api.post<ImportReport>('/items/import/', body, {
        params: { commit: commit ? 'true' : 'false' },
      })
      return data
    },
    onSuccess: (data) => {
      setReport(data)
      setError('')
      if (data.committed) {
        queryClient.invalidateQueries({ queryKey: ['items'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        setFile(null)
      }
    },
    onError: (err) => {
      setError(apiError(err))
      setReport(null)
    },
  })

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">Import items from CSV</h2>
      <p className="mt-1 text-xs text-slate-500">Columns: sku, name, description, category_name, unit, unit_cost, currency_code, reorder_point, is_active. Stock cannot be set by import.</p>

      {error && <div className="mt-4"><ErrorNote message={error} /></div>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose a CSV file"
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setReport(null)
          }}
        />
        <Button
          variant="secondary"
          disabled={!file || runImport.isPending}
          onClick={() => file && runImport.mutate({ selected: file, commit: false })}
        >
          Check file
        </Button>
      </div>

      {report && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="slate">{report.created} to create</Badge>
            <Badge tone="slate">{report.updated} to update</Badge>
            {report.errors.length === 0 && (
              <Badge tone="indigo">No problems found.</Badge>
            )}
          </div>

          {report.errors.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="ledger-head bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Row</th>
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.errors.map((row) => (
                    <tr key={`${row.row}-${row.sku}`}>
                      <td className="px-4 py-2 text-slate-500">{row.row}</td>
                      <td className="px-4 py-2 font-mono text-xs">{row.sku || '—'}</td>
                      <td className="px-4 py-2 text-red-700">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.committed ? (
            <p className="text-sm text-indigo-700">
              Import applied: {report.created} created, {report.updated} updated.
            </p>
          ) : (
            <Button
              disabled={!file || report.errors.length > 0 || runImport.isPending}
              onClick={() => file && runImport.mutate({ selected: file, commit: true })}
            >
              Apply {report.created + report.updated} change(s)
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
