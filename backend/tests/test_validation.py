"""Unit tests for repo URL + input validation (no DB)."""
from fastapi import HTTPException

from app.routers import inventory_sources, templates


def _tpl(repo_url=None):
    return templates.TemplateCreate(
        name="t", playbook="ansible_scripts/x.yml", repo_url=repo_url or "https://github.com/a/b.git")


def test_template_valid_http_url():
    templates._validate(_tpl("https://github.com/org/repo.git"))
    templates._validate(_tpl("http://git.local/repo.git"))


def test_template_valid_git_and_ssh_urls():
    templates._validate(_tpl("git@github.com:org/repo.git"))
    templates._validate(_tpl("ssh://git@host/repo"))


def test_template_rejects_relative_url():
    import pytest
    with pytest.raises(HTTPException) as exc:
        templates._validate(_tpl("repo.git"))
    assert exc.value.status_code == 400


def test_template_requires_name():
    import pytest
    with pytest.raises(HTTPException):
        templates._validate(templates.TemplateCreate(name="  ", playbook="p", repo_url="https://x/y"))


def test_source_valid_file_url():
    inventory_sources._validate(inventory_sources.SourceCreate(name="s", repo_url="file:///data/repos-test"))


def test_source_rejects_bad_url():
    import pytest
    with pytest.raises(HTTPException) as exc:
        inventory_sources._validate(inventory_sources.SourceCreate(name="s", repo_url="not-a-url"))
    assert exc.value.status_code == 400
