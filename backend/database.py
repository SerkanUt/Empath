
import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent / "emotion_tester.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS scenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        video_url TEXT NOT NULL,
        duration REAL NOT NULL,
        created_at REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scene_id INTEGER NOT NULL,
        created_by TEXT,
        tags_json TEXT NOT NULL,
        created_at REAL NOT NULL,
        FOREIGN KEY (scene_id) REFERENCES scenes(id)
    );

    CREATE TABLE IF NOT EXISTS test_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scene_id INTEGER NOT NULL,
        viewer_label TEXT,
        samples_json TEXT NOT NULL,
        pause_events_json TEXT,
        calibration_json TEXT,
        created_at REAL NOT NULL,
        FOREIGN KEY (scene_id) REFERENCES scenes(id)
    );

    CREATE TABLE IF NOT EXISTS calibration_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scene_id INTEGER NOT NULL,
        viewer_label TEXT NOT NULL,
        calibration_json TEXT NOT NULL,
        created_at REAL NOT NULL,
        FOREIGN KEY (scene_id) REFERENCES scenes(id)
    );

    CREATE TABLE IF NOT EXISTS score_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_session_id INTEGER NOT NULL,
        control_session_id INTEGER NOT NULL,
        result_json TEXT NOT NULL,
        created_at REAL NOT NULL,
        FOREIGN KEY (test_session_id) REFERENCES test_sessions(id),
        FOREIGN KEY (control_session_id) REFERENCES control_sessions(id)
    );
    """)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(test_sessions)").fetchall()}
    if "calibration_json" not in cols:
        conn.execute("ALTER TABLE test_sessions ADD COLUMN calibration_json TEXT")
    conn.commit()
    conn.close()


def create_scene(title: str, video_url: str, duration: float) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO scenes (title, video_url, duration, created_at) VALUES (?, ?, ?, ?)",
        (title, video_url, duration, time.time()),
    )
    conn.commit()
    scene_id = cur.lastrowid
    conn.close()
    return scene_id


def list_scenes() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM scenes ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_scene(scene_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM scenes WHERE id = ?", (scene_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_control_session(scene_id: int, tags: list, created_by: str = None) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO control_sessions (scene_id, created_by, tags_json, created_at) VALUES (?, ?, ?, ?)",
        (scene_id, created_by, json.dumps(tags), time.time()),
    )
    conn.commit()
    session_id = cur.lastrowid
    conn.close()
    return session_id


def get_control_session(session_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM control_sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["tags"] = json.loads(d.pop("tags_json"))
    return d


def list_control_sessions(scene_id: int) -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM control_sessions WHERE scene_id = ? ORDER BY created_at DESC", (scene_id,)
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.pop("tags_json"))
        out.append(d)
    return out


def create_test_session(
    scene_id: int,
    samples: list,
    pause_events: list,
    viewer_label: str = None,
    calibration: dict = None,
) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO test_sessions (scene_id, viewer_label, samples_json, pause_events_json, "
        "calibration_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (
            scene_id,
            viewer_label,
            json.dumps(samples),
            json.dumps(pause_events or []),
            json.dumps(calibration) if calibration else None,
            time.time(),
        ),
    )
    conn.commit()
    session_id = cur.lastrowid
    conn.close()
    return session_id


def _parse_test_session_row(row) -> dict:
    d = dict(row)
    d["samples"] = json.loads(d.pop("samples_json"))
    d["pause_events"] = json.loads(d.pop("pause_events_json") or "[]")
    cal = d.pop("calibration_json", None)
    d["calibration"] = json.loads(cal) if cal else None
    return d


def get_test_session(session_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM test_sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return _parse_test_session_row(row)


def list_test_sessions(scene_id: int) -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM test_sessions WHERE scene_id = ? ORDER BY created_at DESC", (scene_id,)
    ).fetchall()
    conn.close()
    return [_parse_test_session_row(r) for r in rows]


def list_calibration_sessions(scene_id: int) -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM calibration_sessions WHERE scene_id = ? ORDER BY created_at DESC",
        (scene_id,),
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        d["calibration"] = json.loads(d.pop("calibration_json"))
        out.append(d)
    return out


def create_calibration_session(scene_id: int, viewer_label: str, calibration: dict) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO calibration_sessions (scene_id, viewer_label, calibration_json, created_at) "
        "VALUES (?, ?, ?, ?)",
        (scene_id, viewer_label, json.dumps(calibration), time.time()),
    )
    conn.commit()
    session_id = cur.lastrowid
    conn.close()
    return session_id


def get_calibration_session(session_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM calibration_sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["calibration"] = json.loads(d.pop("calibration_json"))
    return d


def save_score_result(test_session_id: int, control_session_id: int, result: dict) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO score_results (test_session_id, control_session_id, result_json, created_at) "
        "VALUES (?, ?, ?, ?)",
        (test_session_id, control_session_id, json.dumps(result), time.time()),
    )
    conn.commit()
    result_id = cur.lastrowid
    conn.close()
    return result_id
