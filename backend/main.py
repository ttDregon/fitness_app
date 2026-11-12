import json
import logging
import os
import re
import time
import httpx
import jwt
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

import tgbot  # Telegram-бот оплаты (вебхук). Безопасен при отсутствии BOT_TOKEN.

app = FastAPI()


@app.on_event("startup")
async def _register_tg_webhook():
    if tgbot.enabled:
        try:
            await tgbot.setup_webhook()
        except Exception:
            logging.exception("Не удалось установить Telegram webhook")

# Разрешаем запросы с мобильного приложения
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Отсекаем слишком большие тела запросов ещё до чтения (защита от memory-DoS).
MAX_BODY_BYTES = 256_000
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Тело запроса слишком большое"})
    return await call_next(request)

# --- НАСТРОЙКИ DEEPSEEK ---
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com",
    timeout=30,         # не держим воркер, если DeepSeek завис
    max_retries=1,
)

# --- НАСТРОЙКИ SUPABASE ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- ЛИМИТЫ ИИ (считаются на сервере, нельзя обойти из приложения) ---
# Приложение бесплатное для всех — лимиты только чтобы не улететь по счёту за API.
AI_FREE_CHAT = 30           # чат: 30 сообщений/день
AI_FREE_PARSE = 15          # разбор еды и тренировок: 15/день каждый, всегда

def _today():
    return datetime.now(timezone.utc).date().isoformat()

def _parse_dt(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None

def _usage(uid: str, kind: str):
    """Возвращает (использовано_сегодня, есть_ли_строка)."""
    try:
        res = supabase.table("ai_usage").select("*").eq("user_id", uid).eq("day", _today()).maybe_single().execute()
        row = res.data
        return (int(row.get(kind, 0)) if row else 0), bool(row)
    except Exception:
        return 0, False

def _inc_usage(uid: str, kind: str, used: int, exists: bool):
    try:
        if exists:
            supabase.table("ai_usage").update({kind: used + 1}).eq("user_id", uid).eq("day", _today()).execute()
        else:
            supabase.table("ai_usage").insert({"user_id": uid, "day": _today(), kind: 1}).execute()
    except Exception:
        pass

def _check_ai(uid: str, kind: str, limit: int):
    """True/инфо если можно; если лимит исчерпан — (False, used, exists)."""
    if not uid or limit == -1:
        return True, 0, False
    used, exists = _usage(uid, kind)
    if used >= limit:
        return False, used, exists
    return True, used, exists

# --- АУТЕНТИФИКАЦИЯ И ЗАЩИТА ОТ ЗЛОУПОТРЕБЛЕНИЙ ---
# JWT-секрет проекта Supabase (Settings → API → JWT Secret). Если ЗАДАН — бэкенд
# проверяет токен пользователя и берёт user_id ТОЛЬКО из него (тело не доверяется),
# а запрос без валидного токена отклоняется (401). Если НЕ задан — старое поведение
# (переходный режим, чтобы не ломать ещё не обновлённые приложения).
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# Supabase подписывает токены асимметрично (ES256) — проверяем их по публичным
# ключам JWKS проекта. Для старых проектов на симметричном секрете (HS256) — фолбэк.
_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else None
_jwks_client = jwt.PyJWKClient(_JWKS_URL) if _JWKS_URL else None


def _verify_uid(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                return None
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        else:
            key = _jwks_client.get_signing_key_from_jwt(token).key
            payload = jwt.decode(token, key, algorithms=["ES256", "RS256"], audience="authenticated")
        return payload.get("sub")
    except Exception as e:
        print(f"jwt verify failed: {e}")
        return None


def _auth_uid(authorization, body_uid):
    """Авторитетный user_id: при включённой проверке — только из валидного токена."""
    if SUPABASE_JWT_SECRET:
        uid = _verify_uid(authorization)
        if not uid:
            raise HTTPException(status_code=401, detail="Требуется авторизация")
        return uid
    return body_uid  # переходный режим: секрет ещё не задан


def _is_trainer_of(trainer_id, client_id) -> bool:
    """trainer_id владеет группой, в которой состоит client_id?"""
    try:
        g = supabase.table("groups").select("id").eq("owner_id", trainer_id).execute()
        gids = [r["id"] for r in (g.data or [])]
        if not gids:
            return False
        m = supabase.table("group_members").select("group_id").eq("user_id", client_id).in_("group_id", gids).execute()
        return bool(m.data)
    except Exception:
        return False


# Простой антифлуд в памяти процесса (на инстанс): защита от долбёжки эндпоинтов.
_RL = defaultdict(list)


def _rate_ok(key: str, limit: int = 30, window: int = 60) -> bool:
    now = time.time()
    if len(_RL) > 20000:   # защита от роста словаря при ротации IP
        _RL.clear()
    q = _RL[key]
    while q and q[0] < now - window:
        q.pop(0)
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def _client_ip(request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _guard_rate(request, authorization, body_uid, bucket):
    """Вернуть авторитетный uid и проверить рейт-лимит (429 при превышении)."""
    uid = _auth_uid(authorization, body_uid)
    if not _rate_ok(f"{bucket}:{uid or _client_ip(request)}"):
        raise HTTPException(status_code=429, detail="Слишком много запросов, подождите минуту")
    return uid

# Модели данных для запросов
class WorkoutNote(BaseModel):
    text: str
    user_id: Optional[str] = None

class MealNote(BaseModel):
    text: str

class ChatMessageItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessageItem]  # История сообщений
    user_id: Optional[str] = None
    daily_calorie_norm: Optional[int] = None  # уже посчитанная норма (см. frontend/src/utils/nutrition.ts)
    daily_macros: Optional[dict] = None       # {protein, fat, carb}
    # Снимок данных приложения, собранный клиентом (журнал, рекорды, вес, питание и вода
    # за сегодня, план тренера, расписание) — см. frontend/src/utils/companion.ts.
    # Именно он даёт компаньону «видеть всё приложение». Старые версии его не шлют.
    app_context: Optional[str] = None
    persona: Optional[str] = None             # характер компаньона: friendly | strict | calm


class BriefRequest(BaseModel):
    app_context: str
    persona: Optional[str] = None
    user_id: Optional[str] = None

class WorkoutLossPayload(BaseModel):
    weight: float
    exercises: list

class NotifyRequest(BaseModel):
    to_user_id: str
    title: str
    body: str
    data: Optional[dict] = None

class WorkoutPlanRequest(BaseModel):
    muscle_group: str            # напр. "Грудь", "Спина", "Ноги", "Всё тело"
    preferences: Optional[str] = ""   # свободный текст: ограничения, инвентарь и т.п.
    user_id: Optional[str] = None
    app_context: Optional[str] = None  # тот же снимок приложения, что и в /chat


# Пределы на размер входа: длинный текст = дорогой промпт. 256 КБ тела (см. выше) — это
# ~100 тыс. токенов, такого от телефона не бывает, а счёт за API растёт линейно.
MAX_TEXT = 2000
MAX_CONTEXT = 9000
MAX_CHAT_MESSAGES = 24
MAX_MESSAGE_CHARS = 4000

PERSONAS = {
    "friendly": "Тон: тёплый, поддерживающий друг-тренер. Отмечай прогресс, мягко подталкивай, можно 1–2 уместных эмодзи.",
    "strict": "Тон: строгий требовательный тренер. Коротко, по делу, без сюсюканья и эмодзи, но с уважением. Прямо называй, где пользователь недорабатывает.",
    "calm": "Тон: спокойный рассудительный эксперт. Объясняй «почему», без давления и восклицаний.",
}


def _persona(p) -> str:
    return PERSONAS.get(p or "friendly", PERSONAS["friendly"])


def _num(v, lo, hi, digits=None):
    """Число из ответа ИИ (бывает строкой или мусором) → в пределах [lo, hi]."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0
    if x != x:  # NaN
        return 0
    x = max(lo, min(x, hi))
    return round(x, digits) if digits is not None else x


def _clean_sets(items):
    """Подходы из /parse: только осмысленные записи с числами, а не строками."""
    out = []
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        name = str(it.get("exercise") or "").strip()[:80]
        if not name:
            continue
        out.append({
            "exercise": name,
            "weight": _num(it.get("weight"), 0, 1000, 2),
            "reps": int(_num(it.get("reps"), 0, 1000)),
        })
    return out[:100]


def _clean_plan(plan):
    """План тренировки от ИИ → строгий формат фронтенда, либо None."""
    if not isinstance(plan, dict):
        return None
    exercises = []
    for ex in plan.get("exercises") or []:
        if not isinstance(ex, dict):
            continue
        name = str(ex.get("exercise") or "").strip()[:80]
        if not name:
            continue
        sets = [{
            "target_reps": int(_num(s.get("target_reps"), 0, 100)),
            "target_weight": _num(s.get("target_weight"), 0, 500, 2),
        } for s in (ex.get("sets") or []) if isinstance(s, dict)][:10]
        exercises.append({"exercise": name, "sets": sets or [{"target_reps": 10, "target_weight": 0}]})
    if not exercises:
        return None
    return {"plan_name": str(plan.get("plan_name") or "Тренировка").strip()[:60], "exercises": exercises[:12]}


# Лёгкие health-роуты: ничего не вызывают (ни DeepSeek, ни Supabase), отвечают мгновенно.
# Нужны, чтобы (1) фронт «будил» Render при старте и (2) внешний бесплатный пингер
# (UptimeRobot/cron-job.org) держал сервер живым, не давая ему заснуть.
# GET и HEAD: аптайм-мониторы часто шлют HEAD, а на чистый @app.get он отдаёт 405.
@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return {"status": "ok"}


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}


# Пригласительная ссылка в клуб. https кликается в любом мессенджере; страница
# редиректит в приложение (mysafeapp://join?code=...) и показывает код как запасной
# вариант (ввести вручную через «Вступить по коду»).
@app.get("/join", response_class=HTMLResponse)
async def join_club(code: str = ""):
    code = "".join(ch for ch in code if ch.isdigit())[:6]
    deeplink = f"mysafeapp://join?code={code}"
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url={deeplink}">
<title>Приглашение в клуб Striva</title>
<style>body{{background:#0A0C16;color:#F5F7FF;font-family:-apple-system,Roboto,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;margin:0;padding:24px}}
.box{{max-width:440px}} h2{{font-size:26px;margin:0 0 6px}}
.code{{font-size:46px;font-weight:900;letter-spacing:8px;color:#8B5CF6;margin:16px 0}}
a{{display:inline-block;margin-top:14px;background:#8B5CF6;color:#fff;text-decoration:none;
font-size:18px;font-weight:800;padding:16px 32px;border-radius:16px}}
p{{color:#94A0C0;font-size:16px;line-height:1.5}}</style></head>
<body><div class="box">
<h2>Приглашение в клуб Striva 💪</h2><p>Код клуба:</p>
<div class="code">{code}</div>
<a href="{deeplink}">Открыть в Striva</a>
<p style="margin-top:22px">Если не открылось автоматически — запусти приложение Striva,
нажми «Вступить по коду» и введи код выше.</p>
</div><script>location.href="{deeplink}";</script></body></html>"""


# Мост из Telegram обратно в приложение: кнопки Telegram принимают только https,
# поэтому бот шлёт https://<backend>/open?kind=..., а эта страница редиректит в
# кастомную схему приложения (mysafeapp://paid). Схема работает после пересборки APK.
@app.get("/open", response_class=HTMLResponse)
async def open_app(kind: str = "trainer"):
    kind = kind if kind in ("trainer", "ai") else "trainer"
    deeplink = f"mysafeapp://paid?kind={kind}"
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url={deeplink}">
<title>Открываем приложение…</title>
<style>body{{background:#0A0C16;color:#fff;font-family:-apple-system,Roboto,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;margin:0}}
a{{color:#8B5CF6;font-size:18px;text-decoration:none}}</style></head>
<body><div><p>Возвращаемся в приложение…</p>
<a href="{deeplink}">Открыть приложение</a></div>
<script>location.href="{deeplink}";</script></body></html>"""


# Вебхук Telegram-бота оплаты. Telegram шлёт сюда апдейты; подлинность — по секретному
# заголовку (его задаём в set_webhook). Обработка — в tgbot.py.
@app.post(tgbot.WEBHOOK_PATH if tgbot.WEBHOOK_PATH else "/tg/webhook")
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: str = Header(default="")):
    if not tgbot.enabled:
        raise HTTPException(status_code=503, detail="bot disabled")
    if x_telegram_bot_api_secret_token != tgbot.WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="bad secret")
    await tgbot.feed(await request.json())
    return {"ok": True}


# ВАЖНО: обработчики с вызовом ИИ — обычные def, а не async def. Клиенты OpenAI и Supabase
# здесь синхронные: внутри async def запрос к DeepSeek (до 30 с) блокировал весь event loop —
# пока один пользователь ждал ответа чата, сервер не отвечал никому, даже /health.
# Обычный def FastAPI выполняет в пуле потоков, и запросы идут параллельно.
@app.post("/parse")
def parse_workout(note: WorkoutNote, request: Request, authorization: Optional[str] = Header(default=None)):
    print(f"\n--- ЗАПРОС К DEEPSEEK (ПАРСИНГ ТРЕНИРОВКИ) ---")
    uid = _guard_rate(request, authorization, note.user_id, "parse")

    ok, used, exists = _check_ai(uid, "workout", AI_FREE_PARSE)
    if not ok:
        return {"status": "limit_reached", "kind": "workout", "limit": AI_FREE_PARSE, "parsed_data": []}

    prompt = f"""
    Проанализируй текст тренировки и верни результат СТРОГО в формате JSON.
    Ответ должен быть JSON-объектом с одним ключом "workouts", в котором лежит массив объектов.
    Каждый элемент массива должен иметь:
    - "exercise" (строка, название упражнения)
    - "weight" (число, вес снаряда. ВАЖНО: если написано 'жим 10*10', '10х10' или '10 на 10', то первое число — это вес, а второе — повторения. Ставь 0 только если вес снаряда не указан вовсе, например 'отжимания 20'.)
    - "reps" (число, количество повторений)
    Текст: {note.text[:MAX_TEXT]}
    """
    
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You output valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        raw_response = response.choices[0].message.content
        parsed_json = json.loads(raw_response)
        if uid:
            _inc_usage(uid, "workout", used, exists)
        return {
            "status": "success",
            "parsed_data": _clean_sets(parsed_json.get("workouts", []))
        }
    except Exception as e:
        print(f"❌ Ошибка парсинга: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")


def _summarize_workout_history(uid: str, muscle_group: str) -> str:
    """Сводка последних записей личного журнала (workouts) — реальные вес и повторы,
    которые пользователь сам вносил или подтвердил галочкой «выполнено». Это и есть
    "что я тренировал в прошлый раз": ИИ должен опираться именно на эти цифры, а не
    выдумывать нагрузку с нуля."""
    lines = []
    try:
        rows = supabase.table("workouts").select("*") \
            .eq("user_id", uid).order("created_at", desc=True).limit(6).execute()
        for row in reversed(rows.data or []):  # от старых к новым — виден прогресс
            date = (row.get("created_at") or "")[:10]
            for ex in (row.get("parsed_data") or []):
                name = ex.get("exercise")
                if not name:
                    continue
                lines.append(f"- {date}: {name} — {ex.get('weight', 0)}кг×{ex.get('reps', 0)}")
    except Exception:
        pass
    if not lines:
        return "Истории тренировок пока нет — предложи щадящую стартовую нагрузку."
    lines = lines[-40:]  # не раздуваем промпт
    return "ПОСЛЕДНИЕ ЗАПИСИ ЛИЧНОГО ЖУРНАЛА (реальные вес и повторы):\n" + "\n".join(lines)


@app.post("/generate_workout_plan")
def generate_workout_plan(req: WorkoutPlanRequest, request: Request, authorization: Optional[str] = Header(default=None)):
    print(f"\n--- ЗАПРОС К DEEPSEEK (ГЕНЕРАЦИЯ ПЛАНА ТРЕНИРОВКИ) ---")
    uid = _guard_rate(request, authorization, req.user_id, "workout_plan")

    ok, used, exists = _check_ai(uid, "plan", AI_FREE_PARSE)
    if not ok:
        return {"status": "limit_reached", "kind": "plan", "limit": AI_FREE_PARSE}

    if req.app_context:
        history_summary = "КОНТЕКСТ ПРИЛОЖЕНИЯ ПОЛЬЗОВАТЕЛЯ:\n" + req.app_context[:MAX_CONTEXT]
    else:
        history_summary = _summarize_workout_history(uid, req.muscle_group) if uid else ""

    prompt = f"""
    Составь тренировку для группы мышц/комплекса: "{req.muscle_group[:60]}".
    Предпочтения и ограничения пользователя: "{(req.preferences or 'нет особых пожеланий')[:500]}".

    {history_summary}

    Правила:
    - Подбери 4-6 упражнений, подходящих группе мышц и предпочтениям.
    - Если в истории журнала есть упражнения из этой же группы/похожие — бери их последний
      реальный вес и повторы за базу и умеренно прогрессируй (+2.5-5кг веса или +1 повтор),
      не придумывай нагрузку с нуля, если для упражнения уже есть история.
    - Для упражнений без истории — предложи консервативную стартовую нагрузку.
    - Для каждого упражнения укажи от 3 до 5 подходов с целевым весом (кг) и повторениями.

    Верни ТОЛЬКО валидный JSON без markdown и комментариев, строго такой формат:
    {{
      "plan_name": "Короткое название плана",
      "exercises": [
        {{ "exercise": "Название упражнения", "sets": [ {{ "target_reps": 8, "target_weight": 40 }} ] }}
      ]
    }}
    """

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You output valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.4
        )
        raw = response.choices[0].message.content
        cleaned = re.sub(r'```json|```', '', raw).strip()
        plan = _clean_plan(json.loads(cleaned))
        if not plan:
            raise ValueError("пустой план")
        if uid:
            _inc_usage(uid, "plan", used, exists)
        return {"status": "success", "plan": plan}
    except Exception as e:
        print(f"❌ Ошибка генерации плана: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")


def _clamp_food_item(it: dict) -> dict:
    """Подстраховка от галлюцинаций ИИ: разумные пределы на один продукт + сверка,
    что calories примерно сходится с 4*protein + 9*fat + 4*carbs (иначе пересчитываем)."""
    cal = max(0, min(float(it.get("calories") or 0), 3000))
    p = max(0, min(float(it.get("protein") or 0), 300))
    f = max(0, min(float(it.get("fat") or 0), 300))
    c = max(0, min(float(it.get("carbs") or 0), 500))
    derived = 4 * p + 9 * f + 4 * c
    if derived > 0 and (cal == 0 or abs(derived - cal) / max(derived, cal) > 0.25):
        cal = derived
    it["calories"], it["protein"], it["fat"], it["carbs"] = round(cal), round(p), round(f), round(c)
    return it


@app.post("/parse_meals")
def parse_meals(data: dict, request: Request, authorization: Optional[str] = Header(default=None)):
    text = str(data.get("text") or "")[:MAX_TEXT]
    uid = _guard_rate(request, authorization, data.get("user_id"), "meals")

    ok, used, exists = _check_ai(uid, "meal", AI_FREE_PARSE)
    if not ok:
        return {"status": "limit_reached", "kind": "meal", "limit": AI_FREE_PARSE, "meals": []}

    prompt = f"""
    Проанализируй, что съел человек или что назначено в меню: "{text}".

    1) Раздели на ПРИЁМЫ ПИЩИ по словам-маркерам:
       завтрак -> "breakfast", обед -> "lunch", ужин -> "dinner", перекус -> "snack".
       Если маркеров нет — верни ОДИН приём с meal_type "snack".
    2) Внутри каждого приёма раздели текст на ОТДЕЛЬНЫЕ продукты.
       Например "200г куриного филе, 150г пюре, огурец и стакан сока" = 4 продукта.
       Для КАЖДОГО продукта оцени КБЖУ отдельно. В name сохраняй количество ("200г куриного филе").

    Верни ТОЛЬКО валидный JSON без markdown и комментариев, строго такой формат:
    {{
      "meals": [
        {{
          "meal_type": "breakfast",
          "items": [
            {{ "name": "200г куриного филе", "calories": 330, "protein": 62, "fat": 7, "carbs": 0 }}
          ]
        }}
      ]
    }}
    """

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You output valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        raw = response.choices[0].message.content
        cleaned = re.sub(r'```json|```', '', raw).strip()
        parsed = json.loads(cleaned)
        meals = parsed.get("meals", [])
        for meal in meals:
            meal["items"] = [_clamp_food_item(it) for it in meal.get("items", [])]
        if uid:
            _inc_usage(uid, "meal", used, exists)
        return {"meals": meals}
    except Exception as e:
        return {"error": str(e)}


@app.post("/calculate_loss")
async def calculate_loss(payload: WorkoutLossPayload, request: Request):
    if not _rate_ok(f"calc:{_client_ip(request)}", limit=60):
        raise HTTPException(status_code=429, detail="Слишком много запросов")
    print(f"\n--- РАСЧЕТ СОЖЖЕННЫХ КАЛОРИЙ ЧЕРЕЗ ЧАС ---")
    total_sets = len(payload.exercises)
    burned_kcal = total_sets * 15 
    weight_loss_kg = burned_kcal / 7000.0
    
    return {
        "burned_kcal": burned_kcal,
        "weight_loss_kg": round(weight_loss_kg, 3)
    }


@app.post("/notify")
async def notify(req: NotifyRequest, request: Request, authorization: Optional[str] = Header(default=None)):
    """Отправить пуш-уведомление пользователю через Expo Push API.

    Берём все push-токены пользователя из таблицы push_tokens и шлём сообщение.
    Требует, чтобы SUPABASE_KEY на бэкенде имел право читать чужие токены
    (service_role ключ либо соответствующая RLS-политика).

    Защита: при включённой проверке (есть SUPABASE_JWT_SECRET) отправитель должен
    быть авторизован и иметь право слать получателю — либо это он сам, либо он
    тренер группы, в которой состоит получатель. Иначе любой мог бы слать фейковые
    пуши кому угодно.
    """
    caller = _auth_uid(authorization, None)
    if not _rate_ok(f"notify:{caller or _client_ip(request)}", limit=20):
        raise HTTPException(status_code=429, detail="Слишком много запросов")
    if SUPABASE_JWT_SECRET and caller != req.to_user_id and not _is_trainer_of(caller, req.to_user_id):
        raise HTTPException(status_code=403, detail="Нет прав отправлять этому пользователю")
    try:
        res = supabase.table("push_tokens").select("token").eq("user_id", req.to_user_id).execute()
        tokens = [r["token"] for r in (res.data or []) if r.get("token", "").startswith("Expo")]
        if not tokens:
            return {"status": "no_tokens", "sent": 0}

        messages = [{
            "to": t,
            "title": req.title[:120],
            "body": req.body[:500],
            "data": req.data or {},
            "sound": "default",
            "channelId": "default",
            "priority": "high",
        } for t in tokens]

        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(
                "https://exp.host/--/api/v2/push/send",
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                json=messages,
            )
        return {"status": "ok", "sent": len(tokens), "expo": resp.json()}
    except Exception as e:
        print(f"❌ Ошибка отправки пуша: {e}")
        return {"status": "error", "detail": str(e)}


def _profile_context(uid, req_norm=None, req_macros=None) -> str:
    """Профиль из БД (рост/возраст/пол — их нет в снимке клиента) + норма КБЖУ с клиента."""
    try:
        response = supabase.table("profiles").select("*").eq("id", uid).execute()
        if not response.data:
            return ""
        profile = response.data[0]
        name = profile.get("name", "Пользователь")
        goal_raw = profile.get("goal", "")
        goal = "Похудение" if goal_raw == "lose" else "Набор массы" if goal_raw == "gain" else "Поддержание веса"
        weight, height, age, gender = profile.get("weight"), profile.get("height"), profile.get("age"), profile.get("gender")
        ctx = f"ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:\n- Имя: {name}\n- Цель: {goal}\n"
        if profile.get("target_weight"):
            ctx += f"- Целевой вес: {profile.get('target_weight')} кг\n"
        if weight and height and age and gender:
            ctx += f"- Вес: {weight} кг, рост: {height} см, возраст: {age}, пол: {gender}\n"
        if profile.get("workouts_per_week"):
            ctx += f"- Тренировок в неделю (по анкете): {profile.get('workouts_per_week')}\n"
        if req_norm:
            ctx += f"- Дневная норма калорий: {req_norm} ккал\n"
        if isinstance(req_macros, dict):
            ctx += f"- Дневная норма БЖУ: белки {req_macros.get('protein')}г, жиры {req_macros.get('fat')}г, углеводы {req_macros.get('carb')}г\n"
        return ctx
    except Exception:
        return ""


COMPANION_IDENTITY = """
Ты — Striva, личный ИИ-компаньон пользователя в фитнес-приложении Striva: персональный тренер
и нутрициолог в одном лице. Помогаешь ТОЛЬКО по темам спорта, тренировок, питания, веса,
восстановления и здоровых привычек.

У тебя есть доступ к данным приложения пользователя — они ниже, в блоках ИНФОРМАЦИЯ О
ПОЛЬЗОВАТЕЛЕ и КОНТЕКСТ ПРИЛОЖЕНИЯ (журнал тренировок с датами, рекорды, какие группы мышц
когда тренировались, вес и его динамика, питание и вода за сегодня, план от тренера,
расписание). Это и есть «твоя память» о пользователе:
- Когда просят пересмотреть/проанализировать тренировки, питание, вес или прогресс — разбирай
  КОНКРЕТНЫЕ цифры и даты из контекста (что, когда, с каким весом), а не общие слова.
- Не переспрашивай то, что уже есть в контексте. Никогда не говори, что у тебя нет доступа к
  данным, если они есть в контексте.
- Если данных правда нет (например, журнал пуст) — честно скажи об этом и предложи, с чего начать.
- Обращайся по имени, отвечай по-русски, структурно и без воды: короткие абзацы или списки.
"""


@app.post("/chat")
def chat_assistant(req: ChatRequest, request: Request, authorization: Optional[str] = Header(default=None)):
    print(f"\n--- ЗАПРОС К DEEPSEEK (ЧАТ-КОМПАНЬОН) ---")
    uid = _guard_rate(request, authorization, req.user_id, "chat")

    # Дневной лимит ИИ-чата (одинаковый для всех — оплаты в приложении нет).
    chat_used, chat_exists = 0, False
    if uid:
        ok, chat_used, chat_exists = _check_ai(uid, "chat", AI_FREE_CHAT)
        if not ok:
            return {"limit_reached": True, "kind": "chat", "limit": AI_FREE_CHAT,
                    "reply": "", "calories": 0, "protein": 0, "fat": 0, "carbs": 0}

    user_context = ""
    if uid:
        user_context = _profile_context(uid, req.daily_calorie_norm, req.daily_macros)
    if req.app_context:
        user_context += "\nКОНТЕКСТ ПРИЛОЖЕНИЯ (актуальные данные пользователя на момент сообщения):\n" + req.app_context[:MAX_CONTEXT] + "\n"
    elif uid:
        # Старые версии приложения не шлют снимок — хотя бы журнал тренировок из БД.
        user_context += f"\n{_summarize_workout_history(uid, '')}\n"

    # Действия «записать воду / вес» умеет выполнять только новая версия приложения — её
    # признак: она шлёт app_context. Старой версии (пока до неё не дошло обновление) эти
    # правила не даём: иначе ИИ отвечал бы «записал воду», а приложение ничего не записывало.
    supports_actions = req.app_context is not None
    action_fields = """
        "log_water_ml": 0,
        "log_weight_kg": 0,""" if supports_actions else ""
    action_rule = """
    ПРАВИЛО 2.1 (ВОДА И ВЕС — ДЕЙСТВИЯ В ПРИЛОЖЕНИИ):
    - "log_water_ml": ставь число миллилитров ТОЛЬКО если пользователь сообщает, что ВЫПИЛ воду ("выпил 500 мл воды", "выпил стакан воды" → 250, "выпил бутылку воды 0.5" → 500). Иначе 0. Чай/кофе/сок водой не считаются.
    - "log_weight_kg": ставь число ТОЛЬКО если пользователь сообщает свой ТЕКУЩИЙ вес ("я вешу 82.5", "сегодня взвесился — 80 кг"). Для желаемого/прошлого веса и вопросов — 0.
    - Если записываешь воду или вес — коротко подтверди это в "reply".
""" if supports_actions else ""

    system_prompt = f"""
    {COMPANION_IDENTITY}
    {_persona(req.persona)}

    {user_context}

    ПРАВИЛО 1: Ты ОБЯЗАН отвечать СТРОГО в формате JSON. Структура:
    {{
        "reply": "Твой ответ пользователю",
        "should_log_meal": false,
        "calories": 0,
        "protein": 0,
        "fat": 0,
        "carbs": 0,{action_fields}
        "workout_plan": null
    }}

    ПРАВИЛО 2 (КРИТИЧЕСКИ ВАЖНО - ЛОГИРОВАНИЕ ЕДЫ):
    - Ставь "should_log_meal": true ТОЛЬКО если пользователь ЯВНО КОНСТАТИРУЕТ ФАКТ употребления пищи. Ключевые фразы: "я съел", "поел", "только что съел", "скушал", "употребил", "перекусил".
    - Примеры когда ставить true:
      * "я съел 200г курицы" → should_log_meal: true, calories: 330, protein: 62, fat: 7, carbs: 0
      * "только что поел борщ" → should_log_meal: true, calories: 250, protein: 10, fat: 8, carbs: 30
      * "скушал яблоко" → should_log_meal: true, calories: 52, protein: 0, fat: 0, carbs: 14

    - Примеры когда ставить false (ВОПРОСЫ, ИНТЕРЕС, ПЛАНИРОВАНИЕ):
      * "сколько калорий в яблоке?" → should_log_meal: false, calories: 0
      * "можно ли пиццу?" → should_log_meal: false, calories: 0
      * "что будет если съем курицу?" → should_log_meal: false, calories: 0
      * "хочу съесть пиццу" → should_log_meal: false, calories: 0

    - Если should_log_meal: true, обязательно заполни calories, protein, fat, carbs примерными значениями для указанного продукта/блюда, а в "reply" коротко подтверди, что записал, и как это вписывается в норму на сегодня (по КОНТЕКСТУ ПРИЛОЖЕНИЯ).
    - Если should_log_meal: false, оставь все нутриенты равными 0.
{action_rule}
    ПРАВИЛО 3: Если вопрос НЕ относится к спорту, питанию, весу или восстановлению, в "reply" напиши "К сожалению я не могу вам с этим помочь", а остальные поля оставь по умолчанию.

    ПРАВИЛО 4 (ГРУНТУЙ СОВЕТЫ В ЦИФРАХ ПОЛЬЗОВАТЕЛЯ): Если указаны дневная норма калорий и БЖУ — любые твои рекомендации по количеству белка/жиров/углеводов/калорий должны опираться ИМЕННО на эти цифры и на то, сколько уже съедено сегодня (например "до нормы белка осталось ~60г"). Никогда не называй суточную норму белка выше нормы из контекста.

    ПРАВИЛО 5 (ТРЕНИРОВКА НА СЕГОДНЯ / "КАК В ПРОШЛЫЙ РАЗ"): Если пользователь просит пересмотреть его тренировки, посоветовать, что делать сегодня, или составить тренировку на основе прошлых — НЕ переспрашивай: сам посмотри по журналу, какие группы мышц и когда работали, сколько дней прошло, и предложи то, что логично сегодня (не та же группа мышц, что вчера; давно не тренированные группы — в приоритете; если был тяжёлый блок подряд — можно день отдыха или лёгкое кардио). Дай конкретику: упражнения, подходы, вес, повторы, умеренно прогрессируя относительно последних цифр из журнала (+2.5-5кг или +1 повтор, если прошлая нагрузка выглядит выполнимой). Если тренер назначил план на сегодня — учитывай его в первую очередь. Коротко объясни, почему именно это. Если записей в журнале нет — уточни цель и предложи щадящий стартовый вариант.

    ПРАВИЛО 6 (СТРУКТУРИРОВАННЫЙ ПЛАН ДЛЯ ЖУРНАЛА): Каждый раз, когда в "reply" ты предлагаешь КОНКРЕТНУЮ тренировку (список упражнений с подходами/весом/повторами) — ОБЯЗАТЕЛЬНО продублируй её машиночитаемо в поле "workout_plan", СТРОГО в этом формате:
    {{
        "plan_name": "Короткое название",
        "exercises": [
            {{ "exercise": "Название упражнения", "sets": [ {{ "target_reps": 8, "target_weight": 40 }} ] }}
        ]
    }}
    Данные в "workout_plan" должны точно соответствовать тому, что написано в "reply". Если в этом сообщении ты НЕ предлагаешь конкретную тренировку — оставь "workout_plan": null. Под планом у пользователя появится кнопка «Добавить в тренировку» — можешь упомянуть её.
    """

    api_messages = [{"role": "system", "content": system_prompt}]

    # В ИИ уходит только хвост диалога: история длиной в сотни сообщений — это и деньги
    # (каждое сообщение пересылает всю историю), и размытый контекст для модели.
    for msg in req.messages[-MAX_CHAT_MESSAGES:]:
        if msg.role not in ("user", "assistant"):
            continue  # "system" из тела запроса подменил бы наш системный промпт
        content = (msg.content or "")[:MAX_MESSAGE_CHARS]
        if msg.role == "assistant":
            simulated_json = json.dumps({"reply": content, "calories": 0, "protein": 0, "fat": 0, "carbs": 0}, ensure_ascii=False)
            api_messages.append({"role": "assistant", "content": simulated_json})
        else:
            api_messages.append({"role": "user", "content": content})

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=api_messages,
            response_format={"type": "json_object"},
            temperature=0.6
        )

        raw_reply = response.choices[0].message.content
        parsed_reply = json.loads(raw_reply)

        if uid:
            _inc_usage(uid, "chat", chat_used, chat_exists)

        # Подстраховка от кривого workout_plan (не тот тип, пустой список и т.п.) —
        # лучше молча отбросить его, чем уронить фронтенд на некорректных данных.
        workout_plan = _clean_plan(parsed_reply.get("workout_plan"))

        # Приложение записывает в дневник всё, где calories > 0. ИИ иногда заполняет КБЖУ и на
        # вопрос («сколько калорий в пицце?»), ставя should_log_meal: false — такое обнуляем,
        # а записываемое прогоняем через те же пределы/сверку, что и /parse_meals.
        food = {"calories": 0, "protein": 0, "fat": 0, "carbs": 0}
        if str(parsed_reply.get("should_log_meal", True)).lower() != "false":
            try:
                food = _clamp_food_item({k: parsed_reply.get(k) for k in food})
            except (TypeError, ValueError):
                pass

        # Действия «вода» и «вес»: пределы от галлюцинаций (3 л за раз, 25–300 кг).
        water_ml = int(_num(parsed_reply.get("log_water_ml"), 0, 3000)) if supports_actions else 0
        weight_kg = _num(parsed_reply.get("log_weight_kg"), 0, 300, 2) if supports_actions else 0
        if weight_kg < 25:
            weight_kg = 0

        return {
            "reply": parsed_reply.get("reply", "Ошибка формата"),
            **food,
            "water_ml": water_ml,
            "weight_kg": weight_kg,
            "workout_plan": workout_plan,
        }
    except Exception as e:
        print(f"❌ Ошибка чата: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")


# Совет компаньона на день для карточки на главном экране. Клиент кэширует ответ на день,
# так что обычно это 1 запрос в сутки; учитывается в том же дневном лимите, что и чат.
@app.post("/companion/brief")
def companion_brief(req: BriefRequest, request: Request, authorization: Optional[str] = Header(default=None)):
    uid = _guard_rate(request, authorization, req.user_id, "brief")
    used, exists = 0, False
    if uid:
        ok, used, exists = _check_ai(uid, "chat", AI_FREE_CHAT)
        if not ok:
            return {"status": "limit_reached", "limit": AI_FREE_CHAT}

    profile = _profile_context(uid) if uid else ""
    prompt = f"""
    {COMPANION_IDENTITY}
    {_persona(req.persona)}

    {profile}
    КОНТЕКСТ ПРИЛОЖЕНИЯ:
    {req.app_context[:MAX_CONTEXT]}

    Сделай короткую сводку дня для карточки на главном экране: оцени последние дни пользователя
    (тренировки, питание, вода, вес) и дай ОДИН конкретный совет, что сделать сегодня. Опирайся
    только на данные выше, с конкретными цифрами. Без приветствий в стиле «Привет, я ИИ».

    Верни ТОЛЬКО валидный JSON:
    {{
      "headline": "заголовок до 50 символов",
      "message": "2–3 коротких предложения: что заметил по данным + конкретный совет на сегодня",
      "suggestion": "короткий вопрос (до 60 символов) от лица пользователя, который логично задать тебе дальше"
    }}
    """
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You output valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        parsed = json.loads(response.choices[0].message.content)
        if uid:
            _inc_usage(uid, "chat", used, exists)
        return {
            "status": "success",
            "headline": str(parsed.get("headline") or "Совет на сегодня")[:80],
            "message": str(parsed.get("message") or "")[:600],
            "suggestion": str(parsed.get("suggestion") or "Что мне сделать сегодня?")[:90],
        }
    except Exception as e:
        print(f"❌ Ошибка сводки компаньона: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")
