import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getMockApi, renderApp, resetMockApi } from '../../test/helpers'

const mockApi = getMockApi()

describe('Repository form', () => {
  beforeEach(() => {
    resetMockApi()
    mockApi.listGroups.mockResolvedValue({ success: true, groups: [] })
    mockApi.listSources.mockResolvedValue({ success: true, sources: [] })
  })

  it('requires a name and repository URL to save', async () => {
    mockApi.createSource.mockResolvedValue({ success: true, source: {} as never })
    renderApp('/repositories/new')
    await screen.findByRole('heading', { name: 'New Repository' })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Name and Repository URL are required')
    expect(mockApi.createSource).not.toHaveBeenCalled()
  })

  it('creates a repository and returns to the repos page', async () => {
    mockApi.createSource.mockResolvedValue({ success: true, source: {} as never })
    renderApp('/repositories/new')
    await screen.findByRole('heading', { name: 'New Repository' })

    await userEvent.type(screen.getByPlaceholderText('Atos_a685188_dzarembski'), 'test-repo')
    await userEvent.type(screen.getByPlaceholderText('git@github.com:org/repo.git or https://github.com/org/repo.git'), 'file:///data/repos-test')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockApi.createSource).toHaveBeenCalled())

    const body = mockApi.createSource.mock.calls[0][0] as Record<string, unknown>
    expect(body.name).toBe('test-repo')
    // returning to the repos page re-lists sources
    await waitFor(() => expect(mockApi.listSources).toHaveBeenCalled())
  })

  it('shows credential fields per auth type', async () => {
    renderApp('/repositories/new')
    await screen.findByRole('heading', { name: 'New Repository' })

    const auth = within(screen.getByText('Source Control Credential').closest('.form-row') as HTMLElement)
      .getByRole('combobox')
    await userEvent.selectOptions(auth, 'userpass')
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    await userEvent.selectOptions(auth, 'token')
    expect(screen.getByPlaceholderText('github_pat_...')).toBeInTheDocument()
  })
})