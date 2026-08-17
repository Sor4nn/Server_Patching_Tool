"""Copyright 2018 Infosys Ltd.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. """

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _get_int(name, default):
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


# awx_api.py

user_name = os.getenv("AWX_USERNAME", "<username>")
password = os.getenv("AWX_PASSWORD", "<password>")

host = os.getenv("AWX_HOST", "YourHost")
port = os.getenv("AWX_PORT", "8443")
protocol = os.getenv("AWX_PROTOCOL", "https")
vault_id = _get_int("AWX_VAULT_ID", 3)
omd_ssh_key_cred_id = _get_int("AWX_OMD_SSH_KEY_CRED_ID", 4)
itops_ssh_key_cred_id = _get_int("AWX_ITOPS_SSH_KEY_CRED_ID", 5)
master_vault = os.getenv("AWX_MASTER_VAULT", str(REPO_ROOT / "data" / "vault"))
user_files_path = os.getenv("USER_FILES_PATH", str(REPO_ROOT / "user_files"))
endpoints_base_url = os.getenv("ENDPOINTS_BASE_URL", "http://localhost:61008")
database_url = os.getenv("DB_URL", str(REPO_ROOT / "database" / "server_patch_db.sqlite3"))