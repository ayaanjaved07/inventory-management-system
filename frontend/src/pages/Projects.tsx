import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { Paginated, Project, ProjectStatus } from '@/lib/types'
import {
  Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, Spinner,
} from '@/components/ui'
import { Pagination } from '@/components/Pagination'
import { ProjectAllocations } from '@/components/ProjectAllocations'

const STATUS_TONE: Record<ProjectStatus, 'slate' | 'green' | 'amber' | 'red' | 'teal'> = {
  PLANNING: 'slate',
  ACTIVE: 'green',
  ON_HOLD: 'amber',
  COMPLETED: 'teal',
  CANCELLED: 'red',
}

interface ProjectForm {
  code: string
  name: string
  description: string
  status: ProjectStatus
  start_date: string
  end_date: string
}

const EMPTY_FORM: ProjectForm = {
  code: '', name: '', description: '', status: 'PLANNING', start_date: '', end_date: '',
}

export default function Projects() {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const canEdit = hasRole('Admin', 'Manager')

  const projects = useQuery({
    queryKey: ['projects', search, page],
    queryFn: async () =>
      (await api.get<Paginated<Project>>('/projects/', {
        params: { search: search || undefined, page },
      })).data,
  })

  const createProject = useMutation({
    mutationFn: async (payload: ProjectForm) =>
      (await api.post<Project>('/projects/', {
        ...payload,
        // Django rejects '' for a nullable DateField; it wants null.
        start_date: payload.start_date || null,
        end_date: payload.end_date || null,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      setFormError('')
    },
    onError: (err) => setFormError(apiError(err)),
  })

  const rows = projects.data?.results ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t('projects.title')}</h1>
        </div>
        {canEdit && (
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('projects.new')}
          </Button>
        )}
      </div>

      {showForm && canEdit && (
        <Card className="p-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              createProject.mutate(form)
            }}
          >
            {formError && <ErrorNote message={formError} />}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('projects.code')}>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
              </Field>
              <Field label={t('projects.name')}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </Field>
              <Field label={t('projects.status')}>
                <Select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as ProjectStatus })
                  }
                >
                  <option value="PLANNING">Planning</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </Field>
              <Field label={t('projects.startDate')}>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </Field>
              <Field label={t('projects.endDate')}>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </Field>
              <Field label={t('projects.description')}>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? t('common.loading') : t('common.save')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder={t('projects.search')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </div>

        {projects.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : projects.isError ? (
          <div className="p-4">
            <ErrorNote message={t('common.error')} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('projects.empty')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((project) => (
              <li key={project.id}>
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
                  onClick={() => setOpenId(openId === project.id ? null : project.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-teal-700">
                        {project.code}
                      </span>
                      <Badge tone={STATUS_TONE[project.status]}>{project.status_display}</Badge>
                    </div>
                    <div className="mt-1 font-medium text-slate-900">{project.name}</div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    {project.start_date && <span>{formatDate(project.start_date)}</span>}
                    <span>
                      {project.allocation_count ?? 0} {t('projects.allocations').toLowerCase()}
                    </span>
                  </div>
                </button>

                {openId === project.id && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                    <ProjectAllocations projectId={project.id} canEdit={canEdit} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <Pagination page={page} total={projects.data?.count ?? 0} onChange={setPage} />
      </Card>
    </div>
  )
}
