import requests
import urllib3

from . import config

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

_AUTH = (config.AWX_USERNAME, config.AWX_PASSWORD)

LAUNCH_CREDS = {
    "monitorit": ["get_server_details", "onboard_hosts", "onboard_reboot_hosts", "latest_patch_checker"],
    "itops": ["onboard_check", "onepatch_execution", "server_reboot"],
}


def _awx_url(path: str) -> str:
    return f"{config.AWX_PROTOCOL}://{config.AWX_HOST}:{config.AWX_PORT}{path}"


def _credentials_for(template_name: str) -> list[int]:
    base = template_name.split("_2")[0]
    if base in LAUNCH_CREDS["monitorit"]:
        return [config.AWX_VAULT_ID, config.AWX_OMD_SSH_KEY_CRED_ID]
    if base in LAUNCH_CREDS["itops"]:
        return [config.AWX_VAULT_ID, config.AWX_ITOPS_SSH_KEY_CRED_ID]
    return [config.AWX_VAULT_ID]


def get_awx_health():
    try:
        response = requests.get(_awx_url("/api/v2/ping/"), auth=_AUTH, verify=False, timeout=15)
        response.raise_for_status()
        data = response.json()
        return {"success": True, "version": data.get("version"), "instances": len(data.get("instances", [])),
                "ha_capacity": data.get("ha_capacity")}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_job_template_data(template_id: int):
    response = requests.get(_awx_url(f"/api/v2/job_templates/{template_id}/"), auth=_AUTH, verify=False, timeout=15)
    response.raise_for_status()
    return response.json()


def get_job_templates_list():
    try:
        response = requests.get(_awx_url("/api/v2/job_templates/?page_size=100"), auth=_AUTH, verify=False, timeout=15)
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
        response = requests.get(url, auth=_AUTH, verify=False, timeout=15)
        response.raise_for_status()
        jobs = [{"id": j["id"], "name": j["name"], "status": j["status"], "job_template": j.get("job_template"),
                 "type": j.get("type"), "started": j.get("started"), "finished": j.get("finished")}
                for j in response.json().get("results", [])]
        return {"success": True, "jobs": jobs}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_job(job_id: int):
    try:
        response = requests.get(_awx_url(f"/api/v2/jobs/{job_id}/"), auth=_AUTH, verify=False, timeout=15)
        response.raise_for_status()
        data = response.json()
        return {"success": True, "job": {"id": data["id"], "name": data["name"], "status": data["status"],
                                         "job_type": data.get("job_type"), "started": data.get("started"),
                                         "finished": data.get("finished"), "failed": data.get("failed"),
                                         "elapsed": data.get("elapsed"), "job_explanation": data.get("job_explanation")}}
    except Exception as e:
        return {"success": False, "error": str(e)}


def launch_job(template_id: int, extra_vars: str = "", host_ids: list[int] | None = None):
    try:
        template_data = get_job_template_data(template_id)
        template_name = template_data["name"]
        body = {"credentials": _credentials_for(template_name)}
        if host_ids:
            body["limit"] = ",".join(str(i) for i in host_ids)
        if extra_vars:
            body["extra_vars"] = extra_vars
        response = requests.post(_awx_url(f"/api/v2/job_templates/{template_id}/launch/"), auth=_AUTH, json=body,
                                 verify=False, timeout=30)
        response.raise_for_status()
        return {"success": True, "job_id": response.json().get("id"), "template_name": template_name}
    except Exception as e:
        return {"success": False, "error": str(e)}


def refresh_run_status(run_id: str) -> str:
    """Query AWX jobs and reconcile patch_run status for a run_id."""
    try:
        url = _awx_url("/api/v2/jobs/?page_size=50&order_by=-created")
        response = requests.get(url, auth=_AUTH, verify=False, timeout=15)
        response.raise_for_status()
        for job in response.json().get("results", []):
            extra_vars = job.get("extra_vars") or "{}"
            if run_id in extra_vars:
                return job.get("status", "pending")
        return "unknown"
    except Exception:
        return "pending"
