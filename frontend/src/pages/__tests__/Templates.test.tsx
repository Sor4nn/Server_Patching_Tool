import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Host, JobTemplate } from '../../types'
import { getMockApi, renderApp, resetMockApi } from '../../test/helpers'

const mockApi = getMockApi()

const tpl: JobTemplate = {
  id: 1, name: 'Collect packages', description: null,
  playbook: 'ansible_scripts/collect_packages.yml', repo_url: 'file:///data/repos-test',
  branch: 'main', inventory_source_id: 1, credential_id: null, execution_environment_id: null,
  enabled: 1, created_at: '', updated_at: '', credential: null, execution_environment: null,
}

const host: Host = {
  id: 7, hostname: 'srv-prod-01', ip_address: '10.0.0.10', os_make: 'Ubuntu', os_version: '24.04',
  latest_patch: null, uptime: null, state: null, action: null, remarks: null, friendly_name: null,
  group_id: null, group: null, created_at: '', updated_at: '', last_seen: null,
}

describe('Templates page', () => {
  beforeEach(() => {
    resetMockApi()
    mockApi.listTemplates.mockResolvedValue({ success: true, templates: [tpl] })
    mockApi.listHosts.mockResolvedValue({ success: true, hosts: [host] })
    mockApi.listButtons.mockResolvedValue({ success: true, buttons: [] })
    mockApi.listCredentials.mockResolvedValue({ success: true, credentials: [] })
    mockApi.listEnvironments.mockResolvedValue({ success: true, environments: [] })
  })

  it('lists playbook templates', async () => {
    renderApp('/templates')
    await screen.findByText('Collect packages')
    expect(screen.getByText('ansible_scripts/collect_packages.yml')).toBeInTheDocument()
  })

  it('creates a template from the modal', async () => {
    mockApi.createTemplate.mockResolvedValue({
      success: true,
      template: { ...tpl, id: 2, name: 'Ping test' },
    })
    renderApp('/templates')
    await userEvent.click(await screen.findByRole('button', { name: /New Template/ }))

    const heading = await screen.findByRole('heading', { name: 'New Template' })
    const dialog = heading.closest('.modal') as HTMLElement
    await userEvent.type(within(dialog).getByPlaceholderText('e.g. Collect package inventory'), 'Ping test')
    await userEvent.type(
      within(dialog).getByPlaceholderText('https://github.com/user/playbooks.git'),
      'file:///data/repos-test',
    )
    const playbookInput = within(dialog).getByDisplayValue('ansible_scripts/collect_packages.yml')
    await userEvent.clear(playbookInput)
    await userEvent.type(playbookInput, 'ansible_scripts/test_ping.yml')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create Template' }))
    await waitFor(() => expect(mockApi.createTemplate).toHaveBeenCalled())
    const body = mockApi.createTemplate.mock.calls[0][0] as Record<string, unknown>
    expect(body.name).toBe('Ping test')
    expect(body.playbook).toBe('ansible_scripts/test_ping.yml')
  })

  it('runs a template against selected hosts', async () => {
    mockApi.runTemplate.mockResolvedValue({ success: true, run: {} as never })
    renderApp('/templates')
    await screen.findByText('Collect packages')

    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    const heading = await screen.findByRole('heading', { name: /Run “Collect packages”/ })
    const dialog = heading.closest('.modal') as HTMLElement
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /srv-prod-01/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /Run on 1 host/ }))

    await waitFor(() => expect(mockApi.runTemplate).toHaveBeenCalledWith(1, { host_ids: [7], extra_vars: undefined }))
    await within(dialog).findByText('Run launched')
  })

  it('keeps the Run button disabled for disabled templates', async () => {
    mockApi.listTemplates.mockResolvedValue({
      success: true,
      templates: [{ ...tpl, enabled: 0 }],
    })
    renderApp('/templates')
    await screen.findByText('Collect packages')
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })
})