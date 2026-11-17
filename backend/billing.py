"""Striva Премиум — подписка через Google Play Billing, проверка на сервере.

Как это работает:
1. Приложение покупает подписку через Google Play (expo-iap) и шлёт сюда purchaseToken.
2. Бэкенд сам спрашивает у Google Play Developer API статус этого токена (клиенту не верим),
   подтверждает покупку (acknowledge — без него Google вернёт деньги через 3 дня) и пишет
   срок доступа в profiles.premium_until.
3. Продление/отмена/возврат: при каждом GET /billing/status бэкенд перепроверяет токен у Google,
   если срок истёк или с прошлой проверки прошло больше STALE_AFTER. Отдельный Pub/Sub (RTDN)
   не нужен.

Включается, когда на Render задан GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (содержимое JSON-ключа
сервисного аккаунта с доступом к заказам в Play Console). Без него /billing/verify отвечает
503 «unavailable», остальное приложение работает как раньше.
"""
import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
import jwt

PACKAGE_NAME = os.getenv("PLAY_PACKAGE_NAME", "com.ttdregon.mysafeapp")
# Одна подписка в Play Console с тремя базовыми планами: monthly (P1M), quarterly (P3M), yearly (P1Y).
PREMIUM_PRODUCT_ID = os.getenv("PLAY_PREMIUM_PRODUCT_ID", "striva_premium")

# Перепроверять подписку у Google не чаще, чем раз в STALE_AFTER (ловит отмену и возврат денег).
STALE_AFTER = timedelta(hours=12)

# Состояния, при которых доступ есть (до expiryTime). CANCELED = автопродление выключено,
# но оплаченный период ещё идёт; IN_GRACE_PERIOD = Google пытается списать оплату повторно.
ENTITLED_STATES = {
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_CANCELED",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
}

_API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
_SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def _load_service_account():
    raw = os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        return None
    try:
        sa = json.loads(raw)
        if sa.get("client_email") and sa.get("private_key"):
            return sa
    except Exception:
        pass
    logging.error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON задан, но это не JSON-ключ сервисного аккаунта")
    return None


_SA = _load_service_account()
enabled = _SA is not None

_token_cache = {"value": None, "exp": 0.0}


class BillingError(Exception):
    """Google ответил ошибкой или недоступен. status — HTTP-код Google (или 0 при сетевой ошибке)."""

    def __init__(self, message, status=0):
        super().__init__(message)
        self.status = status


def _access_token() -> str:
    """OAuth-токен сервисного аккаунта (JWT-bearer), кэшируется ~на час."""
    now = time.time()
    if _token_cache["value"] and _token_cache["exp"] - 60 > now:
        return _token_cache["value"]
    token_uri = _SA.get("token_uri") or "https://oauth2.googleapis.com/token"
    assertion = jwt.encode(
        {"iss": _SA["client_email"], "scope": _SCOPE, "aud": token_uri,
         "iat": int(now), "exp": int(now) + 3600},
        _SA["private_key"], algorithm="RS256",
    )
    try:
        r = httpx.post(token_uri, data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion,
        }, timeout=15)
    except httpx.HTTPError as e:
        raise BillingError(f"oauth network error: {e}")
    if r.status_code != 200:
        raise BillingError(f"oauth {r.status_code}: {r.text[:200]}", r.status_code)
    data = r.json()
    _token_cache["value"] = data["access_token"]
    _token_cache["exp"] = now + int(data.get("expires_in", 3600))
    return _token_cache["value"]


def _google(method: str, url: str):
    try:
        r = httpx.request(method, url, headers={"Authorization": f"Bearer {_access_token()}"},
                          json={} if method == "POST" else None, timeout=20)
    except httpx.HTTPError as e:
        raise BillingError(f"google network error: {e}")
    if r.status_code >= 400:
        raise BillingError(f"google {r.status_code}: {r.text[:300]}", r.status_code)
    return r.json() if r.content else {}


def fetch_subscription(purchase_token: str) -> dict:
    """purchases.subscriptionsv2.get — актуальный статус подписки по токену."""
    return _google("GET", f"{_API}/{PACKAGE_NAME}/purchases/subscriptionsv2/tokens/{purchase_token}")


def acknowledge(purchase_token: str, product_id: str):
    _google("POST", f"{_API}/{PACKAGE_NAME}/purchases/subscriptions/{product_id}/tokens/{purchase_token}:acknowledge")


def parse_time(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def entitlement(sub: dict) -> dict:
    """Что даёт ответ Google: {active, until, plan, auto_renewing, state, pending_ack, account_id, test}."""
    state = sub.get("subscriptionState") or ""
    items = [li for li in (sub.get("lineItems") or []) if li.get("productId") == PREMIUM_PRODUCT_ID]
    until, plan, auto = None, None, False
    for li in items:
        exp = parse_time(li.get("expiryTime"))
        if exp and (until is None or exp > until):
            until = exp
            plan = (li.get("offerDetails") or {}).get("basePlanId")
            auto = bool((li.get("autoRenewingPlan") or {}).get("autoRenewEnabled"))
    now = datetime.now(timezone.utc)
    active = state in ENTITLED_STATES and until is not None and until > now
    return {
        "active": active,
        "until": until,
        "plan": plan,
        "auto_renewing": auto and state != "SUBSCRIPTION_STATE_CANCELED",
        "state": state,
        "pending_ack": sub.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_PENDING",
        "account_id": (sub.get("externalAccountIdentifiers") or {}).get("obfuscatedExternalAccountId"),
        "linked_token": sub.get("linkedPurchaseToken"),
        "order_id": sub.get("latestOrderId"),
        "test": "testPurchase" in sub,
    }
