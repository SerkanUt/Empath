"""API tests: temp DB, fake detector (no py-feat model load)."""

import pytest
from fastapi.testclient import TestClient

import database
import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(main, "MEDIA_DIR", tmp_path)
    database.init_db()
    # No `with`: skips the startup hook that loads the model.
    return TestClient(main.app)


def _scene(client, url="http://x/y.mp4"):
    r = client.post("/scenes", json={"title": "t", "video_url": url, "duration": 20})
    assert r.status_code == 200
    return r.json()["id"]


def _test_session(client, scene_id, samples=None):
    samples = samples if samples is not None else [
        {"timestamp": 1.0, "face_detected": True, "dominant_emotion": "happy",
         "emotion_probabilities": {"happy": 0.9}},
    ]
    r = client.post(f"/scenes/{scene_id}/test-sessions",
                    json={"samples": samples, "pause_events": [], "viewer_label": "A"})
    assert r.status_code == 200
    return r.json()["id"]


def test_health(client):
    assert client.get("/").json() == {"status": "ok"}


def test_error_flag_survives_round_trip(client):
    sid = _scene(client)
    tid = _test_session(client, sid, [{"timestamp": 0, "face_detected": False, "error": True}])
    assert client.get(f"/test-sessions/{tid}").json()["samples"][0]["error"] is True


def test_delete_test_session(client):
    tid = _test_session(client, _scene(client))
    assert client.delete(f"/test-sessions/{tid}").status_code == 200
    assert client.get(f"/test-sessions/{tid}").status_code == 404
    assert client.delete(f"/test-sessions/{tid}").status_code == 404


def test_delete_scene_cascades_and_removes_media(client, tmp_path):
    (tmp_path / "abc.mp4").write_bytes(b"x")
    sid = _scene(client, "/api/media/abc.mp4")
    tid = _test_session(client, sid)
    cid = client.post(f"/scenes/{sid}/control-sessions", json={"tags": []}).json()["id"]
    client.post("/score", json={"test_session_id": tid, "control_session_id": cid})

    assert client.delete(f"/scenes/{sid}").status_code == 200
    assert client.get(f"/scenes/{sid}").status_code == 404
    assert client.get(f"/test-sessions/{tid}").status_code == 404
    assert client.get(f"/control-sessions/{cid}").status_code == 404
    assert not (tmp_path / "abc.mp4").exists()


def test_delete_scene_does_not_touch_external_urls(client):
    sid = _scene(client, "http://example.com/video.mp4")
    assert client.delete(f"/scenes/{sid}").status_code == 200


def test_delete_missing_scene_404(client):
    assert client.delete("/scenes/999").status_code == 404


def test_score_endpoint(client):
    sid = _scene(client)
    tid = _test_session(client, sid)
    cid = client.post(f"/scenes/{sid}/control-sessions", json={"tags": [
        {"emotion": "happy", "intensity": 3, "start_time": 0, "end_time": 5}]}).json()["id"]
    r = client.post("/score", json={"test_session_id": tid, "control_session_id": cid})
    assert r.status_code == 200
    assert "dtw_accuracy_score" in r.json()


def test_score_unknown_sessions_404(client):
    assert client.post("/score", json={"test_session_id": 1, "control_session_id": 1}).status_code == 404


def test_detect_emotion_uses_detector(client, monkeypatch):
    monkeypatch.setattr(main, "detect_emotion_from_base64", lambda b: {"face_detected": False})
    r = client.post("/detect-emotion", json={"image_base64": "x"})
    assert r.json() == {"face_detected": False}


def test_detect_emotion_bad_input_is_400(client, monkeypatch):
    def boom(_):
        raise ValueError("invalid image data")
    monkeypatch.setattr(main, "detect_emotion_from_base64", boom)
    assert client.post("/detect-emotion", json={"image_base64": "x"}).status_code == 400


def test_detect_emotion_model_failure_is_500(client, monkeypatch):
    def boom(_):
        raise RuntimeError("model exploded")
    monkeypatch.setattr(main, "detect_emotion_from_base64", boom)
    assert client.post("/detect-emotion", json={"image_base64": "x"}).status_code == 500


def test_cors_blocks_foreign_origin(client):
    r = client.get("/", headers={"Origin": "http://evil.com"})
    assert "access-control-allow-origin" not in r.headers
