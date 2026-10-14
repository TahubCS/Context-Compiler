import os

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
AUTH = {"Authorization": f"Bearer {os.environ['AI_BACKEND_SECRET']}"}

SCAN_BODY = {
    "scan_job_id": "job",
    "repository_id": "repo",
    "github_url": "https://github.com/owner/name",
    "default_branch": "main",
    "github_token": "token",
    "callback_url": "https://app.example.com/api/repo/repo/scan/status",
    "callback_secret": "cb",
}


def test_health_is_public():
    assert client.get("/health").json() == {"ok": True}


@pytest.mark.parametrize("path", ["/scan", "/search", "/answer", "/embed"])
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "secret"}])
def test_protected_routes_reject_missing_or_wrong_secret(path, headers):
    assert client.post(path, json={}, headers=headers).status_code == 401


def test_scan_accepts_valid_request(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "run_scan", lambda **kwargs: calls.append(kwargs))
    response = client.post("/scan", json=SCAN_BODY, headers=AUTH)
    assert response.status_code == 200
    assert calls and calls[0]["repository_id"] == "repo"


@pytest.mark.parametrize(
    "override",
    [
        {"github_url": "https://evil.example.com/owner/name"},
        {"github_url": "http://github.com/owner/name"},
        {"github_url": "https://user:pw@github.com/owner/name"},
        {"github_url": "file:///etc/passwd"},
        {"callback_url": "https://evil.example.com/collect"},
        {"callback_url": "https://app.example.com.evil.com/x"},
    ],
)
def test_scan_rejects_disallowed_urls(monkeypatch, override):
    monkeypatch.setattr(main, "run_scan", lambda **kwargs: pytest.fail("scan must not start"))
    response = client.post("/scan", json={**SCAN_BODY, **override}, headers=AUTH)
    assert response.status_code == 400


def test_answer_falls_back_when_generation_exceeds_budget(monkeypatch):
    import time

    monkeypatch.setattr(main, "ANSWER_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(main, "generate_grounded_answer", lambda *args: time.sleep(2) or "late")
    citations = [{"filePath": "src/auth.ts", "chunkIndex": 0, "content": "export function auth() {}"}]
    started = time.monotonic()
    response = client.post(
        "/answer", json={"repository_id": "repo", "question": "auth?", "citations": citations}, headers=AUTH
    )
    assert time.monotonic() - started < 1.5
    body = response.json()
    assert body["degraded"] is True
    assert "src/auth.ts" in body["answer"]
