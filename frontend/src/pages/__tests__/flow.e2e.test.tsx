import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Host } from '../../types'
import { adminUser, getMockApi, renderApp, resetMockApi } from '../../test/helpers'

const mockApi = getMockApi()

const host: Host = {
  id: 7, hostname: 'srv-prod-01', ip_address: '10.0.0.10', os_make: 'Ubuntu', os_version: '24.04',
  latest_patch: null, uptime: null, state: null, action: null, remarks: null, friendly_name: null,
  group_id: null, group: null, created_at: '', updated_at: '', last_seen: null,
}

const stats = (overrides = {}) => ({
  success: true,
  stats: {
    total_hosts: 1, total_groups: 3, total_users: 1, total_runs: 0,
    up_to_date: 0, needs_updates: 0, not_reporting: 1,
    outdated_packages: 0, security_updates: 0, needs_reboot: 0,
    ...overrides,
  },
  systems: [], recent_runs: [], total_systems: 1, limit: 10, offset: 0, status: null,
})

describe('End-to-end UI flow', () => {
  beforeEach(() => {
    resetMockApi()
    mockApi.login.mockResolvedValue({ success: true, user: adminUser })
    mockApi.dashboardStats.mockResolvedValue(stats())
    mockApi.listHosts.mockResolvedValue({ success: true, hosts: [host] })
    mockApi.listGroups.mockResolvedValue({ success: true, groups: [] })
    mockApi.listSources.mockResolvedValue({ success: true, sources: [] })
    mockApi.createHost.mockResolvedValue({ success: true, host })
    mockApi.createSource.mockResolvedValue({ success: true, source: {} as never })
  })

  it('login -> hosts -> add host -> repositories -> add repository', async () => {
    renderApp('/login', null)
    await screen.findByText('Sign in to PatchMon')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText(/Welcome back, sor4n/)

    // Navigate to Hosts, add a host
    await userEvent.click(screen.getByRole('link', { name: /Hosts/ }))
    await screen.findByText('srv-prod-01')
    const openBtn = screen.getAllByRole('button', { name: /Add Host/ }).find((b) => b.closest('.page-header'))
    await userEvent.click(openBtn!)
    const modal = await screen.findByRole('heading', { name: 'Add New Host' })
    const dialog = modal.closest('.modal') as HTMLElement
    const hostnameInput = [...dialog.querySelectorAll('input')].find((i) => i.placeholder.includes('srv-prod'))
    await userEvent.type(hostnameInput!, 'srv-e2e-01')
    await userEvent.click(dialog.querySelector('button[type="submit"]') as HTMLElement)
    await waitFor(() => expect(mockApi.createHost).toHaveBeenCalled())

    // Navigate to Repositories, create one
    await userEvent.click(screen.getByRole('link', { name: /Repos/ }))
    await screen.findByRole('heading', { level: 1, name: 'Repositories' })
    await userEvent.click(screen.getByRole('button', { name: /New Repository/ }))
    await screen.findByRole('heading', { name: 'New Repository' })

    await userEvent.type(screen.getByPlaceholderText('Atos_a685188_dzarembski'), 'e2e-repo')
    await userEvent.type(screen.getByPlaceholderText('git@github.com:org/repo.git or https://github.com/org/repo.git'), 'file:///data/repos-test')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockApi.createSource).toHaveBeenCalled())

    // Back on the repositories page
    await screen.findByText(/No repositories yet/)
  })
})