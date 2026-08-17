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

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path


# awx_helper.py and views.py variables
awx_url = os.getenv("AWX_URL", "http://localhost:61008/awx_handler")
endpoints_base_url = os.getenv("ENDPOINTS_BASE_URL", "http://localhost:61008")
host_file_path = _ensure_dir(os.getenv("USER_FILES_PATH", str(REPO_ROOT / "user_files")))
prop_file_path = _ensure_dir(os.getenv("PROP_FILE_PATH", str(REPO_ROOT / "user_var")))
mpa_url = os.getenv("MPA_URL", "https://dummy_url")

# utility.py variables

workdir = _ensure_dir(os.getenv("PORTAL_WORKDIR", str(REPO_ROOT / "user_files")))
volumes = os.getenv("PORTAL_VOLUMES", str(REPO_ROOT / "user_files") + ":/app/mp")
image_name = os.getenv("PLAYWRIGHT_IMAGE", "playwright_env:1.41.1")
pythonMpa = os.getenv("PYTHON_MPA", "/app/mp/fetch_password_from_mpa.py")









