"""Telegram-бот оплаты как ВЕБХУК внутри этого же бэкенда (без отдельного процесса).

main.py регистрирует POST /tg/webhook и при старте вызывает setup_webhook().
Если BOT_TOKEN не задан — модуль выключается (enabled=False), бэкенд работает как есть.

Логика идентична автономному боту в C:\\Users\\Lenovo\\tg_pay, но обновления приходят
от Telegram по вебхуку, а не через long polling.
"""
import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone

from dateutil.relativedelta import relativedelta
from supabase import create_client

log = logging.getLogger("tgbot")

# ── окружение ────────────────────────────────────────────────────────────────
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_IDS", "").replace(" ", "").split(",") if x}
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # тот же service_role, что и у бэкенда
# Публичный адрес сервиса: Render задаёт RENDER_EXTERNAL_URL автоматически.
PUBLIC_URL = (
    os.getenv("RENDER_EXTERNAL_URL")
    or os.getenv("PUBLIC_BACKEND_URL")
    or "https://fitness-app-backend-4q04.onrender.com"
).rstrip("/")

enabled = bool(BOT_TOKEN and SUPABASE_URL and SUPABASE_KEY)

WEBHOOK_PATH = "/tg/webhook"
WEBHOOK_SECRET = hashlib.sha256(BOT_TOKEN.encode()).hexdigest()[:48] if BOT_TOKEN else None

# ── тарифы (синхронно с frontend/src/config/billing.ts) ──────────────────────
TRAINER_PLANS = {
    "m1":  {"label": "Тренер · 1 месяц",   "months": 1,  "uah": 100,  "stars": 190},
    "m3":  {"label": "Тренер · 3 месяца",  "months": 3,  "uah": 250,  "stars": 470},
    "m6":  {"label": "Тренер · 6 месяцев", "months": 6,  "uah": 500,  "stars": 940},
    "m12": {"label": "Тренер · 1 год",     "months": 12, "uah": 1100, "stars": 2080},
}
AI_PLANS = {
    "p50":   {"label": "ИИ-чат · 50 вопросов/день",  "uah": 50,  "stars": 95},
    "p150":  {"label": "ИИ-чат · 150 вопросов/день", "uah": 150, "stars": 285},
    "unlim": {"label": "ИИ-чат · безлимит",          "uah": 249, "stars": 470},
}


def plan_info(kind, plan):
    if kind == "trainer":
        return TRAINER_PLANS.get(plan)
    if kind == "ai":
        return AI_PLANS.get(plan)
    return None


def parse_start_payload(arg):
    """'trainer-m1-<uuid>' → (kind, plan, user_id) или None. userId — UUID с дефисами."""
    if not arg:
        return None
    parts = arg.split("-", 2)
    if len(parts) != 3:
        return None
    kind, plan, user_id = parts
    if not plan_info(kind, plan) or user_id == "anon":
        return None
    try:
        uuid.UUID(user_id)
    except ValueError:
        return None
    return kind, plan, user_id


# ── Supabase (service_role, минует RLS) ──────────────────────────────────────
_sb = create_client(SUPABASE_URL, SUPABASE_KEY) if (SUPABASE_URL and SUPABASE_KEY) else None


def _now():
    return datetime.now(timezone.utc)


def _parse(ts):
    dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _profile_field(user_id, field):
    res = _sb.table("profiles").select(field).eq("id", user_id).limit(1).execute()
    return res.data[0].get(field) if res.data else None


def _base_from(current_ts):
    base = _now()
    if current_ts:
        cur = _parse(current_ts)
        if cur > base:
            base = cur
    return base


def profile_exists(user_id):
    res = _sb.table("profiles").select("id").eq("id", user_id).limit(1).execute()
    return bool(res.data)


def grant_trainer(user_id, months):
    new_until = _base_from(_profile_field(user_id, "trainer_until")) + relativedelta(months=months)
    _sb.table("profiles").update({"trainer_until": new_until.isoformat()}).eq("id", user_id).execute()
    return new_until


def grant_ai(user_id, plan):
    new_until = _base_from(_profile_field(user_id, "ai_until")) + relativedelta(months=1)
    _sb.table("profiles").update({"ai_plan": plan, "ai_until": new_until.isoformat()}).eq("id", user_id).execute()
    return new_until


def is_duplicate_charge(charge_id):
    res = _sb.table("payments").select("id").eq("telegram_payment_charge_id", charge_id).limit(1).execute()
    return bool(res.data)


def record_payment(user_id, tg_user_id, kind, plan, stars, charge_id, status="paid"):
    _sb.table("payments").insert({
        "user_id": user_id, "tg_user_id": tg_user_id, "kind": kind, "plan": plan,
        "stars": stars, "telegram_payment_charge_id": charge_id, "status": status,
    }).execute()


def get_payment(charge_id):
    res = _sb.table("payments").select("*").eq("telegram_payment_charge_id", charge_id).limit(1).execute()
    return res.data[0] if res.data else None


def mark_refunded(charge_id):
    _sb.table("payments").update({"status": "refunded"}).eq("telegram_payment_charge_id", charge_id).execute()


# ── aiogram (создаём только если бот включён) ────────────────────────────────
bot = None
dp = None

if enabled:
    from aiogram import Bot, Dispatcher, F, Router
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode
    from aiogram.filters import Command, CommandObject, CommandStart
    from aiogram.types import (
        InlineKeyboardButton,
        InlineKeyboardMarkup,
        LabeledPrice,
        Message,
        PreCheckoutQuery,
        Update,
    )

    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    router = Router()

    def _return_kb(kind):
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🏠 Вернуться в приложение", url=f"{PUBLIC_URL}/open?kind={kind}")
        ]])

    def _overview():
        lines = ["<b>Тарифы</b>", "", "<b>Роль «Тренер»</b>"]
        for p in TRAINER_PLANS.values():
            lines.append(f"• {p['label']} — {p['uah']}₴ ({p['stars']} ⭐)")
        lines += ["", "<b>ИИ-чат</b> (лимит вопросов/день)"]
        for p in AI_PLANS.values():
            lines.append(f"• {p['label']} — {p['uah']}₴ ({p['stars']} ⭐)")
        return "\n".join(lines)

    async def _notify_admin(text):
        for admin_id in ADMIN_IDS:
            try:
                await bot.send_message(admin_id, text)
            except Exception:
                log.exception("notify admin %s failed", admin_id)

    @router.message(CommandStart())
    async def on_start(message: "Message", command: "CommandObject"):
        parsed = parse_start_payload(command.args)
        if not parsed:
            await message.answer(
                "Привет! Оплата подписки открывается прямо из приложения — нажмите кнопку "
                "оплаты на нужном тарифе, и Telegram вернёт вас сюда уже со счётом.\n\n" + _overview()
            )
            return
        kind, plan, user_id = parsed
        if not profile_exists(user_id):
            await message.answer("Профиль не найден. Войдите в приложение и нажмите кнопку оплаты ещё раз.")
            return
        info = plan_info(kind, plan)
        await message.answer_invoice(
            title=info["label"],
            description=f"Доступ активируется в приложении сразу после оплаты (ориентир {info['uah']}₴).",
            payload=f"{kind}:{plan}:{user_id}",
            currency="XTR",
            prices=[LabeledPrice(label=info["label"], amount=info["stars"])],
            provider_token="",
            start_parameter=f"{kind}-{plan}",
        )

    @router.pre_checkout_query()
    async def on_pre_checkout(query: "PreCheckoutQuery"):
        ok = True
        try:
            kind, plan, user_id = query.invoice_payload.split(":", 2)
            ok = bool(plan_info(kind, plan)) and user_id != "anon"
            uuid.UUID(user_id)
        except Exception:
            ok = False
        await query.answer(ok=ok, error_message=None if ok else "Платёж отклонён. Откройте оплату из приложения.")

    @router.message(F.successful_payment)
    async def on_successful_payment(message: "Message"):
        sp = message.successful_payment
        charge_id = sp.telegram_payment_charge_id
        stars = sp.total_amount
        try:
            kind, plan, user_id = sp.invoice_payload.split(":", 2)
        except ValueError:
            await _notify_admin(f"⚠️ Битый payload charge={charge_id} payload={sp.invoice_payload}")
            await message.answer("Оплата получена, но возникла ошибка. Мы уже разбираемся.")
            return

        if is_duplicate_charge(charge_id):
            await message.answer("Этот платёж уже обработан ✅", reply_markup=_return_kb(kind))
            return

        try:
            if kind == "trainer":
                until = grant_trainer(user_id, TRAINER_PLANS[plan]["months"])
                human = f"Роль «Тренер» активна до {until:%d.%m.%Y}"
            else:
                until = grant_ai(user_id, plan)
                human = f"Подписка ИИ-чата ({plan}) активна до {until:%d.%m.%Y}"
            record_payment(user_id, message.from_user.id, kind, plan, stars, charge_id)
        except Exception as exc:
            log.exception("grant failed")
            await _notify_admin(
                f"❗️Оплата получена, начисление НЕ прошло.\ncharge={charge_id}\nuser_id={user_id}\n"
                f"kind={kind} plan={plan} stars={stars}\nОшибка: {exc}\nВыдай доступ вручную."
            )
            await message.answer("Оплата получена ✅ Активация задержалась — доступ откроется в течение часа.")
            return

        await message.answer(
            f"Оплачено! {human}.\n\nВернитесь в приложение — доступ уже открыт "
            "(если нет, нажмите «Я оплатил — проверить»).",
            reply_markup=_return_kb(kind),
        )

    @router.message(Command("refund"))
    async def on_refund(message: "Message", command: "CommandObject"):
        if message.from_user.id not in ADMIN_IDS:
            return
        charge_id = (command.args or "").strip()
        if not charge_id:
            await message.answer("Использование: /refund <telegram_payment_charge_id>")
            return
        pay = get_payment(charge_id)
        if not pay:
            await message.answer("Платёж с таким charge_id не найден.")
            return
        try:
            await bot.refund_star_payment(user_id=pay["tg_user_id"], telegram_payment_charge_id=charge_id)
            mark_refunded(charge_id)
            await message.answer("Возврат проведён ✅ При необходимости скорректируй срок подписки в Supabase.")
        except Exception as exc:
            await message.answer(f"Не удалось вернуть: {exc}")

    @router.message(Command("help"))
    async def on_help(message: "Message"):
        await message.answer("Бот принимает оплату подписок приложения через Telegram Stars.\n\n" + _overview())

    dp.include_router(router)

    async def setup_webhook():
        url = f"{PUBLIC_URL}{WEBHOOK_PATH}"
        await bot.set_webhook(
            url,
            secret_token=WEBHOOK_SECRET,
            drop_pending_updates=False,
            allowed_updates=["message", "pre_checkout_query"],
        )
        log.info("Telegram webhook установлен: %s", url)

    async def feed(data: dict):
        update = Update.model_validate(data, context={"bot": bot})
        await dp.feed_update(bot, update)
