export interface User {
  id: number
  username: string
  email: string | null
  is_admin: number
  is_active: number
  created_at: string
  last_login: string | null
}

export interface HostGroup {
  id: number
  name: string
  description: string | null
}

export interface Host {
  id: number
  hostname: string
  ip_address: string | null
  os_make: string | null
  os_version: string | null
  latest_patch: string | null
  uptime: string | null
  state: string | null
  action: string | null
  remarks: string | null
  friendly_name: string | null
  group_id: number | null
  group: { id: number; name: string } | null
  created_at: string
  updated_at: string
}

export interface PatchRun {
  id: number
  run_id: string
  template_id: number | null
  template_name: string | null
  status: string
  type: string
  extra_vars: string | null
  host_count: number
  created_by: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface HostPackage {
  id: number
  host_id: number
  name: string
  version: string | null
  release: string | null
  arch: string | null
  epoch: string | null
  source: string | null
  installed_at: string | null
  created_at: string
}

export interface AwxTemplate {
  id: number
  name: string
  playbook: string
  status: string
  job_type: string
}

export interface AwxJob {
  id: number
  name: string
  status: string
  job_template: number | null
  type: string | null
  started: string | null
  finished: string | null
}

export interface DashboardStats {
  total_hosts: number
  total_groups: number
  total_users: number
  total_runs: number
}
