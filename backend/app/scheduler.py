import json
import threading
import time
from datetime import datetime, timedelta, timezone

from . import database
from .routers import patching


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _next_run_at(policy) -> str | None:
    """Compute the next UTC run timestamp for a policy.

    - immediate  -> never fires automatically (manual trigger only)
    - delayed    -> delay_minutes from now-ish; unless already fired, countdown starts from now
    - fixed_time -> next occurrence of fixed_time_utc (daily)
    """
    if policy["patch_delay_type"] == "immediate":
        return None
    if policy["patch_delay_type"] == "fixed_time" and policy["fixed_time_utc"]:
        try:
            hh, mm = (int(x) for x in policy["fixed_time_utc"].split(":"))
            now = now_utc()
            target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
            if target <= now:
                target += timedelta(days=1)
            return target.isoformat()
        except Exception:
            return None
    if policy["patch_delay_type"] == "delayed" and policy["delay_minutes"]:
        return (now_utc() + timedelta(minutes=policy["delay_minutes"])).isoformat()
    return None


def _policy_host_ids(conn, policy_id: int) -> list[int]:
    """Resolve the hosts a policy applies to (assignment targets minus exclusions)."""
    ids: set[int] = set()
    for a in conn.execute("SELECT * FROM policy_assignments WHERE policy_id = %s", (policy_id,)).fetchall():
        if a["target_type"] == "host":
            ids.add(a["target_id"])
        elif a["target_type"] == "host_group":
            for r in conn.execute("SELECT id FROM hosts WHERE group_id = %s", (a["target_id"],)).fetchall():
                ids.add(r["id"])
    excluded = {e["host_id"] for e in
                conn.execute("SELECT * FROM policy_exclusions WHERE policy_id = %s", (policy_id,)).fetchall()}
    return sorted(ids - excluded)


def run_scheduler_once():
    """Fire any policies whose next_run_at has elapsed.

    Each fired policy becomes a scheduled patch run via patching.orchestrate_run,
    then its next_run_at is advanced (fixed_time recurs daily; delayed recurs by
    delay_minutes from the fire time so scheduling re-arms after each run).
    """
    conn = database.get_connection()
    policies = conn.execute("SELECT * FROM patch_policies WHERE enabled = 1").fetchall()
    now = now_utc()

    for policy in policies:
        # initialize next_run_at on first boot for policies not yet armed
        if not policy["next_run_at"]:
            conn.execute("UPDATE patch_policies SET next_run_at = %s, updated_at = %s WHERE id = %s",
                         (_next_run_at(policy), database.now_iso(), policy["id"]))
            continue

        try:
            due = now >= datetime.fromisoformat(policy["next_run_at"])
        except ValueError:
            due = False
        if not due:
            continue

        host_ids = _policy_host_ids(conn, policy["id"])
        extra_vars = {"policy_id": policy["id"], "policy_name": policy["name"]}
        template_id = policy["template_id"]
        if template_id:
            result = patching.orchestrate_run(conn, template_id, host_ids, extra_vars, "scheduler", "scheduled")
            if result.get("success"):
                conn.execute("UPDATE patch_policies SET last_run_at = %s, updated_at = %s WHERE id = %s",
                             (database.now_iso(), database.now_iso(), policy["id"]))
        next_run = _next_run_at(policy)
        conn.execute("UPDATE patch_policies SET next_run_at = %s, updated_at = %s WHERE id = %s",
                     (next_run, database.now_iso(), policy["id"]))

    conn.commit()
    conn.close()


def scheduler_loop(stop_event):
    while not stop_event.wait(30):
        try:
            run_scheduler_once()
        except Exception:
            pass


def start_scheduler():
    stop_event = threading.Event()
    thread = threading.Thread(target=scheduler_loop, args=(stop_event,), daemon=True, name="gpta-scheduler")
    thread.start()
    return stop_event