import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Host } from '../../types'
import { getMockApi, renderApp, resetMockApi } from '../../test/helpers'

const mockApi = getMockApi()

const host: Host = {
  id: 1, hostname: 'srv-prod-01', ip_address: '10.0.0.10', os_make: 'Ubuntu', os_version: '24.04',
  latest_patch: null, uptime: null, state: null, action: null, remarks: null, friendly_name: null,
  group_id: null, group: null, created_at: '', updated_at: '', last_seen: null,
}

describe('Hosts page', () => {
  beforeEach(() => {
    resetMockApi()
    mockApi.listHosts.mockResolvedValue({ success: true, hosts: [host] })
    mockApi.listGroups.mockResolvedValue({ success: true, groups: [] })
  })

  it('lists hosts and omits dead toolbar buttons', async () => {
    renderApp('/hosts')

    await screen.findByText('srv-prod-01')
    expect(screen.queryByText('Columns')).not.toBeInTheDocument()
    expect(screen.queryByText('Filters')).not.toBeInTheDocument()
    expect(screen.queryByText('Hide Stale')).not.toBeInTheDocument()
  })

  it('adds a host through the modal', async () => {
    mockApi.createHost.mockResolvedValue({ success: true, host })
    renderApp('/hosts')
    await screen.findByText('srv-prod-01')

    const openBtn = screen.getAllByRole('button', { name: /Add Host/ }).find((b) => b.closest('.page-header'))
    await userEvent.click(openBtn!)
    const modal = await screen.findByRole('heading', { name: 'Add New Host' })
    const dialog = modal.closest('.modal') as HTMLElement
    const inputs = within(dialog).getAllByRole('textbox') as HTMLInputElement[]
    const hostnameInput = inputs.find((i) => i.placeholder.includes('srv-prod'))
    expect(hostnameInput).toBeTruthy()
    await userEvent.clear(hostnameInput!)
    await userEvent.type(hostnameInput!, 'srv-new-01')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add Host' }))
    await waitFor(() => expect(mockApi.createHost).toHaveBeenCalled())
    const body = mockApi.createHost.mock.calls[0][0]
    expect((body as { hostname: string }).hostname).toBe('srv-new-01')
  })

  it('deletes a host after confirmation', async () => {
    mockApi.deleteHost.mockResolvedValue({ success: true })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp('/hosts')
    await screen.findByText('srv-prod-01')

    await userEvent.click(screen.getByTitle('Delete Host'))
    await waitFor(() => expect(mockApi.deleteHost).toHaveBeenCalledWith(1))
    confirmSpy.mockRestore()
  })
})