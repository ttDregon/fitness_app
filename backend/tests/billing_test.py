"""Тест Премиума (Google Play Billing) без сети: Supabase — таблицы в памяти, Google Play
Developer API и DeepSeek подменены заглушками, .env не читается.

Запуск из корня репозитория:   python backend/tests/billing_test.py
Проверяет: покупку → Премиум в профиле и подтверждение (acknowledge), повышенный лимит ИИ,
защиту от «чужого» токена и токена с другого аккаунта, ожидающий платёж, продление и
отмену/возврат при /billing/status, ручную выдачу, работу без ключа Google (503).
Код возврата 0 = всё прошло."""
import json
import os
import sys
import types
from datetime import datetime, timezone, timedelta

backend = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend)

import dotenv  # noqa: E402

dotenv.load_dotenv = lambda *a, **k: False
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "test"
os.environ["DEEPSEEK_API_KEY"] = "test"
os.environ.pop("SUPABASE_JWT_SECRET", None)
os.environ.pop("BOT_TOKEN", None)
os.environ.pop("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", None)

try:
    import dateutil.relativedelta  # noqa: F401
except ImportError:
    _du = types.ModuleType("dateutil")
    _rd = types.ModuleType("dateutil.relativedelta")
    _rd.relativedelta = object
    sys.modules["dateutil"] = _du
    sys.modules["dateutil.relativedelta"] = _rd

# --- Supabase в памяти: ровно те операции, которыми пользуется бэкенд ---
import supabase as _sb  # noqa: E402

DB = {"profiles": [], "billing_purchases": [], "ai_usage": []}


class _Res:
    def __init__(self, data=None):
        self.data = data


class _Q:
    def __init__(self, table):
        self.t, self.filters, self.op, self.payload = table, [], "select", None
        self.single, self.lim, self.on_conflict = False, None, None

    def select(self, *a, **k):
        self.op = "select"
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def in_(self, col, vals):
        self.filters.append((col, ("__in__", tuple(vals))))
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self.lim = n
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def upsert(self, row, on_conflict=None):
        self.op, self.payload, self.on_conflict = "upsert", row, on_conflict
        return self

    def update(self, vals):
        self.op, self.payload = "update", vals
        return self

    def _match(self, r):
        for c, v in self.filters:
            if isinstance(v, tuple) and v and v[0] == "__in__":
                if r.get(c) not in v[1]:
                    return False
            elif r.get(c) != v:
                return False
        return True

    def execute(self):
        rows = DB.setdefault(self.t, [])
        match = [r for r in rows if self._match(r)]
        if self.op == "select":
            out = match[: self.lim] if self.lim else match
            if self.single:
                return _Res(dict(out[0]) if out else None)
            return _Res([dict(r) for r in out])
        if self.op == "insert":
            rows.append(dict(self.payload))
            return _Res([dict(self.payload)])
        if self.op == "upsert":
            key = self.on_conflict
            ex = [r for r in rows if r.get(key) == self.payload.get(key)]
            if ex:
                ex[0].update(self.payload)
            else:
                rows.append(dict(self.payload))
            return _Res([dict(self.payload)])
        if self.op == "update":
            for r in match:
                r.update(self.payload)
            return _Res([dict(r) for r in match])
        return _Res(None)


class _Client:
    def table(self, name):
        return _Q(name)


_sb.create_client = lambda *a, **k: _Client()

import main  # noqa: E402
import billing  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402


# --- DeepSeek: короткий валидный ответ чата ---
class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)


class _Resp:
    def __init__(self, content):
        self.choices = [_Choice(content)]


main.client.chat.completions.create = lambda **kw: _Resp(json.dumps({
    "reply": "ок", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "workout_plan": None,
}))

# --- Google Play Developer API ---
NOW = datetime.now(timezone.utc)
GOOGLE = {}
ACKED = []


def sub(state, days, plan="monthly", account="u1", ack="ACKNOWLEDGEMENT_STATE_PENDING", auto=True):
    return {
        "subscriptionState": state,
        "acknowledgementState": ack,
        "latestOrderId": "GPA.0000-0000-0000-00000",
        "externalAccountIdentifiers": {"obfuscatedExternalAccountId": account} if account else {},
        "lineItems": [{
            "productId": billing.PREMIUM_PRODUCT_ID,
            "expiryTime": (NOW + timedelta(days=days)).isoformat().replace("+00:00", "Z"),
            "autoRenewingPlan": {"autoRenewEnabled": auto},
            "offerDetails": {"basePlanId": plan},
        }],
    }


def fake_fetch(token):
    v = GOOGLE.get(token)
    if v is None:
        raise billing.BillingError("google 404: not found", 404)
    return v


billing.fetch_subscription = fake_fetch
billing.acknowledge = lambda token, product_id: ACKED.append(token)

c = TestClient(main.app)
ok = True


def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name, extra)
    ok = ok and cond


def profile(uid):
    return next(r for r in DB["profiles"] if r["id"] == uid)


def reset():
    DB["profiles"][:] = [
        {"id": "u1", "name": "Тест", "goal": "lose", "premium_until": None, "premium_plan": None, "premium_source": None},
        {"id": "u2", "name": "Второй", "premium_until": None, "premium_plan": None, "premium_source": None},
        {"id": "u3", "name": "Подарок", "premium_until": (NOW + timedelta(days=10)).isoformat(), "premium_plan": "monthly", "premium_source": "manual"},
    ]
    DB["billing_purchases"][:] = []
    DB["ai_usage"][:] = [{"user_id": "u1", "day": main._today(), "chat": 30, "meal": 0, "workout": 0, "plan": 0}]
    GOOGLE.clear()
    ACKED.clear()
    main._PREMIUM_CACHE.clear()


chat_body = {"messages": [{"role": "user", "content": "привет"}], "user_id": "u1"}

# 0) без ключа Google: verify честно говорит «недоступно», статус — бесплатный
reset()
billing.enabled = False
r = c.post("/billing/verify", json={"purchase_token": "tok-a", "user_id": "u1"})
check("verify without Google key -> 503", r.status_code == 503 and r.json()["status"] == "unavailable", r.text[:200])
r = c.post("/billing/status", json={"user_id": "u1"})
check("status without Google key -> free", r.status_code == 200 and r.json()["premium"] is False and r.json()["billing"] is False, r.text[:200])
billing.enabled = True

# 1) бесплатный пользователь упирается в лимит чата и узнаёт, что Премиума нет
r = c.post("/chat", json=chat_body)
j = r.json()
check("free chat limit", j.get("limit_reached") is True and j.get("limit") == 30 and j.get("premium") is False, r.text[:200])
check("limit response keeps old-client fields", all(k in j for k in ("reply", "calories", "protein", "fat", "carbs")))

# 2) покупка: Google говорит ACTIVE → Премиум в профиле, покупка подтверждена
GOOGLE["tok-a"] = sub("SUBSCRIPTION_STATE_ACTIVE", 30)
r = c.post("/billing/verify", json={"purchase_token": "tok-a", "product_id": billing.PREMIUM_PRODUCT_ID, "user_id": "u1"})
j = r.json()
check("verify active", r.status_code == 200 and j["status"] == "active" and j["premium"] is True, r.text[:300])
check("verify acknowledged", j["acknowledged"] is True and ACKED == ["tok-a"])
check("verify plan + limits", j["plan"] == "monthly" and j["limits"] == {"chat": main.AI_PREMIUM_CHAT, "parse": main.AI_PREMIUM_PARSE}, str(j))
check("profile premium written", profile("u1")["premium_source"] == "google_play" and profile("u1")["premium_until"])
check("purchase stored", len(DB["billing_purchases"]) == 1 and DB["billing_purchases"][0]["user_id"] == "u1")

# 3) с Премиумом тот же расход (30) уже не упирается в лимит
r = c.post("/chat", json=chat_body)
check("premium chat passes free cap", r.status_code == 200 and not r.json().get("limit_reached") and r.json().get("reply") == "ок", r.text[:200])

# 4) повторный verify (перезапуск приложения) не подтверждает второй раз
GOOGLE["tok-a"] = sub("SUBSCRIPTION_STATE_ACTIVE", 30, ack="ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
r = c.post("/billing/verify", json={"purchase_token": "tok-a", "user_id": "u1"})
check("re-verify idempotent", r.json()["status"] == "active" and ACKED == ["tok-a"], r.text[:200])

# 5) тот же токен с другого аккаунта Striva — нельзя
r = c.post("/billing/verify", json={"purchase_token": "tok-a", "user_id": "u2"})
check("token bound to first account", r.json()["status"] == "foreign" and r.json()["premium"] is False, r.text[:200])
check("u2 stays free", profile("u2")["premium_until"] is None)

# 6) токен куплен на другом аккаунте (obfuscatedAccountId не совпадает)
GOOGLE["tok-b"] = sub("SUBSCRIPTION_STATE_ACTIVE", 30, account="u1")
r = c.post("/billing/verify", json={"purchase_token": "tok-b", "user_id": "u2"})
check("account id mismatch -> foreign", r.json()["status"] == "foreign" and profile("u2")["premium_until"] is None, r.text[:200])

# 7) отложенный платёж (наличные и т.п.) — доступ не даём, пока не оплачен
GOOGLE["tok-p"] = sub("SUBSCRIPTION_STATE_PENDING", 30, account="u2")
r = c.post("/billing/verify", json={"purchase_token": "tok-p", "user_id": "u2"})
check("pending -> no premium", r.json()["status"] == "pending" and r.json()["premium"] is False, r.text[:200])

# 8) несуществующий токен и чужой товар
r = c.post("/billing/verify", json={"purchase_token": "tok-x", "user_id": "u2"})
check("unknown token -> invalid", r.status_code == 200 and r.json()["status"] == "invalid", r.text[:200])
r = c.post("/billing/verify", json={"purchase_token": "tok-x", "product_id": "other", "user_id": "u2"})
check("other product -> 400", r.status_code == 400)
r = c.post("/billing/verify", json={"purchase_token": "", "user_id": "u2"})
check("empty token -> 400", r.status_code == 400)

# 9) продление: срок в БД истёк, Google уже продлил → /billing/status подтягивает новый срок
row = DB["billing_purchases"][0]
row["expiry_time"] = (NOW - timedelta(minutes=5)).isoformat()
row["checked_at"] = (NOW - timedelta(hours=1)).isoformat()
profile("u1")["premium_until"] = row["expiry_time"]
main._PREMIUM_CACHE.clear()
GOOGLE["tok-a"] = sub("SUBSCRIPTION_STATE_ACTIVE", 60, ack="ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
r = c.post("/billing/status", json={"user_id": "u1"})
j = r.json()
until = main._parse_dt(j.get("premium_until")) if j.get("premium_until") else None
check("renewal picked up by status", j["premium"] is True and until and until > NOW + timedelta(days=50), r.text[:300])

# 10) только что проверенную подписку повторно у Google не дёргаем
calls = []
billing.fetch_subscription = lambda t: calls.append(t) or fake_fetch(t)
c.post("/billing/status", json={"user_id": "u1"})
check("fresh purchase not rechecked", calls == [], str(calls))

# 11) возврат денег / отзыв: через STALE_AFTER статус перепроверяется и Премиум снимается
DB["billing_purchases"][0]["checked_at"] = (NOW - billing.STALE_AFTER - timedelta(minutes=1)).isoformat()
GOOGLE["tok-a"] = sub("SUBSCRIPTION_STATE_EXPIRED", -1, ack="ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
r = c.post("/billing/status", json={"user_id": "u1"})
check("refund revokes premium", r.json()["premium"] is False and profile("u1")["premium_until"] is None, r.text[:300])
billing.fetch_subscription = fake_fetch

# 12) отменённая подписка (автопродление выключено) работает до конца оплаченного срока
reset()
GOOGLE["tok-c"] = sub("SUBSCRIPTION_STATE_CANCELED", 5, plan="yearly", auto=False)
r = c.post("/billing/verify", json={"purchase_token": "tok-c", "user_id": "u1"})
j = r.json()
check("canceled still active till expiry", j["premium"] is True and j["plan"] == "yearly" and j["auto_renewing"] is False, r.text[:300])

# 13) ручная выдача (premium_source=manual) не затирается пересчётом
r = c.post("/billing/status", json={"user_id": "u3"})
check("manual grant kept", r.json()["premium"] is True and profile("u3")["premium_source"] == "manual", r.text[:200])

# 14) лимит разбора для Премиума тоже повышен, а в ответе на лимит есть флаг premium
reset()
DB["ai_usage"][0]["meal"] = main.AI_FREE_PARSE
r = c.post("/parse_meals", json={"text": "овсянка", "user_id": "u1"})
check("free parse limit flag", r.json().get("status") == "limit_reached" and r.json().get("premium") is False, r.text[:200])

# 15) OAuth сервисного аккаунта: JWT подписан RS256 ключом из JSON, токен кэшируется
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
import jwt as _jwt  # noqa: E402

_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_pem = _key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
billing._SA = {"client_email": "striva@test.iam.gserviceaccount.com", "private_key": _pem, "token_uri": "https://oauth2.googleapis.com/token"}
billing._token_cache.update({"value": None, "exp": 0.0})
_posts = []


class _HttpResp:
    status_code = 200

    def json(self):
        return {"access_token": "ya29.test", "expires_in": 3599}


def _fake_post(url, data=None, timeout=None):
    _posts.append((url, data))
    return _HttpResp()


billing.httpx.post = _fake_post
tok1, tok2 = billing._access_token(), billing._access_token()
claims = _jwt.decode(_posts[0][1]["assertion"], _key.public_key(), algorithms=["RS256"], audience="https://oauth2.googleapis.com/token")
check("oauth jwt signed + cached", tok1 == tok2 == "ya29.test" and len(_posts) == 1 and claims["scope"].endswith("androidpublisher") and claims["iss"] == billing._SA["client_email"], str(claims))

print("ALL OK" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
