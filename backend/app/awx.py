import requests
import urllib3

from . import config, database

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def resolve_connection():
    """Return the settings of the active execution option.

    Preferred source is the enabled row in execution_options (set from the UI);
    falls back to environment config if no option is saved yet.
    """
    try:
        conn = database.get_connection()
        row = conn.execute("SELECT * FROM execution_options WHERE is_active = 1 ORDER BY id LIMIT 1").fetchone()
        conn.close()
        if row:
            return {
                "id": row["id"], "name": row["name"], "provider": row["provider"],
                "url": row["url"], "auth_mode": row["auth_mode"],
                "username": row["username"], "password": row["password"], "token": row["token"],
            }
    except Exception:
        pass
    return {
        "id": None, "name": "env", "provider": "awx",
        "url": f"{config.AWX_PROTOCOL}://{config.AWX_HOST}:{config.AWX_PORT}",
        "auth_mode": config.AWX_AUTH_MODE,
        "username": config.AWX_USERNAME, "password": config.AWX_PASSWORD, "token": config.AWX_TOKEN,
    }


def _request_kwargs(connection):
    """Return requests auth/headers for the given connection.

    AWX supports Basic auth (user:password) and OAuth2 tokens (Bearer).
    See https://oneuptime.com/blog/post/2026-02-21-how-to-use-awx-api-for-automation
    """
    if (connection["auth_mode"] or "basic").lower() == "token":
        return {"headers": {"Authorization": f"Bearer {connection['token']}"}}
    return {"auth": (connection["username"], connection["password"])}


def _get(path, timeout=15, connection=None):
    connection = connection or resolve_connection()
    return requests.get(_awx_url(path, connection), verify=False, timeout=timeout, **_request_kwargs(connection))


def _post(path, body=None, timeout=30, connection=None):
    connection = connection or resolve_connection()
    return requests.post(_awx_url(path, connection), json=body, verify=False, timeout=timeout,
                         **_request_kwargs(connection))


LAUNCH_CREDS = {
    "monitorit": ["get_server_details", "onboard_hosts", "onboard_reboot_hosts", "latest_patch_checker"],
    "itops": ["onboard_check", "onepatch_execution", "server_reboot"],
}


def _awx_url(path: str, connection: dict | None = None) -> str:
    connection = connection or resolve_connection()
    return f"{connection['url'].rstrip('/')}{path}"


def _credentials_for(template_name: str) -> list[int]:
    base = template_name.split("_2")[0]
    if base in LAUNCH_CREDS["monitorit"]:
        return [config.AWX_VAULT_ID, config.AWX_OMD_SSH_KEY_CRED_ID]
    if base in LAUNCH_CREDS["itops"]:
        return [config.AWX_VAULT_ID, config.AWX_ITOPS_SSH_KEY_CRED_ID]
    return [config.AWX_VAULT_ID]


def get_awx_health(connection: dict | None = None):
    connection = connection or resolve_connection()
    try:
        response = _get("/api/v2/ping/", connection=connection)
        response.raise_for_status()
        data = response.json()
        return {"success": True, "version": data.get("version"), "instances": len(data.get("instances", [])),
                "ha_capacity": data.get("ha_capacity"), "auth_mode": connection["auth_mode"],
                "connection_id": connection["id"], "connection_name": connection["name"]}
    except Exception as e:
        return {"success": False, "error": str(e), "auth_mode": connection["auth_mode"],
                "connection_id": connection["id"], "connection_name": connection["name"]}


def get_job_template_data(template_id: int):
    response = _get(f"/api/v2/job_templates/{template_id}/")
    response.raise_for_status()
    return response.json()


def get_job_templates_list():
    try:
        response = _get("/api/v2/job_templates/?page_size=100")
        response.raise_for_status()
        templates = [{"id": t["id"], "name": t["name"], "playbook": t["playbook"], "status": t["status"],
                      "job_type": t["job_type"]} for t in response.json().get("results", [])]
        return {"success": True, "templates": templates}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_jobs(status=None, page_size=50):
    try:
        url = _awx_url(f"/api/v2/jobs/?page_size={page_size}&order_by=-created")
        if status:
            url += f"&status={status}"
        response = _get(url)
        response.raise_for_status()
        jobs = [{"id": j["id"], "name": j["name"], "status": j["status"], "job_template": j.get("job_template"),
                 "type": j.get("type"), "started": j.get("started"), "finished": j.get("finished")}
                for j in response.json().get("results", [])]
        return {"success": True, "jobs": jobs}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_job(job_id: int):
    try:
        response = _get(f"/api/v2/jobs/{job_id}/")
        response.raise_for_status()
        data = response.json()
        return {"success": True, "job": {"id": data["id"], "name": data["name"], "status": data["status"],
                                         "job_type": data.get("job_type"), "started": data.get("started"),
                                         "finished": data.get("finished"), "failed": data.get("failed"),
                                         "elapsed": data.get("elapsed"), "job_explanation": data.get("job_explanation")}}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_inventory_id():
    """Return the id of the master inventory, creating it if missing."""
    response = _get("/api/v2/inventories/?name=" + config.AWX_MASTER_INVENTORY)
    response.raise_for_status()
    for inv in response.json().get("results", []):
        return inv["id"]
    created = _post("/api/v2/inventories/", {"name": config.AWX_MASTER_INVENTORY, "description": "GPTA master inventory",
                                             "organization": 1, "kind": ""})
    created.raise_for_status()
    return created.json()["id"]


def ensure_host_group(group_name: str, hostnames: list[str]):
    """Create (or reuse) an AWX group under the master inventory and add hosts."""
    inventory_id = get_inventory_id()
    response = _get(f"/api/v2/inventories/{inventory_id}/groups/?name={group_name}")
    response.raise_for_status()
    group = next((g for g in response.json().get("results", [])), None)
    if group is None:
        created = _post(f"/api/v2/inventories/{inventory_id}/groups/", {"name": group_name, "description": "GPTA run group"})
        created.raise_for_status()
        group = created.json()
    group_id = group["id"]
    existing = {h["name"] for h in _get(f"/api/v2/groups/{group_id}/hosts/?page_size=200").json().get("results", [])}
    for hostname in hostnames:
        if hostname not in existing:
            try:
                _post(f"/api/v2/groups/{group_id}/hosts/",
                      {"name": hostname, "description": "", "enabled": True,
                       "variables": f'{{"ansible_host": "{hostname}"}}'})
            except Exception:
                continue
    return group


def launch_job(template_id: int, extra_vars: str = "", limit_hosts: list[str] | None = None):
    try:
        template_data = get_job_template_data(template_id)
        template_name = template_data["name"]
        body = {"credentials": _credentials_for(template_name)}
        if limit_hosts:
            body["limit"] = ",".join(limit_hosts)
        if extra_vars:
            body["extra_vars"] = extra_vars
        response = _post(f"/api/v2/job_templates/{template_id}/launch/", body)
        response.raise_for_status()
        return {"success": True, "job_id": response.json().get("id"), "template_name": template_name}
    except Exception as e:
        return {"success": False, "error": str(e)}


def refresh_run_status(run_id: str) -> str:
    """Query AWX jobs and reconcile patch_run status for a run_id."""
    try:
        response = _get("/api/v2/jobs/?page_size=50&order_by=-created")
        response.raise_for_status()
        for job in response.json().get("results", []):
            extra_vars = job.get("extra_vars") or "{}"
            if run_id in extra_vars:
                return job.get("status", "pending")
        return "unknown"
    except Exception:
        return "pending"
