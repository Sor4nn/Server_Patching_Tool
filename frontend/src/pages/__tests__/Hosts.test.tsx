import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { adminUser, getMockApi, renderApp, resetMockApi } from '../../test/helpers'

const mockApi = getMockApi()
const host = {
  id: 3, hostname: 'srv-prod', ip_address: '192.168.1.214', os_make: 'Red Hat Enterprise Linux',
  os_version: '9.8', latest_patch: null, uptime: null, state: null, action: null, remarks: null,
  friendly_name: '', group_id: 6, created_at: '', updated_at: '', last_seen: '2026-08-18T00:00:00Z',
  outdated_count: 0, security_count: 0,
  group: { id: 6, name: 'Development' },
}
const source = {
  id: 6, name: 'test', description: null, repo_url: 'https://github.com/Sor4nn/Server_Patching_Tool',
  branch: 'main', auth_type: 'none', username: null, password: null, token: null,
  file_pattern: '**/*', playbook_pattern: 'ansible_scripts/*.yml', prune_missing: 0, enabled: 1,
  last_sync_at: null, last_sync_status: null,
}

describe('Hosts re-import', () => {
  beforeEach(() => resetMockApi())

  it('syncs enabled inventory sources and shows the result', async () => {
    mockApi.listHosts.mockResolvedValue({ success: true, hosts: [host] })
    mockApi.listGroups.mockResolvedValue({ success: true, groups: [] })
    mockApi.listSources.mockResolvedValue({ success: true, sources: [source, { ...source, id: 7, enabled: 0 }] })
    mockApi.syncSource.mockResolvedValue({
      success: true,
      summary: { added_groups: 2, added_hosts: 2, updated_hosts: 1, removed_hosts: 0, files: 3 },
    })

    renderApp('/hosts', adminUser)

    await userEvent.click(await screen.findByRole('button', { name: /Re-Import/ }))

    expect(mockApi.syncSource).toHaveBeenCalledTimes(1)
    expect(mockApi.syncSource).toHaveBeenCalledWith(6)
    await screen.findByText(/Re-imported 1 source\(s\): \+2 hosts added, 1 updated/)
    expect(mockApi.listHosts).toHaveBeenCalled()
  })

  it('hides the button for non-admins', () => {
    mockApi.listHosts.mockResolvedValue({ success: true, hosts: [] })
    mockApi.listGroups.mockResolvedValue({ success: true, groups: [] })

    renderApp('/hosts', { ...adminUser, is_admin: 0 })

    expect(screen.queryByRole('button', { name: /Re-Import/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add Host/ })).toBeNull()
  })
})