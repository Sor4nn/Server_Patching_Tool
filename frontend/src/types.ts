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
  last_seen: string | null
  outdated_count?: number
  security_count?: number
}

export interface Credential {
  id: number
  name: string
  credential_type: 'ssh_key' | 'ssh_password'
  username: string | null
  password: string | null
  private_key: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface JobTemplate {
  id: number
  name: string
  description: string | null
  playbook: string
  repo_url: string
  branch: string
  credential_id: number | null
  execution_environment_id: number | null
  enabled: number
  created_at: string
  updated_at: string
  credential?: { name: string; credential_type: string; username: string | null } | null
  execution_environment?: { name: string; image: string } | null
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
  available_version: string | null
  needs_update: number | null
  is_security_update: number | null
  category: string | null
}

export interface PackageHost {
  hostId: number
  friendlyName: string
  osType: string | null
  currentVersion: string
  availableVersion: string | null
  needsUpdate: boolean
  isSecurityUpdate: boolean
}

export interface PackageAggregate {
  id: number
  name: string
  category: string | null
  latest_version: string | null
  packageHostsCount: number
  packageHosts: PackageHost[]
  stats: { totalInstalls: number; updatesNeeded: number; securityUpdates: number }
  sourceRepos: { repoId: number; repoName: string; repoUrl: string; repoType: string }[]
}

export interface PatchPolicy {
  id: number
  name: string
  description: string | null
  patch_delay_type: 'immediate' | 'delayed' | 'fixed_time'
  delay_minutes: number | null
  fixed_time_utc: string | null
  template_id: number | null
  enabled: number
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
  assignments: PolicyAssignment[]
  exclusions: PolicyExclusion[]
}

export interface PolicyAssignment {
  id: number
  policy_id: number
  target_type: 'host' | 'host_group'
  target_id: number
}

export interface PolicyExclusion {
  id: number
  policy_id: number
  host_id: number
}

export interface ExecutionOption {
  id: number
  name: string
  provider: string
  url: string
  auth_mode: 'basic' | 'token'
  username: string | null
  password: string | null
  token: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export interface TreePackage {
  name: string
  version: string | null
  release: string | null
  arch: string | null
  category: string | null
  available_version?: string | null
  is_security_update?: number | null
}

export interface PatchTreeNode {
  host: Host
  current: TreePackage[]
  new: TreePackage[]
}

export interface ButtonBinding {
  id: number
  button_key: string
  button_label: string | null
  template_id: number | null
  created_at: string
  updated_at: string
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
  up_to_date: number
  needs_updates: number
  not_reporting: number
  outdated_packages: number
  security_updates: number
  needs_reboot: number
}

export interface DashboardSystem {
  id: number
  hostname: string
  ip_address: string | null
  os_make: string | null
  os_version: string | null
  latest_patch: string | null
  state: string | null
  friendly_name: string | null
  group_id: number | null
  group_name: string | null
  updated_at: string
  last_seen: string | null
  outdated_count: number
  status: 'up_to_date' | 'needs_updates' | 'not_reporting'
}

export interface DashboardResponse {
  success: boolean
  stats: DashboardStats
  recent_runs: PatchRun[]
  systems: DashboardSystem[]
  total_systems: number
  limit: number
  offset: number
  status: string | null
}

export interface ExecutionEnvironment {
  id: number
  name: string
  image: string
  description: string | null
  is_default: number
  created_at: string
  updated_at: string
}

export interface InventorySource {
  id: number
  name: string
  repo_url: string
  branch: string
  auth_type: 'none' | 'token' | 'ssh' | 'userpass'
  username: string | null
  password: string | null
  token: string | null
  file_pattern: string
  prune_missing: number
  enabled: number
  last_sync_at: string | null
  last_sync_status: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  host_count?: number
}
