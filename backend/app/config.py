import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Legacy SQLite path (used only by the migration script)
DB_PATH = Path(os.getenv("DB_URL", str(BASE_DIR / "data" / "gpta.db")))
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
RUNS_DIR = Path(os.getenv("RUNS_DIR", str(DATA_DIR / "runs")))
USER_FILES = Path(os.getenv("USER_FILES_PATH", str(DATA_DIR / "user_files")))
VAULT_DIR = Path(os.getenv("AWX_MASTER_VAULT", str(DATA_DIR / "vault")))

# PostgreSQL connection
DATABASE_NAME = os.getenv("DATABASE_NAME", "gpta")
DATABASE_USER = os.getenv("DATABASE_USER", "gpta")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD", "gpta")
DATABASE_HOST = os.getenv("DATABASE_HOST", "localhost")
DATABASE_PORT = os.getenv("DATABASE_PORT", "5432")

for d in (DATA_DIR, RUNS_DIR, USER_FILES, VAULT_DIR):
    d.mkdir(parents=True, exist_ok=True)

# AWX connection
AWX_PROTOCOL = os.getenv("AWX_PROTOCOL", "https")
AWX_HOST = os.getenv("AWX_HOST", "YourHost")
AWX_PORT = os.getenv("AWX_PORT", "8443")
AWX_USERNAME = os.getenv("AWX_USERNAME", "<username>")
AWX_PASSWORD = os.getenv("AWX_PASSWORD", "<password>")
AWX_AUTH_MODE = os.getenv("AWX_AUTH_MODE", "basic")  # basic | token
AWX_TOKEN = os.getenv("AWX_TOKEN", "")
AWX_VAULT_ID = int(os.getenv("AWX_VAULT_ID", "3"))
AWX_OMD_SSH_KEY_CRED_ID = int(os.getenv("AWX_OMD_SSH_KEY_CRED_ID", "4"))
AWX_ITOPS_SSH_KEY_CRED_ID = int(os.getenv("AWX_ITOPS_SSH_KEY_CRED_ID", "5"))
AWX_MASTER_INVENTORY = os.getenv("AWX_MASTER_INVENTORY", "master_inventory")
AWX_PROJECT = os.getenv("AWX_PROJECT", "zeroops")

# Endpoints self base (for AWX callbacks back into this app)
ENDPOINTS_BASE_URL = os.getenv("ENDPOINTS_BASE_URL", "http://localhost:61008")

# Security
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "7"))

# Seed admin
SEED_ADMIN_USER = os.getenv("SEED_ADMIN_USER", "test")
SEED_ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "Bogdan123!")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
