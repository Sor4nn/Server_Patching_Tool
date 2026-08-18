import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import App from '../App'
import type { User } from '../types'

export const adminUser: User = {
  id: 1, username: 'sor4n', email: 'admin@gpta.local', is_admin: 1, is_active: 1,
  created_at: '', last_login: null,
}

export const viewerUser: User = {
  id: 2, username: 'viewer', email: 'viewer@gpta.local', is_admin: 0, is_active: 1,
  created_at: '', last_login: null,
}

/** Auto-mocking api module: any accessed method becomes a vi.fn(). */
const { mockApi } = vi.hoisted(() => {
  const api = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => {
      if (!(key in target)) target[String(key)] = vi.fn()
      return target[String(key)]
    },
  })
  return { mockApi: api as Record<string, ReturnType<typeof vi.fn>> }
})

vi.mock('../api', () => ({ api: mockApi }))

/** Hoisted vars cannot be exported; access the mock api via this getter. */
export function getMockApi() {
  return mockApi
}

export function resetMockApi() {
  for (const fn of Object.values(mockApi)) fn.mockReset()
}

/**
 * Render the full app at a route with a given authenticated user (null => no
 * session, which sends the app to /login).
 */
export function renderApp(path: string, user: User | null = adminUser) {
  mockApi.dashboardStats.mockResolvedValue({
    success: true,
    stats: {
      total_hosts: 0, total_groups: 0, total_users: 1, total_runs: 0,
      up_to_date: 0, needs_updates: 0, not_reporting: 0,
      outdated_packages: 0, security_updates: 0, needs_reboot: 0,
    },
    systems: [], recent_runs: [], total_systems: 0, limit: 10, offset: 0, status: null,
  })
  if (user) {
    mockApi.profile.mockResolvedValue({ success: true, user })
  } else {
    mockApi.profile.mockRejectedValue(new Error('Not authenticated'))
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}
