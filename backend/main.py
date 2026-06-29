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
AI_FREE_PARSE = 10          # разбор еды и тренировок: 10/день каждый, всегда
CHAT_LIMITS = {"free": 10, "p50": 50, "p150": 150, "unlim": -1}  # -1 = безлимит

def _today():
    return datetime.now(timezone.utc).date().isoformat()

def _parse_dt(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None

def _chat_limit(uid: str) -> int:
    """Лимит ИИ-чата по активной подписке (иначе free=10)."""
    try:
        res = supabase.table("profiles").select("ai_plan, ai_until").eq("id", uid).maybe_single().execute()
        row = res.data or {}
        plan = row.get("ai_plan") or "free"
        until = _parse_dt(row.get("ai_until"))
        if not until or until <= datetime.now(timezone.utc):
            plan = "free"
        return CHAT_LIMITS.get(plan, 10)
    except Exception:
        return 10

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


def _verify_uid(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        return payload.get("sub")
    except Exception:
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

class WorkoutLossPayload(BaseModel):
    weight: float
    exercises: list

class NotifyRequest(BaseModel):
    to_user_id: str
    title: str
    body: str
    data: Optional[dict] = None


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


@app.post("/parse")
async def parse_workout(note: WorkoutNote, request: Request, authorization: Optional[str] = Header(default=None)):
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
    Текст: {note.text}
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
            "parsed_data": parsed_json.get("workouts", [])
        }
    except Exception as e:
        print(f"❌ Ошибка парсинга: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")


@app.post("/parse_meal")
async def parse_meal(data: dict, request: Request, authorization: Optional[str] = Header(default=None)):
    _guard_rate(request, authorization, data.get("user_id"), "parse_meal")
    text = data.get("text", "")

    prompt = f"""
    Проанализируй блюдо: "{text}".
    Верни ТОЛЬКО валидный JSON без текста, комментариев и форматирования markdown.
    Формат строго такой:
    {{
      "name": "Название (коротко)",
      "calories": 100,
      "protein": 10,
      "fat": 5,
      "carbs": 20
    }}
    """
    
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.1
        )
        
        raw_reply = response.choices[0].message.content
        
        # Очищаем ответ от маркдауна, если ИИ всё же его добавил
        cleaned_reply = re.sub(r'```json|```', '', raw_reply).strip()
        
        parsed_json = json.loads(cleaned_reply)
        return parsed_json
        
    except Exception as e:
        return {"error": str(e)}


@app.post("/parse_meals")
async def parse_meals(data: dict, request: Request, authorization: Optional[str] = Header(default=None)):
    text = data.get("text", "")
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
        if uid:
            _inc_usage(uid, "meal", used, exists)
        return {"meals": parsed.get("meals", [])}
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
            "title": req.title,
            "body": req.body,
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


@app.post("/chat")
async def chat_assistant(req: ChatRequest, request: Request, authorization: Optional[str] = Header(default=None)):
    print(f"\n--- ЗАПРОС К DEEPSEEK (ЧАТ С ПАМЯТЬЮ) ---")
    uid = _guard_rate(request, authorization, req.user_id, "chat")

    # Лимит ИИ-чата по подписке (free=10/день).
    chat_used, chat_exists = 0, False
    if uid:
        limit = _chat_limit(uid)
        ok, chat_used, chat_exists = _check_ai(uid, "chat", limit)
        if not ok:
            return {"limit_reached": True, "kind": "chat", "limit": limit,
                    "reply": "", "calories": 0, "protein": 0, "fat": 0, "carbs": 0}

    user_context = ""
    if uid:
        try:
            response = supabase.table("profiles").select("*").eq("id", uid).execute()
            if response.data:
                profile = response.data[0]
                
                name = profile.get("name", "Пользователь")
                goal_raw = profile.get("goal", "")
                goal = "Похудение" if goal_raw == "lose" else "Набор массы" if goal_raw == "gain" else "Поддержание веса"

                user_context = f"""
ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:
- Имя: {name}
- Цель: {goal}
"""
        except Exception as db_err:
            pass

    system_prompt = f"""
    Ты — профессиональный фитнес-ассистент и нутрициолог.
    Твоя задача — помогать пользователю ТОЛЬКО по вопросам спорта, фитнеса, тренировок, записей питания, нутрициологии.

    {user_context}

    ПРАВИЛО 1: Ты ОБЯЗАН отвечать СТРОГО в формате JSON. Структура:
    {{
        "reply": "Твой ответ пользователю",
        "should_log_meal": false,
        "calories": 0,
        "protein": 0,
        "fat": 0,
        "carbs": 0
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
      * "сколько ккал in 200г курицы?" → should_log_meal: false, calories: 0
      * "хочу съесть пиццу" → should_log_meal: false, calories: 0

    - Если should_log_meal: true, обязательно заполни calories, protein, fat, carbs примерными значениями для указанного продукта/блюда.
    - Если should_log_meal: false, оставь все нутриенты равными 0.

    ПРАВИЛО 3: Если вопрос НЕ относится к спорту или питанию, в "reply" напиши "К сожалению я не могу вам с этим помочь", а should_log_meal: false and нутриенты 0.
    """
    
    api_messages = [{"role": "system", "content": system_prompt}]
    
    for msg in req.messages:
        if msg.role == "assistant":
            simulated_json = json.dumps({"reply": msg.content, "calories": 0, "protein": 0, "fat": 0, "carbs": 0})
            api_messages.append({"role": "assistant", "content": simulated_json})
        else:
            api_messages.append({"role": msg.role, "content": msg.content})
            
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

        return {
            "reply": parsed_reply.get("reply", "Ошибка формата"),
            "calories": parsed_reply.get("calories", 0),
            "protein": parsed_reply.get("protein", 0),
            "fat": parsed_reply.get("fat", 0),
            "carbs": parsed_reply.get("carbs", 0)
        }
    except Exception as e:
        print(f"❌ Ошибка чата: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")