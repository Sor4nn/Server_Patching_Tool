import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { adminUser, getMockApi, renderApp, resetMockApi } from '../../test/helpers'

const mockApi = getMockApi()

describe('Login flow', () => {
  beforeEach(() => resetMockApi())

  it('submits seeded credentials and lands on the dashboard', async () => {
    mockApi.login.mockResolvedValue({ success: true, user: adminUser })
    renderApp('/login', null)

    await screen.findByText('Sign in to PatchMon')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(mockApi.login).toHaveBeenCalledWith('test', 'Bogdan123!'))
    await screen.findByText(/Welcome back/)
  })

  it('shows the error message when login fails', async () => {
    mockApi.login.mockRejectedValue(new Error('Invalid username or password'))
    renderApp('/login', null)

    await screen.findByText('Sign in to PatchMon')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByText('Invalid username or password')
  })

  it('does not call login when the app already has a session', async () => {
    renderApp('/login', adminUser)
    await screen.findByText(/Welcome back/)
    expect(mockApi.login).not.toHaveBeenCalled()
  })
})