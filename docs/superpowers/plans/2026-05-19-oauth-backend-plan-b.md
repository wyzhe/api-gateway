# OAuth 登录 — Plan B:后端密码自助管理

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `POST /api/auth/me/password` 自助设密码 / 改密码端点,遵循 NIST 800-63B §5.1.1.2,支持 OAuth-only 用户首次设密码(防止 provider 失效时账号锁死)。

**Architecture:** 新增 breached password 静态字典(SecLists top-10k),启动时一次性加载到内存 set 做 O(1) 查询。密码规则:长度 12–128、不做 character class、查 breached list、拒绝包含 email 本地部分。Rate limit 5/min/JWT 且 10/min/IP。

**Tech Stack:** FastAPI / bcrypt(已有)、SecLists top-10k 静态文件。

**Reference spec:** `docs/superpowers/specs/2026-05-19-oauth-login-design.md` § 5.6 + § 12 NIST 推论。

**Depends on:** Plan A Task 1.1, 1.2(`password_hash` nullable + `UserOut` has_password 字段)。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `backend/app/data/breached_top10k.txt` | SecLists top-10k 静态文件(~80KB,一行一密码) |
| `backend/app/services/breached_password_service.py` | 启动加载 + `is_breached(plain) -> bool` |
| `backend/app/services/password_policy_service.py` | `validate_password(plain, *, email)` 返回 error code 或 None |
| `backend/app/schemas/auth.py` | 加 `PasswordChangeRequest`、`PasswordChangeResponse` |
| `backend/app/api/auth.py` | 新增 `POST /api/auth/me/password` |
| `backend/tests/test_password_policy.py` | 规则单元测 |
| `backend/tests/test_self_service_password.py` | 端到端测试 |

---

# Phase 1 — Breached password 静态字典 + service

## Task B.1.1 — 下载 SecLists top-10k 并保存

**Files:**
- Create: `backend/app/data/breached_top10k.txt`

- [ ] **Step 1: 下载 SecLists top-10k 文件**

Run:
```bash
mkdir -p backend/app/data
curl -fsSL https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt \
  -o backend/app/data/breached_top10k.txt
wc -l backend/app/data/breached_top10k.txt
```

Expected: `10000 backend/app/data/breached_top10k.txt`(或非常接近)。

- [ ] **Step 2: 烟囱测内容**

Run:
```bash
head -5 backend/app/data/breached_top10k.txt
grep -c "^123456$" backend/app/data/breached_top10k.txt
grep -c "^password$" backend/app/data/breached_top10k.txt
```

Expected: `123456` / `password` 等都在;计数都 = 1。

- [ ] **Step 3: Commit**

```bash
git add backend/app/data/breached_top10k.txt
git commit -m "data: SecLists top-10k breached password list for NIST 800-63B compliance"
```

---

## Task B.1.2 — breached_password_service.py

**Files:**
- Create: `backend/app/services/breached_password_service.py`
- Create: `backend/tests/test_breached_password.py`

- [ ] **Step 1: 写失败测试**

新文件 `backend/tests/test_breached_password.py`:

```python
"""Breached password service — load static file, lowercase, O(1) check."""
from app.services import breached_password_service as svc


def test_known_top10_passwords_flagged():
    assert svc.is_breached("123456") is True
    assert svc.is_breached("password") is True
    assert svc.is_breached("qwerty") is True


def test_unique_random_passphrase_not_flagged():
    # 不太可能在 top-10k 里
    assert svc.is_breached("correct-horse-battery-staple-z9q") is False


def test_check_is_case_insensitive():
    assert svc.is_breached("PASSWORD") is True
    assert svc.is_breached("Password") is True


def test_load_count_is_around_10k():
    # SecLists 文件大概 10000 行;允许 ±100 偏差
    assert 9900 <= len(svc._BREACHED_SET) <= 10100
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_breached_password.py -v`
Expected: ImportError

- [ ] **Step 3: 写 service**

新文件 `backend/app/services/breached_password_service.py`:

```python
"""Breached password list — loaded once at import time.

NIST SP 800-63B §5.1.1.2 SHALL clause:
"compare against a list ... containing values known to be ... compromised"
"""
from __future__ import annotations

from pathlib import Path

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "breached_top10k.txt"


def _load() -> frozenset[str]:
    try:
        with _DATA_PATH.open("r", encoding="utf-8") as f:
            return frozenset(line.strip().lower() for line in f if line.strip())
    except FileNotFoundError:
        # 测试或 dev 环境字典缺失:返回空集合 + log,不爆死(让管理员发现)
        import logging
        logging.warning("breached_top10k.txt not found at %s; check is disabled", _DATA_PATH)
        return frozenset()


_BREACHED_SET: frozenset[str] = _load()


def is_breached(plain: str) -> bool:
    return plain.lower() in _BREACHED_SET
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_breached_password.py -v`
Expected: 4 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/breached_password_service.py backend/tests/test_breached_password.py
git commit -m "feat(security): breached_password_service for NIST 800-63B compliance"
```

---

# Phase 2 — Password policy 服务

## Task B.2.1 — password_policy_service.py

**Files:**
- Create: `backend/app/services/password_policy_service.py`
- Create: `backend/tests/test_password_policy.py`

- [ ] **Step 1: 写失败测试**

新文件 `backend/tests/test_password_policy.py`:

```python
"""NIST 800-63B § 5.1.1.2 compliant policy: 12–128 chars, breached check,
no composition rules, no email-substring."""
from app.services import password_policy_service as policy


def test_accepts_long_passphrase_without_special_chars():
    # 全小写 + 长度足够 — NIST 推荐做法
    assert policy.validate_password("correct horse battery staple", email="x@y.com") is None


def test_rejects_too_short():
    err = policy.validate_password("short1234567", email="x@y.com")  # 12 chars OK
    assert err is None
    err = policy.validate_password("short", email="x@y.com")
    assert err == "too_short"


def test_rejects_too_long():
    err = policy.validate_password("a" * 200, email="x@y.com")
    assert err == "too_long"


def test_rejects_breached_password():
    err = policy.validate_password("password1234", email="x@y.com")  # 12 chars
    # 不一定在 top-10k,但 "password" 在;让我们试一个肯定在的
    err = policy.validate_password("123456789012", email="x@y.com")
    assert err == "breached"  # "123456789012" 应该在 top-10k


def test_accepts_passphrase_when_not_breached():
    assert policy.validate_password("my-strong-passphrase-XJ7q", email="x@y.com") is None


def test_rejects_password_containing_email_local_part():
    # email 本地部分超过 4 字符,在密码内出现
    err = policy.validate_password("Alice12345678", email="alice@example.com")
    assert err == "contains_email"


def test_short_email_local_part_does_not_match():
    # email 本地部分 <= 4 字符,不强匹
    err = policy.validate_password("ab1234567890", email="ab@example.com")
    assert err is None


def test_does_not_enforce_character_class_rules():
    # 纯小写 + 数字 OK(NIST 反对 composition rules)
    assert policy.validate_password("longenough123", email="x@y.com") is None
    # 纯字母也 OK
    assert policy.validate_password("longenoughpassword", email="x@y.com") is None
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_password_policy.py -v`
Expected: ImportError

- [ ] **Step 3: 写 service**

新文件 `backend/app/services/password_policy_service.py`:

```python
"""Password policy per NIST SP 800-63B § 5.1.1.2.

Rules (intentionally minimal):
- length >= 12 (NIST minimum 8, we go slightly higher)
- length <= 128 (bcrypt input DoS protection)
- not in breached top-10k list
- not contain email local part (>=5 chars) as substring

Explicitly NOT enforced:
- character class composition (uppercase / digit / symbol) — NIST §5.1.1.2 SHOULD NOT
- arbitrary rotation — NIST §5.1.1.2 SHOULD NOT
"""
from __future__ import annotations

from .breached_password_service import is_breached

MIN_LEN = 12
MAX_LEN = 128


def validate_password(plain: str, *, email: str) -> str | None:
    """Return None if OK, else an error code string."""
    if len(plain) < MIN_LEN:
        return "too_short"
    if len(plain) > MAX_LEN:
        return "too_long"
    if is_breached(plain):
        return "breached"

    local = email.split("@", 1)[0].lower()
    if len(local) >= 5 and local in plain.lower():
        return "contains_email"

    return None
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_password_policy.py -v`
Expected: 8 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/password_policy_service.py backend/tests/test_password_policy.py
git commit -m "feat(security): NIST 800-63B password policy service"
```

---

# Phase 3 — `POST /api/auth/me/password` 端点

## Task B.3.1 — Schemas

**Files:**
- Modify: `backend/app/schemas/auth.py`

- [ ] **Step 1: 加 schemas**

修改 `backend/app/schemas/auth.py`,在文件末尾追加(`UserOut.model_rebuild()` 之前):

```python
class PasswordChangeRequest(BaseModel):
    current_password: str | None = None  # OAuth-only 用户首次设密码时省略
    new_password: str = Field(min_length=1)


class PasswordChangeResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int
```

- [ ] **Step 2: Commit(无测试,纯 schema)**

```bash
git add backend/app/schemas/auth.py
git commit -m "feat(schemas): PasswordChange request/response"
```

---

## Task B.3.2 — 端点 + 单元测

**Files:**
- Modify: `backend/app/api/auth.py`
- Create: `backend/tests/test_self_service_password.py`
- Modify: `backend/app/metrics.py`(加 password counter)

- [ ] **Step 1: 写失败测试**

新文件 `backend/tests/test_self_service_password.py`:

```python
"""Self-service password endpoint.

Behavior:
- OAuth-only user (password_hash IS NULL) can set without current_password
- Existing-password user must provide correct current_password
- New password validated by password_policy_service
- All existing refresh tokens revoked; new pair returned
- Audit log written
"""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.database import SessionLocal
from app.models import RefreshToken, User
from app.security import hash_password
from tests.conftest import TEST_USER_PASSWORD, _db_reachable

pytestmark = pytest.mark.skipif(not _db_reachable(), reason="needs Postgres")


def _make_user(db, email: str, *, password_hash: str | None) -> User:
    db.query(User).filter(User.email == email).delete()
    db.commit()
    u = User(
        email=email, password_hash=password_hash,
        role="user", status="active", balance=Decimal("0"),
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _jwt_for(client, email: str, password: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_oauth_only_user_can_set_first_password(client):
    db = SessionLocal()
    email = "pwd-oauth-only@example.com"
    u = _make_user(db, email, password_hash=None)
    try:
        # 用 access token 直接签(没密码不能 login)
        from app.security import create_access_token
        token = create_access_token(str(u.id), extra={"role": "user"})

        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "passphrase-very-strong-q9"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["access_token"]
        assert body["refresh_token"]

        # DB 的 hash 现在非空
        db.refresh(u)
        assert u.password_hash is not None
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_too_short_password_rejected(client):
    db = SessionLocal()
    email = "pwd-short@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        token = _jwt_for(client, email, TEST_USER_PASSWORD)
        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": TEST_USER_PASSWORD, "new_password": "short"},
        )
        assert r.status_code == 422
        assert "too_short" in r.text.lower() or "too short" in r.text.lower() or "12" in r.text
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_breached_password_rejected(client):
    db = SessionLocal()
    email = "pwd-breached@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        token = _jwt_for(client, email, TEST_USER_PASSWORD)
        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": TEST_USER_PASSWORD, "new_password": "123456789012"},
        )
        assert r.status_code == 422
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_change_requires_correct_current(client):
    db = SessionLocal()
    email = "pwd-change-need-current@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        token = _jwt_for(client, email, TEST_USER_PASSWORD)
        # 没传 current
        r1 = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "passphrase-very-strong-q9"},
        )
        assert r1.status_code == 400
        # 传错 current
        r2 = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "wrong", "new_password": "passphrase-very-strong-q9"},
        )
        assert r2.status_code == 401
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_change_revokes_existing_refresh_tokens(client):
    db = SessionLocal()
    email = "pwd-change-revoke@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        # 制造 2 个 refresh tokens(模拟 2 设备)
        login1 = client.post("/api/auth/login", json={"email": email, "password": TEST_USER_PASSWORD})
        old_refresh = login1.json()["refresh_token"]
        login2 = client.post("/api/auth/login", json={"email": email, "password": TEST_USER_PASSWORD})
        token = login2.json()["access_token"]

        # 改密码
        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": TEST_USER_PASSWORD,
                  "new_password": "new-strong-passphrase-x7q"},
        )
        assert r.status_code == 200

        # 旧 refresh 失效
        r_old = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
        assert r_old.status_code == 401
    finally:
        db.query(RefreshToken).filter(
            RefreshToken.user_id.in_(
                db.query(User.id).filter(User.email == email)
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_password_change_writes_audit_log(client):
    db = SessionLocal()
    email = "pwd-audit@example.com"
    from app.models import AuditLog
    u = _make_user(db, email, password_hash=None)
    try:
        from app.security import create_access_token
        token = create_access_token(str(u.id), extra={"role": "user"})

        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "fresh-strong-passphrase-z2"},
        )
        assert r.status_code == 200

        logs = (
            db.query(AuditLog)
              .filter_by(target_id=u.id, action="password_set")
              .all()
        )
        assert len(logs) == 1
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_self_service_password.py -v`
Expected: 404 / 405(端点未实现)

- [ ] **Step 3: 加 metrics**

修改 `backend/app/metrics.py` 末尾:

```python
auth_password_changes_total = Counter(
    "auth_password_changes_total",
    "Self-service password set/change",
    labelnames=("kind",),  # set | changed
)
```

- [ ] **Step 4: 实现端点**

修改 `backend/app/api/auth.py`,在文件 imports 段加:

```python
from ..metrics import auth_password_changes_total
from ..models import AuditLog
from ..schemas.auth import PasswordChangeRequest, PasswordChangeResponse
from ..security import hash_password
from ..services import password_policy_service
from ..services import auth_service
```

在文件末尾新增 endpoint:

```python
_password_limiter_jwt = make_limiter(5, seconds=60)
_password_limiter_ip = make_limiter(10, seconds=60)


@router.post(
    "/me/password",
    response_model=PasswordChangeResponse,
    dependencies=[Depends(_password_limiter_jwt), Depends(_password_limiter_ip)],
)
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> PasswordChangeResponse:
    password_was_null = user.password_hash is None

    if not password_was_null:
        if not payload.current_password:
            raise HTTPException(400, "current_password required")
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(401, "current_password incorrect")

    err = password_policy_service.validate_password(payload.new_password, email=user.email)
    if err is not None:
        raise HTTPException(422, detail=f"password_rejected:{err}")

    user.password_hash = hash_password(payload.new_password)

    # 撤销所有现有 refresh tokens
    from ..models import RefreshToken
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete()

    # audit
    db.add(AuditLog(
        actor_user_id=user.id,
        action=("password_set" if password_was_null else "password_changed"),
        target_type="user", target_id=user.id,
        metadata_json={"password_was_null": password_was_null},
    ))
    db.commit()

    # 签一对新 token
    access = create_access_token(str(user.id), extra={"role": user.role})
    refresh, _ = auth_service.issue_refresh_token(
        db, user_id=user.id,
        user_agent=(user_agent or "")[:255] or None,
        ip=_client_ip(request),
    )

    auth_password_changes_total.labels(
        kind=("set" if password_was_null else "changed"),
    ).inc()
    log.info(
        "password_change_ok",
        user_id=user.id,
        kind=("set" if password_was_null else "changed"),
    )

    return PasswordChangeResponse(
        access_token=access,
        refresh_token=refresh,
        access_expires_in=_access_expires_in(),
    )
```

注:如果 `AuditLog.metadata_json` 字段名不同(`metadata`?),按真实名字改。

- [ ] **Step 5: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_self_service_password.py -v`
Expected: 6 个测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/auth.py backend/app/metrics.py backend/tests/test_self_service_password.py
git commit -m "feat(auth): POST /api/auth/me/password with NIST 800-63B policy"
```

---

# Self-Review

- [ ] 跑 `cd backend && .venv/bin/pytest -v` 全 suite 通过
- [ ] `ruff check backend/` 0 errors
- [ ] 对照 spec § 5.6 / § 12 第 2 条 / § 11.3 的 6 个测试,确认覆盖

Plan B 完成后可独立合入。Plan C 不依赖 Plan B(前端密码 UI 调本 Plan 暴露的端点,但 endpoint 本身可单独测)。
