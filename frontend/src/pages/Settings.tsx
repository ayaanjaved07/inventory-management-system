import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Paginated, Role, User } from '@/lib/types'
import {
  Badge, Button, Card, CardHeader, ErrorNote, Field, Input, Select, Spinner,
} from '@/components/ui'

const ROLES: Role[] = ['Admin', 'Manager', 'Storekeeper', 'Viewer']

const ROLE_TONE: Record<Role, 'red' | 'indigo' | 'green' | 'slate'> = {
  Admin: 'red',
  Manager: 'indigo',
  Storekeeper: 'green',
  Viewer: 'slate',
}

/** What each role may write. Mirrors accounts/permissions.py WRITE_ROLES. */
const CAPABILITIES: Array<{ area: string; roles: Role[] }> = [
  { area: 'Items & categories', roles: ['Admin', 'Manager'] },
  { area: 'Stock movements', roles: ['Admin', 'Manager', 'Storekeeper'] },
  { area: 'Projects & allocations', roles: ['Admin', 'Manager'] },
  { area: 'Sales', roles: ['Admin', 'Manager'] },
  { area: 'Users & roles', roles: ['Admin'] },
]

interface NewUser {
  username: string
  email: string
  first_name: string
  password: string
  role: Role
}

const EMPTY: NewUser = {
  username: '', email: '', first_name: '', password: '', role: 'Viewer',
}

export default function Settings() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewUser>(EMPTY)
  const [error, setError] = useState('')

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<Paginated<User>>('/auth/users/')).data,
  })

  const createUser = useMutation({
    mutationFn: async (payload: NewUser) =>
      (await api.post<User>('/auth/users/', {
        username: payload.username,
        email: payload.email,
        first_name: payload.first_name,
        password: payload.password,
        roles: [payload.role],
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      setShowForm(false)
      setForm(EMPTY)
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: Role }) =>
      (await api.patch<User>(`/auth/users/${id}/`, { roles: [role] })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
    onError: (err) => setError(apiError(err)),
  })

  const rows = users.data?.results ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          New user
        </Button>
      </div>

      {error && <ErrorNote message={error} />}

      {showForm && (
        <Card className="p-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              createUser.mutate(form)
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Username">
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </Field>
              <Field label="Full name">
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Password" hint="At least 8 characters.">
                <Input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </Field>
              <Field label="Role">
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Loading...' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title="Users" />
        {users.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="ledger-head bg-slate-50 text-left">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3">Username</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">
                          {u.username}
                          {isSelf && (
                            <span className="ml-2 text-xs text-slate-400">
                              (you)
                            </span>
                          )}
                        </div>
                        {u.first_name && (
                          <div className="text-xs text-slate-500">
                            {u.first_name} {u.last_name}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{u.email || '—'}</td>
                      <td className="px-5 py-3">
                        {isSelf ? (
                          // You can't edit your own roles, so an admin can't
                          // accidentally remove their own admin access.
                          <div className="flex items-center gap-2">
                            {u.roles.map((r) => (
                              <Badge key={r} tone={ROLE_TONE[r] ?? 'slate'}>{r}</Badge>
                            ))}
                          </div>
                        ) : (
                          <Select
                            className="h-8 w-40 text-xs"
                            value={u.roles[0] ?? ''}
                            disabled={changeRole.isPending}
                            onChange={(e) =>
                              changeRole.mutate({ id: u.id, role: e.target.value as Role })
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </Select>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={u.is_active ? 'green' : 'slate'}>
                          {u.is_active ? 'Yes' : 'No'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              What each role can change
            </span>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="ledger-head bg-slate-50 text-left">
              <tr className="text-xs font-semibold text-slate-600">
                <th className="px-5 py-3">Area</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-5 py-3 text-center">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CAPABILITIES.map(({ area, roles }) => (
                <tr key={area}>
                  <td className="px-5 py-3 text-slate-700">{area}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-5 py-3 text-center">
                      {roles.includes(r) ? (
                        <span className="text-indigo-700">&#10003;</span>
                      ) : (
                        <span className="text-slate-300">&ndash;</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
