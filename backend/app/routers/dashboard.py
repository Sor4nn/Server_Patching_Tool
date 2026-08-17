from fastapi import APIRouter, Depends

from .. import database
from .auth import current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    total_hosts = conn.execute("SELECT COUNT(*) AS c FROM hosts").fetchone()["c"]
    total_groups = conn.execute("SELECT COUNT(*) AS c FROM host_groups").fetchone()["c"]
    total_users = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    total_runs = conn.execute("SELECT COUNT(*) AS c FROM patch_runs").fetchone()["c"]
    recent_runs = conn.execute("SELECT * FROM patch_runs ORDER BY id DESC LIMIT 5").fetchall()
    recent_hosts = conn.execute("SELECT * FROM hosts ORDER BY updated_at DESC LIMIT 8").fetchall()
    conn.close()
    return {
        "success": True,
        "stats": {
            "total_hosts": total_hosts,
            "total_groups": total_groups,
            "total_users": total_users,
            "total_runs": total_runs,
        },
        "recent_runs": [dict(r) for r in recent_runs],
        "recent_hosts": [dict(h) for h in recent_hosts],
    }
