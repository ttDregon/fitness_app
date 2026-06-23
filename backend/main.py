import json
import os
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Разрешаем запросы с мобильного приложения
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- НАСТРОЙКИ DEEPSEEK ---
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)

# --- НАСТРОЙКИ SUPABASE ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Модели данных для запросов
class WorkoutNote(BaseModel):
    text: str

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


@app.post("/parse")
async def parse_workout(note: WorkoutNote):
    print(f"\n--- ЗАПРОС К DEEPSEEK (ПАРСИНГ ТРЕНИРОВКИ) ---")
    
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
        return {
            "status": "success",
            "parsed_data": parsed_json.get("workouts", [])
        }
    except Exception as e:
        print(f"❌ Ошибка парсинга: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/parse_meal")
async def parse_meal(data: dict):
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


@app.post("/calculate_loss")
async def calculate_loss(payload: WorkoutLossPayload):
    print(f"\n--- РАСЧЕТ СОЖЖЕННЫХ КАЛОРИЙ ЧЕРЕЗ ЧАС ---")
    total_sets = len(payload.exercises)
    burned_kcal = total_sets * 15 
    weight_loss_kg = burned_kcal / 7000.0
    
    return {
        "burned_kcal": burned_kcal,
        "weight_loss_kg": round(weight_loss_kg, 3)
    }


@app.post("/chat")
async def chat_assistant(req: ChatRequest):
    print(f"\n--- ЗАПРОС К DEEPSEEK (ЧАТ С ПАМЯТЬЮ) ---")
    
    user_context = ""
    if req.user_id:
        try:
            response = supabase.table("profiles").select("*").eq("id", req.user_id).execute()
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
        
        return {
            "reply": parsed_reply.get("reply", "Ошибка формата"),
            "calories": parsed_reply.get("calories", 0),
            "protein": parsed_reply.get("protein", 0),
            "fat": parsed_reply.get("fat", 0),
            "carbs": parsed_reply.get("carbs", 0)
        }
    except Exception as e:
        print(f"❌ Ошибка чата: {e}")
        raise HTTPException(status_code=500, detail=str(e))