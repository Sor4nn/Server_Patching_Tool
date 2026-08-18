import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { InventorySource } from '../../types'
import { getMockApi, renderApp, resetMockApi } from '../../test/helpers'

const mockApi = getMockApi()

const source: InventorySource = {
  id: 1, name: 'zeroops', description: null, repo_url: 'file:///data/repos-test', branch: 'main',
  auth_type: 'none', username: null, password: null, token: null,
  file_pattern: '**/*', playbook_pattern: 'ansible_scripts/*.yml', prune_missing: 0, enabled: 1,
  last_sync_at: null, last_sync_status: null, last_error: null, created_at: '', updated_at: '',
  host_count: 3, template_count: 2,
}

describe('Repositories & host groups page', () => {
  beforeEach(() => {
    resetMockApi()
    mockApi.listGroups.mockResolvedValue({ success: true, groups: [{ id: 1, name: 'Production', description: null }] })
    mockApi.listSources.mockResolvedValue({ success: true, sources: [source] })
  })

  it('lists repositories with their playbook counts', async () => {
    renderApp('/host-groups')
    await screen.findByText('zeroops')
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('Production')).toBeTruthy()
  })

  it('navigates to the new repository form', async () => {
    renderApp('/host-groups')
    await userEvent.click(await screen.findByRole('button', { name: /New Repository/ }))
    await screen.findByText(/Git-backed inventory source/)
  })

  it('syncs a repository and re-reads the list', async () => {
    mockApi.syncSource.mockResolvedValue({
      success: true,
      summary: { added_hosts: 1, added_groups: 0, updated_hosts: 0, removed_hosts: 0, files: 2, discovered_templates: 1 },
    })
    renderApp('/host-groups')
    await screen.findByText('zeroops')

    await userEvent.click(screen.getByTitle('Sync now'))
    await waitFor(() => expect(mockApi.syncSource).toHaveBeenCalledWith(1))
    await waitFor(() => expect(mockApi.listSources).toHaveBeenCalled())
  })

  it('reloads after creating a host group', async () => {
    mockApi.createGroup.mockResolvedValue({ success: true, group: { id: 2, name: 'Staging', description: null } })
    renderApp('/host-groups')
    await screen.findByText('zeroops')

    await userEvent.click(screen.getByRole('button', { name: /New Group/ }))
    await userEvent.type(screen.getByPlaceholderText('e.g. Production Webservers'), 'Staging')
    await userEvent.click(screen.getByRole('button', { name: 'Create Group' }))
    await waitFor(() => expect(mockApi.createGroup).toHaveBeenCalledWith({ name: 'Staging', description: null }))
    await waitFor(() => expect(mockApi.listGroups).toHaveBeenCalled())
  })
})