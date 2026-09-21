import { Fragment, useState } from 'react'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { formatDate } from '../lib/utils'
import type { Paginated, Project } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { NewProjectForm } from '../components/NewProjectForm'
import { ProjectAllocations } from '../components/ProjectAllocations'

export default function Projects() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  // The project whose allocations are open. Only one at a time.
  const [openId, setOpenId] = useState<number | null>(null)

  const filters = new URLSearchParams()
  if (search) filters.set('search', search)
  const projects = useApi<Paginated<Project>>(`/projects/?${filters}&page=${page}`)

  return (
    <>
      <div className="page-header">
        <h1>Projects</h1>
        {canEdit && <button onClick={() => setShowForm(!showForm)}>New project</button>}
      </div>

      {showForm && canEdit && (
        <NewProjectForm
          onSaved={() => {
            setShowForm(false)
            projects.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card">
        <input
          style={{ maxWidth: 320, marginTop: 0, marginBottom: 12 }}
          placeholder="Search projects..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />

        {projects.error && <p className="error">{projects.error}</p>}
        {!projects.data && projects.loading && <p>Loading...</p>}
        {projects.data && projects.data.results.length === 0 && (
          <p className="muted">No projects yet.</p>
        )}
        {projects.data && projects.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Start date</th>
                  <th className="num">Allocations</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.data.results.map((project) => (
                  // A Fragment lets one project add two table rows.
                  <Fragment key={project.id}>
                    <tr>
                      <td className="mono">{project.code}</td>
                      <td>{project.name}</td>
                      <td>
                        <span className="badge">{project.status_display}</span>
                      </td>
                      <td>{project.start_date ? formatDate(project.start_date) : '-'}</td>
                      <td className="num">{project.allocation_count}</td>
                      <td>
                        <button
                          className="secondary small"
                          onClick={() => setOpenId(openId === project.id ? null : project.id)}
                        >
                          {openId === project.id ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                    {openId === project.id && (
                      <tr className="details">
                        <td colSpan={6}>
                          <ProjectAllocations
                            projectId={project.id}
                            canEdit={canEdit}
                            onChange={projects.reload}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={projects.data ? projects.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}
