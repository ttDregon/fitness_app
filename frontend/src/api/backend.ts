import type { WorkoutData } from '../types';
import { supabase } from '../lib/supabase';

// Заголовки запроса к бэкенду + токен текущей сессии Supabase.
// Бэкенд проверяет этот токен и берёт user_id ТОЛЬКО из него (защита от подмены
// чужого user_id и злоупотребления лимитами/уведомлениями).
async function authHeaders(): Promise<Record<string, string>> {
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) base.Authorization = `Bearer ${token}`;
  } catch {}
  return base;
}

export const getBackendUrl = (): string => {
  // Вставь сюда публичный URL туннеля (например, VS Code Ports, ngrok, localtunnel), если используешь его.
  // Пример: const TUNNEL_URL = 'https://xxxx-8000.app.online.visualstudio.com';
  const TUNNEL_URL = 'https://fitness-app-backend-4q04.onrender.com';
  if (TUNNEL_URL) return TUNNEL_URL;

  // Иначе используй локальный IP-адрес компьютера
  const MY_PC_IP = '192.168.0.107';
  return `http://${MY_PC_IP}:8000`;
};

// POST на бэкенд с таймаутом. Раньше fetch шёл без ограничения: если сервер на Render
// «просыпался» или сеть пропадала, кнопка крутила спиннер бесконечно. 75 с — с запасом
// на холодный старт Render (30–60 с) + ответ ИИ.
async function post(path: string, body: unknown, timeoutMs = 75000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${getBackendUrl()}${path}`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Сервер долго не отвечает. Попробуйте ещё раз.');
    throw new Error('Нет соединения с сервером. Проверьте интернет.');
  } finally {
    clearTimeout(timer);
  }
}

// Парсинг текста тренировки -> { parsed_data: [...] } | { status: 'limit_reached' }
export async function parseWorkout(text: string, userId?: string): Promise<any> {
  const response = await post('/parse', { text, user_id: userId });
  if (!response.ok) throw new Error('Бэкенд сервер не отвечает');
  return response.json();
}

// Разбор питания на приёмы и продукты -> { meals: [{ meal_type, items: [{name,calories,protein,fat,carbs}] }] }
export async function parseMeals(text: string, userId?: string): Promise<any> {
  const response = await post('/parse_meals', { text, user_id: userId });
  if (!response.ok) throw new Error(`Ошибка сервера: статус ${response.status}`);
  return response.json();
}

// Расчёт сожжённых калорий -> { burned_kcal, weight_loss_kg }
export async function calculateLoss(weight: number, exercises: WorkoutData[]): Promise<any> {
  const response = await post('/calculate_loss', { weight, exercises }, 30000);
  if (!response.ok) throw new Error('calculate_loss failed');
  return response.json();
}

// Отправить пуш конкретному пользователю (через бэкенд → Expo Push API).
// Fire-and-forget: любые ошибки глушим, чтобы не ломать основной поток.
export async function notifyUser(toUserId: string, title: string, body: string, data: Record<string, any> = {}): Promise<void> {
  try {
    await post('/notify', { to_user_id: toUserId, title, body, data }, 30000);
  } catch {}
}

export type CompanionPersona = 'friendly' | 'strict' | 'calm';

// Чат с ИИ-компаньоном -> { reply, calories, protein, fat, carbs, water_ml, weight_kg, workout_plan }
// dailyCalorieNorm/dailyMacros — уже посчитанная на клиенте норма (см. utils/nutrition.ts),
// appContext — снимок данных приложения (см. utils/companion.ts): так компаньон «видит»
// журнал, рекорды, вес, питание и воду, план тренера и отвечает по реальным данным.
export async function sendChat(
  messages: { role: string; content: string }[],
  userId?: string,
  dailyCalorieNorm?: number,
  dailyMacros?: { protein: number; fat: number; carb: number },
  appContext?: string,
  persona?: CompanionPersona,
): Promise<any> {
  const response = await post('/chat', {
    messages, user_id: userId, daily_calorie_norm: dailyCalorieNorm, daily_macros: dailyMacros,
    app_context: appContext, persona,
  });
  if (!response.ok) throw new Error('Бэкенд не отвечает');
  return response.json();
}

// Короткая сводка компаньона на день (карточка на главном) -> { status, headline, message, suggestion }
export async function fetchCompanionBrief(appContext: string, persona: CompanionPersona, userId?: string): Promise<any> {
  const response = await post('/companion/brief', { app_context: appContext, persona, user_id: userId });
  if (!response.ok) throw new Error('Бэкенд не отвечает');
  return response.json();
}

// Генерация ИИ-плана тренировки под группу мышц -> { status, plan: { plan_name, exercises } }
export async function generateWorkoutPlan(muscleGroup: string, preferences: string, userId?: string, appContext?: string): Promise<any> {
  const response = await post('/generate_workout_plan', { muscle_group: muscleGroup, preferences, user_id: userId, app_context: appContext });
  if (!response.ok) throw new Error('Бэкенд не отвечает');
  return response.json();
}
