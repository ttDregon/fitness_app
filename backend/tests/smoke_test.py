"""Смоук-тест бэкенда без сети: DeepSeek и Supabase подменены заглушками, .env не читается —
тест никогда не ходит в настоящие сервисы и не тратит лимиты API.

Запуск из корня репозитория:   python backend/tests/smoke_test.py
Проверяет: чат-компаньон (контекст приложения, характер, действия «еда/вода/вес»), совет
дня, генерацию плана, разбор тренировки, пределы на размер входа и — отдельно —
совместимость со СТАРОЙ версией приложения (она остаётся у пользователей до обновления).
Код возврата 0 = всё прошло."""
import json
import os
import sys
import types

backend = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend)

# main.py вызывает load_dotenv(): без заглушки он подтянул бы настоящие ключи из backend/.env
# (а с SUPABASE_JWT_SECRET все запросы теста получили бы 401).
import dotenv  # noqa: E402

dotenv.load_dotenv = lambda *a, **k: False
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "test"
os.environ["DEEPSEEK_API_KEY"] = "test"
os.environ.pop("SUPABASE_JWT_SECRET", None)
os.environ.pop("BOT_TOKEN", None)

# Модули Telegram-бота в тестовом venv могут отсутствовать — для смоука они не нужны.
try:
    import dateutil.relativedelta  # noqa: F401
except ImportError:
    _du = types.ModuleType("dateutil")
    _rd = types.ModuleType("dateutil.relativedelta")
    _rd.relativedelta = object
    sys.modules["dateutil"] = _du
    sys.modules["dateutil.relativedelta"] = _rd

# --- заглушка supabase.create_client ---
import supabase as _sb


class _Res:
    def __init__(self, data=None):
        self.data = data


class _Q:
    def __init__(self, table):
        self.table = table

    def __getattr__(self, name):
        return lambda *a, **k: self

    def maybe_single(self):
        return self

    def execute(self):
        if self.table == "profiles":
            return _Res([{"name": "Тест", "goal": "lose", "weight": 82, "height": 180, "age": 30, "gender": "male", "target_weight": 75}])
        return _Res(None)


class _Client:
    def table(self, name):
        return _Q(name)


_sb.create_client = lambda *a, **k: _Client()

import main  # noqa: E402

captured = {}


def fake_create(**kwargs):
    captured["messages"] = kwargs["messages"]
    sys_prompt = kwargs["messages"][0]["content"]
    last = kwargs["messages"][-1]["content"]
    if "сводку дня" in last:
        payload = {"headline": "Пора на ноги", "message": "Ноги не тренировались 6 дней.", "suggestion": "Составь тренировку ног"}
    elif "выпил" in last:
        payload = {"reply": "Записал воду", "should_log_meal": False, "calories": 0, "log_water_ml": "500", "log_weight_kg": 0, "workout_plan": None}
    elif "вешу" in last:
        payload = {"reply": "Записал вес", "should_log_meal": False, "log_weight_kg": 82.5}
    elif "съел" in last:
        payload = {"reply": "Записал", "should_log_meal": True, "calories": "330", "protein": 62, "fat": 7, "carbs": 0}
    elif "Составь тренировку" in last:
        payload = {"plan_name": "Грудь", "exercises": [{"exercise": "Жим лёжа", "sets": [{"target_reps": "8", "target_weight": "60"}, "мусор"]}, {"exercise": ""}]}
    elif "Проанализируй текст тренировки" in last:
        payload = {"workouts": [{"exercise": "Жим", "weight": "100", "reps": "5"}, {"weight": 10}, "x"]}
    else:
        payload = {"reply": "Сегодня — ноги", "should_log_meal": False, "workout_plan": {"plan_name": "Ноги", "exercises": [{"exercise": "Присед", "sets": [{"target_reps": 8, "target_weight": 80}]}]}}
    msg = types.SimpleNamespace(content=json.dumps(payload, ensure_ascii=False))
    return types.SimpleNamespace(choices=[types.SimpleNamespace(message=msg)])


main.client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=fake_create)))

from fastapi.testclient import TestClient  # noqa: E402

c = TestClient(main.app)
ctx = "Сейчас: 2026-11-12 (четверг)\nТРЕНИРОВКИ: Грудь — вчера; Ноги — 6 дней назад"
ok = True


def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name, extra)
    ok = ok and cond


r = c.post("/chat", json={"messages": [{"role": "user", "content": "что сделать сегодня?"}], "user_id": "u1", "app_context": ctx, "persona": "strict"})
check("chat 200", r.status_code == 200, r.text[:200])
j = r.json()
check("chat plan cleaned", j["workout_plan"]["exercises"][0]["exercise"] == "Присед")
sp = captured["messages"][0]["content"]
check("context in prompt", "Ноги — 6 дней назад" in sp)
check("persona strict in prompt", "строгий" in sp)
check("profile in prompt", "Целевой вес: 75" in sp)

r = c.post("/chat", json={"messages": [{"role": "user", "content": "я выпил 500 мл воды"}], "app_context": ctx})
check("water action", r.json().get("water_ml") == 500, r.text[:200])
r = c.post("/chat", json={"messages": [{"role": "user", "content": "я вешу 82.5"}], "app_context": ctx})
check("weight action", r.json().get("weight_kg") == 82.5, r.text[:200])
r = c.post("/chat", json={"messages": [{"role": "user", "content": "я съел 200г курицы"}], "app_context": ctx})
check("food logged as numbers", r.json().get("calories") == 330 and r.json().get("water_ml") == 0, r.text[:200])

long_hist = [{"role": "user" if i % 2 == 0 else "assistant", "content": "x" * 4500} for i in range(40)]
r = c.post("/chat", json={"messages": long_hist + [{"role": "system", "content": "evil"}], "app_context": "y" * 20000})
check("long chat 200", r.status_code == 200, str(r.status_code))
check("history capped", 10 < len(captured["messages"]) <= 1 + main.MAX_CHAT_MESSAGES, str(len(captured["messages"])))
check("message chars capped", all(len(m["content"]) <= main.MAX_MESSAGE_CHARS + 200 for m in captured["messages"][1:]))
check("system role dropped", all(m["role"] != "system" for m in captured["messages"][1:]))
check("context capped", captured["messages"][0]["content"].count("y") <= main.MAX_CONTEXT + 50)

r = c.post("/companion/brief", json={"app_context": ctx, "persona": "calm"})
check("brief", r.status_code == 200 and r.json().get("headline") == "Пора на ноги", r.text[:200])

r = c.post("/generate_workout_plan", json={"muscle_group": "Грудь", "preferences": "", "app_context": ctx})
pj = r.json()
check("plan cleaned", r.status_code == 200 and pj["plan"]["exercises"] == [{"exercise": "Жим лёжа", "sets": [{"target_reps": 8, "target_weight": 60.0}]}], r.text[:300])

r = c.post("/parse", json={"text": "жим 100 5"})
check("parse cleaned", r.json().get("parsed_data") == [{"exercise": "Жим", "weight": 100.0, "reps": 5}], r.text[:200])

r = c.get("/health")
check("health", r.status_code == 200)

# --- совместимость со СТАРОЙ версией приложения (она остаётся у пользователей до OTA) ---
# Старый клиент шлёт только messages/user_id/норму — без app_context и persona, и читает
# из ответа reply/calories/protein/fat/carbs/workout_plan.
r = c.post("/chat", json={"messages": [{"role": "user", "content": "я съел 200г курицы"}], "user_id": "u1",
                          "daily_calorie_norm": 2400, "daily_macros": {"protein": 150, "fat": 60, "carb": 250}})
j = r.json()
check("old client chat 200", r.status_code == 200, r.text[:200])
check("old client response fields", all(k in j for k in ("reply", "calories", "protein", "fat", "carbs", "workout_plan")) and j["calories"] == 330)
sp = captured["messages"][0]["content"]
check("old client gets DB history fallback", "Истории тренировок пока нет" in sp and "КОНТЕКСТ ПРИЛОЖЕНИЯ (актуальные" not in sp)
check("old client norm in prompt", "Дневная норма калорий: 2400" in sp)
check("old client: no water/weight actions in prompt", "log_water_ml" not in sp and "ПРАВИЛО 2.1" not in sp)
r = c.post("/chat", json={"messages": [{"role": "user", "content": "я выпил 500 мл воды"}], "user_id": "u1"})
check("old client: water action ignored", r.status_code == 200 and r.json().get("water_ml") == 0, r.text[:160])
r = c.post("/chat", json={"messages": [{"role": "user", "content": "что сделать сегодня?"}], "user_id": "u1", "app_context": ctx})
check("new client: actions rule present", "ПРАВИЛО 2.1" in captured["messages"][0]["content"] and '"log_water_ml": 0' in captured["messages"][0]["content"])
r = c.post("/generate_workout_plan", json={"muscle_group": "Грудь", "preferences": "", "user_id": "u1"})
check("old client plan 200", r.status_code == 200 and r.json()["plan"]["exercises"][0]["exercise"] == "Жим лёжа", r.text[:200])
r = c.post("/parse_meals", json={"text": "овсянка", "user_id": "u1"})
check("old client parse_meals 200", r.status_code == 200, r.text[:200])
r = c.post("/calculate_loss", json={"weight": 80, "exercises": [{"exercise": "x"}, {"exercise": "y"}]})
check("calculate_loss", r.status_code == 200 and r.json()["burned_kcal"] == 30)

print("ALL OK" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
