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

# Куда ведёт кнопка «Скачать»: лендинг с инструкцией установки (он сам тянет ссылку на APK
# из env APP_DOWNLOAD_URL). Всегда https — Telegram другого в кнопках не принимает.
DOWNLOAD_PAGE = f"{PUBLIC_URL}/download"
AI_FREE_CHAT_PER_DAY = 10  # синхронно с frontend/src/config/billing.ts

# ── тарифы (синхронно с frontend/src/config/billing.ts) ──────────────────────
TRAINER_PLANS = {
    "m1":  {"label": "Тренер · 1 месяц",   "months": 1,  "usd": 2,  "stars": 190},
    "m3":  {"label": "Тренер · 3 месяца",  "months": 3,  "usd": 5,  "stars": 470},
    "m6":  {"label": "Тренер · 6 месяцев", "months": 6,  "usd": 9,  "stars": 855},
    "m12": {"label": "Тренер · 1 год",     "months": 12, "usd": 16, "stars": 1520},
}
AI_PLANS = {
    "p50":   {"label": "ИИ-чат · 50 вопросов/день",  "usd": 1, "stars": 95},
    "p150":  {"label": "ИИ-чат · 150 вопросов/день", "usd": 3, "stars": 285},
    "unlim": {"label": "ИИ-чат · безлимит",          "usd": 5, "stars": 470},
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


def link_tg(tg_user_id, user_id):
    """Связываем Telegram-аккаунт с профилем приложения (best-effort).
    Нужно, чтобы кнопки «Тарифы» в самом боте могли выставить счёт даже без deep-link из
    приложения. Если таблицы tg_links ещё нет — молча пропускаем (см. subscriptions.sql)."""
    try:
        _sb.table("tg_links").upsert(
            {"tg_user_id": tg_user_id, "user_id": user_id, "updated_at": _now().isoformat()},
            on_conflict="tg_user_id",
        ).execute()
    except Exception:
        log.debug("tg_links upsert пропущен", exc_info=True)


def resolve_user_id(tg_user_id):
    """Находим Supabase user_id по Telegram id: сначала tg_links, затем последний платёж.
    Возвращает None, если пользователь ещё ни разу не связывал аккаунт из приложения."""
    try:
        res = _sb.table("tg_links").select("user_id").eq("tg_user_id", tg_user_id).limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        log.debug("tg_links lookup пропущен", exc_info=True)
    try:
        res = _sb.table("payments").select("user_id").eq("tg_user_id", tg_user_id).limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        log.debug("payments lookup пропущен", exc_info=True)
    return None


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
        CallbackQuery,
        InlineKeyboardButton,
        InlineKeyboardMarkup,
        KeyboardButton,
        LabeledPrice,
        Message,
        PreCheckoutQuery,
        ReplyKeyboardMarkup,
        Update,
    )

    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    router = Router()

    # ── тексты ────────────────────────────────────────────────────────────────
    WELCOME = (
        "👋 Привет! Это <b>Striva</b> — умный дневник тела, питания и тренировок.\n\n"
        "🍎 Пишешь словами что съел — ИИ сам считает КБЖУ\n"
        "🏋️ Конструктор тренировок и журнал занятий\n"
        "💧 Вода, вес и прогресс — на одном экране\n"
        "🤝 Клубы: тренер ведёт клиентов, расписание и задания\n\n"
        "Личный трекинг — <b>бесплатно</b>. Через этот бот скачивается приложение и "
        "оформляется подписка (роль «Тренер» и расширенный ИИ-чат).\n\n"
        "Нажми «⬇️ Установить приложение», а все тарифы — на кнопке 💎."
    )
    DOWNLOAD_TEXT = (
        "⬇️ <b>Установка Striva</b> (Android)\n\n"
        "1. Нажмите кнопку ниже и скачайте файл <code>.apk</code>\n"
        "2. Откройте его на телефоне и разрешите установку из этого источника\n"
        "3. Войдите или зарегистрируйтесь — и всё готово\n\n"
        "iOS-версия — в разработке."
    )
    TARIFFS_TEXT = (
        "💎 <b>Тарифы</b>\n\n"
        "<b>Роль «Тренер»</b> — клубы, клиенты, расписание и задания. "
        "Разовая оплата за период, без автопродления.\n"
        f"<b>ИИ-чат</b> — снимает дневной лимит вопросов к ИИ-тренеру "
        f"(бесплатно {AI_FREE_CHAT_PER_DAY}/день).\n\n"
        "Выберите тариф — оплата в Telegram Stars ⭐:"
    )
    HELP_TEXT = (
        "🆘 <b>Помощь</b>\n\n"
        "• 💎 <b>Тарифы</b> — оформить подписку (оплата в Telegram Stars).\n"
        "• ⬇️ <b>Скачать</b> — установить приложение на Android.\n"
        "• 🏠 <b>О приложении</b> — что такое Striva.\n\n"
        "После оплаты доступ открывается в приложении автоматически; если нет — "
        "нажмите «Я оплатил — проверить» внутри приложения.\n\n"
        "Оплату можно начать и из приложения (кнопка «Оплатить» на тарифе) — "
        "бот вернёт вас туда уже со счётом."
    )

    # ── клавиатуры ──────────────────────────────────────────────────────────────
    def _return_kb(kind):
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🏠 Вернуться в приложение", url=f"{PUBLIC_URL}/open?kind={kind}")
        ]])

    def _nav_kb():
        """Нижнее меню (заменяет обычную клавиатуру) — постоянная навигация по боту."""
        return ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text="💎 Тарифы"), KeyboardButton(text="⬇️ Скачать")],
                [KeyboardButton(text="🏠 О приложении"), KeyboardButton(text="🆘 Помощь")],
            ],
            resize_keyboard=True,
            is_persistent=True,
            input_field_placeholder="Выберите раздел…",
        )

    def _welcome_kb():
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⬇️ Установить приложение", url=DOWNLOAD_PAGE)],
            [InlineKeyboardButton(text="💎 Тарифы", callback_data="menu:tariffs")],
        ])

    def _download_kb():
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="⬇️ Скачать приложение", url=DOWNLOAD_PAGE)
        ]])

    def _tariffs_kb():
        rows = [[InlineKeyboardButton(
            text=f"🏋️ {p['label']} — ${p['usd']} · {p['stars']}⭐",
            callback_data=f"buy:trainer:{pid}")] for pid, p in TRAINER_PLANS.items()]
        rows += [[InlineKeyboardButton(
            text=f"🤖 {p['label']} — ${p['usd']} · {p['stars']}⭐",
            callback_data=f"buy:ai:{pid}")] for pid, p in AI_PLANS.items()]
        rows.append([InlineKeyboardButton(text="⬇️ Установить приложение", url=DOWNLOAD_PAGE)])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    async def _notify_admin(text):
        for admin_id in ADMIN_IDS:
            try:
                await bot.send_message(admin_id, text)
            except Exception:
                log.exception("notify admin %s failed", admin_id)

    async def _send_invoice(chat_id, kind, plan, user_id):
        info = plan_info(kind, plan)
        await bot.send_invoice(
            chat_id=chat_id,
            title=info["label"],
            description=f"Доступ активируется в приложении сразу после оплаты (ориентир ${info['usd']}).",
            payload=f"{kind}:{plan}:{user_id}",
            currency="XTR",
            prices=[LabeledPrice(label=info["label"], amount=info["stars"])],
            provider_token="",
            start_parameter=f"{kind}-{plan}",
        )

    @router.message(CommandStart())
    async def on_start(message: "Message", command: "CommandObject"):
        parsed = parse_start_payload(command.args)
        # Приход из приложения (deep-link с userId) — сразу счёт, как и раньше.
        if parsed:
            kind, plan, user_id = parsed
            if not profile_exists(user_id):
                await message.answer("Профиль не найден. Войдите в приложение и нажмите кнопку оплаты ещё раз.")
                return
            link_tg(message.from_user.id, user_id)  # запоминаем связь для будущих продлений из бота
            await _send_invoice(message.chat.id, kind, plan, user_id)
            return
        # Обычный вход в бота — приветствие + нижнее меню навигации.
        await message.answer(WELCOME, reply_markup=_welcome_kb())
        await message.answer("👇 Меню навигации всегда внизу.", reply_markup=_nav_kb())

    # ── навигация (нижнее меню) ──────────────────────────────────────────────
    @router.message(F.text == "🏠 О приложении")
    async def nav_about(message: "Message"):
        await message.answer(WELCOME, reply_markup=_welcome_kb())

    @router.message(F.text.in_({"⬇️ Скачать", "⬇️ Скачать приложение"}))
    async def nav_download(message: "Message"):
        await message.answer(DOWNLOAD_TEXT, reply_markup=_download_kb())

    @router.message(F.text == "💎 Тарифы")
    async def nav_tariffs(message: "Message"):
        await message.answer(TARIFFS_TEXT, reply_markup=_tariffs_kb())

    @router.message(F.text == "🆘 Помощь")
    async def nav_help_btn(message: "Message"):
        await message.answer(HELP_TEXT, reply_markup=_nav_kb())

    @router.message(Command("tariffs"))
    async def cmd_tariffs(message: "Message"):
        await message.answer(TARIFFS_TEXT, reply_markup=_tariffs_kb())

    @router.message(Command("download"))
    async def cmd_download(message: "Message"):
        await message.answer(DOWNLOAD_TEXT, reply_markup=_download_kb())

    # ── инлайн-кнопки ────────────────────────────────────────────────────────
    @router.callback_query(F.data == "menu:tariffs")
    async def cb_tariffs(cb: "CallbackQuery"):
        await cb.message.answer(TARIFFS_TEXT, reply_markup=_tariffs_kb())
        await cb.answer()

    @router.callback_query(F.data.startswith("buy:"))
    async def cb_buy(cb: "CallbackQuery"):
        try:
            _, kind, plan = cb.data.split(":", 2)
        except ValueError:
            await cb.answer("Неизвестный тариф", show_alert=True)
            return
        if not plan_info(kind, plan):
            await cb.answer("Этот тариф больше недоступен", show_alert=True)
            return
        user_id = resolve_user_id(cb.from_user.id)
        if not user_id:
            # Аккаунт ещё не связан — счёт выставить некому. Ведём в приложение.
            await cb.message.answer(
                "Чтобы оформить подписку, сначала установите приложение и войдите, затем нажмите "
                "кнопку оплаты внутри приложения — так мы свяжем ваш аккаунт. После первой оплаты "
                "тарифы можно продлевать прямо здесь.",
                reply_markup=_download_kb(),
            )
            await cb.answer()
            return
        await _send_invoice(cb.message.chat.id, kind, plan, user_id)
        await cb.answer("Счёт отправлен ⬇️")

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
            link_tg(message.from_user.id, user_id)  # связь на будущее (продления из бота)
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
        await message.answer(HELP_TEXT, reply_markup=_nav_kb())

    dp.include_router(router)

    async def setup_webhook():
        url = f"{PUBLIC_URL}{WEBHOOK_PATH}"
        await bot.set_webhook(
            url,
            secret_token=WEBHOOK_SECRET,
            drop_pending_updates=False,
            allowed_updates=["message", "callback_query", "pre_checkout_query"],
        )
        log.info("Telegram webhook установлен: %s", url)

    async def feed(data: dict):
        update = Update.model_validate(data, context={"bot": bot})
        await dp.feed_update(bot, update)
