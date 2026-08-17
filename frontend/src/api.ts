const BASE = '/api/v1'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail || body.error || detail
    } catch {
      /* keep statusText */
    }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export const api = {
  login: (username: string, password: string) =>
    request<{ success: boolean; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  profile: () => request<{ success: boolean; user: User }>('/auth/profile'),
  changePassword: (old_password: string, new_password: string) =>
    request<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    }),

  dashboardStats: (params = '') => request<DashboardResponse>(`/dashboard/stats${params}`),

  listHosts: (params = '') => request<{ success: boolean; hosts: Host[] }>(`/hosts${params}`),
  hostStats: () => request<{ success: boolean; total: number; blocked: number; completed: number; in_progress: number }>('/hosts/stats'),
  getHost: (id: number) => request<{ success: boolean; host: Host }>(`/hosts/${id}`),
  createHost: (body: Record<string, unknown>) =>
    request<{ success: boolean; host: Host }>('/hosts', { method: 'POST', body: JSON.stringify(body) }),
  updateHost: (id: number, body: Record<string, unknown>) =>
    request<{ success: boolean; host: Host }>(`/hosts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteHost: (id: number) => request<{ success: boolean }>(`/hosts/${id}`, { method: 'DELETE' }),
  hostPackages: (id: number, search = '') =>
    request<{ success: boolean; packages: HostPackage[]; count: number }>(`/hosts/${id}/packages${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  listGroups: () => request<{ success: boolean; groups: HostGroup[] }>('/host-groups'),
  createGroup: (body: Record<string, unknown>) =>
    request<{ success: boolean; group: HostGroup }>('/host-groups', { method: 'POST', body: JSON.stringify(body) }),
  updateGroup: (id: number, body: Record<string, unknown>) =>
    request<{ success: boolean; group: HostGroup }>(`/host-groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteGroup: (id: number) => request<{ success: boolean }>(`/host-groups/${id}`, { method: 'DELETE' }),

  listUsers: () => request<{ success: boolean; users: User[] }>('/users'),
  createUser: (body: Record<string, unknown>) =>
    request<{ success: boolean; user: User }>('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: number, body: Record<string, unknown>) =>
    request<{ success: boolean; user: User }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUser: (id: number) => request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),

  awxHealth: () => request<{ success: boolean; version?: string; instances?: number; ha_capacity?: number; error?: string }>('/patching/health'),
  awxTemplates: () => request<{ success: boolean; templates?: AwxTemplate[]; error?: string }>('/patching/templates'),
  awxJobs: () => request<{ success: boolean; jobs?: AwxJob[]; error?: string }>('/patching/jobs'),
  triggerRun: (body: { template_id: number; host_ids?: number[]; extra_vars?: string }) =>
    request<{ success: boolean; run: PatchRun; awx?: { job_id?: number }; error?: string }>('/patching/trigger', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listRuns: () => request<{ success: boolean; runs: PatchRun[] }>('/patching/runs'),
  getRun: (id: number) => request<{ success: boolean; run: PatchRun }>(`/patching/runs/${id}`),
  refreshRun: (id: number) => request<{ success: boolean; run: PatchRun }>(`/patching/runs/${id}/refresh`, { method: 'POST' }),

  listPackages: (params = '') => request<{ success: boolean; packages: PackageAggregate[]; total: number; categories: { name: string }[] }>(`/packages${params}`),
  packageCategories: () => request<{ success: boolean; categories: string[] }>('/packages/categories'),

  listPolicies: () => request<{ success: boolean; policies: PatchPolicy[] }>('/patching/policies'),
  getPolicy: (id: number) => request<{ success: boolean; policy: PatchPolicy }>(`/patching/policies/${id}`),
  createPolicy: (body: Record<string, unknown>) =>
    request<{ success: boolean; policy: PatchPolicy }>('/patching/policies', { method: 'POST', body: JSON.stringify(body) }),
  updatePolicy: (id: number, body: Record<string, unknown>) =>
    request<{ success: boolean; policy: PatchPolicy }>(`/patching/policies/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePolicy: (id: number) => request<{ success: boolean }>(`/patching/policies/${id}`, { method: 'DELETE' }),
  addPolicyAssignment: (id: number, body: { target_type: string; target_id: number }) =>
    request<{ success: boolean }>(`/patching/policies/${id}/assignments`, { method: 'POST', body: JSON.stringify(body) }),
  removePolicyAssignment: (id: number, assignmentId: number) =>
    request<{ success: boolean }>(`/patching/policies/${id}/assignments/${assignmentId}`, { method: 'DELETE' }),
  addPolicyExclusion: (id: number, hostId: number) =>
    request<{ success: boolean }>(`/patching/policies/${id}/exclusions?host_id=${hostId}`, { method: 'POST' }),
  removePolicyExclusion: (id: number, exclusionId: number) =>
    request<{ success: boolean }>(`/patching/policies/${id}/exclusions/${exclusionId}`, { method: 'DELETE' }),

  listOptions: () => request<{ success: boolean; options: ExecutionOption[] }>('/patching/options'),
  createOption: (body: Record<string, unknown>) =>
    request<{ success: boolean; option: ExecutionOption }>('/patching/options', { method: 'POST', body: JSON.stringify(body) }),
  updateOption: (id: number, body: Record<string, unknown>) =>
    request<{ success: boolean; option: ExecutionOption }>(`/patching/options/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteOption: (id: number) => request<{ success: boolean }>(`/patching/options/${id}`, { method: 'DELETE' }),
  activateOption: (id: number) =>
    request<{ success: boolean; option: ExecutionOption }>(`/patching/options/${id}/activate`, { method: 'POST' }),
  testOption: (id: number) =>
    request<{ success: boolean; version?: string; auth_mode?: string; error?: string }>(`/patching/options/${id}/test`, { method: 'POST' }),

  patchTree: () => request<{ success: boolean; tree: PatchTreeNode[] }>('/patching/tree'),
  listButtons: () => request<{ success: boolean; buttons: ButtonBinding[] }>('/patching/buttons'),
  bindButton: (key: string, body: Record<string, unknown>) =>
    request<{ success: boolean; button: ButtonBinding }>(`/patching/buttons/${key}`, { method: 'PUT', body: JSON.stringify(body) }),
  unbindButton: (key: string) => request<{ success: boolean }>(`/patching/buttons/${key}`, { method: 'DELETE' }),
  triggerButton: (key: string, hostIds: number[]) =>
    request<{ success: boolean; run: PatchRun; awx?: { job_id?: number }; error?: string }>(`/patching/buttons/${key}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ host_ids: hostIds }),
    }),

  listSources: () => request<{ success: boolean; sources: InventorySource[] }>('/inventory-sources'),
  createSource: (body: Record<string, unknown>) =>
    request<{ success: boolean; source: InventorySource }>('/inventory-sources', { method: 'POST', body: JSON.stringify(body) }),
  updateSource: (id: number, body: Record<string, unknown>) =>
    request<{ success: boolean; source: InventorySource }>(`/inventory-sources/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSource: (id: number) => request<{ success: boolean }>(`/inventory-sources/${id}`, { method: 'DELETE' }),
  syncSource: (id: number) =>
    request<{ success: boolean; summary?: { added_groups: number; added_hosts: number; updated_hosts: number; removed_hosts: number; files: number }; error?: string }>(`/inventory-sources/${id}/sync`, { method: 'POST' }),

  listEnvironments: () => request<{ success: boolean; environments: ExecutionEnvironment[] }>('/execution-environment'),
  createEnvironment: (body: Record<string, unknown>) =>
    request<{ success: boolean; environment: ExecutionEnvironment }>('/execution-environment', { method: 'POST', body: JSON.stringify(body) }),
  updateEnvironment: (id: number, body: Record<string, unknown>) =>
    request<{ success: boolean; environment: ExecutionEnvironment }>(`/execution-environment/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEnvironment: (id: number) => request<{ success: boolean }>(`/execution-environment/${id}`, { method: 'DELETE' }),
}

import type { DashboardResponse, Host, HostGroup, PatchRun, User, AwxTemplate, AwxJob, HostPackage, PackageAggregate, PatchPolicy, ExecutionOption, PatchTreeNode, ButtonBinding, InventorySource, ExecutionEnvironment } from './types'
