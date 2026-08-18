import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { adminUser, getMockApi, renderApp, resetMockApi, viewerUser } from '../../test/helpers'

const mockApi = getMockApi()

describe('Settings page', () => {
  beforeEach(() => {
    resetMockApi()
    mockApi.listUsers.mockResolvedValue({ success: true, users: [adminUser, viewerUser] })
    mockApi.listGroups.mockResolvedValue({ success: true, groups: [] })
  })

  it('renders the users table with roles and no fake placeholders', async () => {
    renderApp('/settings')
    await screen.findByText('Super Admin')
    expect(screen.getByText('Viewer')).toBeInTheDocument()
    expect(screen.queryByText('te4st@mail.com')).not.toBeInTheDocument()
  })

  it('switches to the host groups tab', async () => {
    renderApp('/settings')
    await screen.findByText('sor4n')

    await userEvent.click(screen.getByRole('button', { name: 'Host Groups' }))
    await screen.findByRole('heading', { name: 'Host Groups' })
  })

  it('shows an honest placeholder for unimplemented tabs', async () => {
    renderApp('/settings')
    await screen.findByText('sor4n')

    await userEvent.click(screen.getByRole('button', { name: 'OIDC / SSO' }))
    await screen.findByRole('heading', { name: 'OIDC / SSO' })
    expect(screen.getByText(/Not implemented yet/)).toBeInTheDocument()
    expect(screen.queryByText(/ready and active/)).not.toBeInTheDocument()
  })

  it('hides admin-only buttons for viewers', async () => {
    mockApi.listUsers.mockResolvedValue({ success: true, users: [viewerUser] })
    renderApp('/settings', viewerUser)
    await screen.findByText('viewer')
    expect(screen.queryByRole('button', { name: /Add User/ })).not.toBeInTheDocument()
  })
})