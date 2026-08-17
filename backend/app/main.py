from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, database, scheduler
from .routers import auth, awx_callbacks, dashboard, execution_options, host_groups, hosts, inventory_sources, packages, patching, patching_panel, policies, users

database.init_db()
scheduler.start_scheduler()

app = FastAPI(title="GPTA - Gotta Patchem Them All", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, dashboard.router, hosts.router, host_groups.router, users.router, patching.router,
          packages.router, policies.router, execution_options.router, patching_panel.router, awx_callbacks.router,
          inventory_sources.router):
    app.include_router(r)


@app.get("/api/v1/health")
def api_health():
    return {"success": True, "app": "gpta", "status": "ok"}


# Serve the built frontend (production / Docker)
DIST_DIR = Path(config.BASE_DIR).parent / "frontend" / "dist"
if (DIST_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"success": False, "error": "Not found"})
        file = DIST_DIR / path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(DIST_DIR / "index.html")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})
