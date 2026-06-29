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

// Парсинг текста тренировки -> { parsed_data: [...] } | { status: 'limit_reached' }
export async function parseWorkout(text: string, userId?: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/parse`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ text, user_id: userId }),
  });
  if (!response.ok) throw new Error('Бэкенд сервер не отвечает');
  return response.json();
}

// Распознавание блюда -> { name, calories, protein, fat, carbs }
export async function parseMeal(text: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/parse_meal`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Ошибка сервера: статус ${response.status}`);
  return response.json();
}

// Разбор питания на приёмы и продукты -> { meals: [{ meal_type, items: [{name,calories,protein,fat,carbs}] }] }
export async function parseMeals(text: string, userId?: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/parse_meals`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ text, user_id: userId }),
  });
  if (!response.ok) throw new Error(`Ошибка сервера: статус ${response.status}`);
  return response.json();
}

// Расчёт сожжённых калорий -> { burned_kcal, weight_loss_kg }
export async function calculateLoss(weight: number, exercises: WorkoutData[]): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/calculate_loss`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ weight, exercises }),
  });
  if (!response.ok) throw new Error('calculate_loss failed');
  return response.json();
}

// Отправить пуш конкретному пользователю (через бэкенд → Expo Push API).
// Fire-and-forget: любые ошибки глушим, чтобы не ломать основной поток.
export async function notifyUser(toUserId: string, title: string, body: string, data: Record<string, any> = {}): Promise<void> {
  try {
    await fetch(`${getBackendUrl()}/notify`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ to_user_id: toUserId, title, body, data }),
    });
  } catch {}
}

// Чат с ИИ -> { reply, calories, protein, fat, carbs }
export async function sendChat(messages: { role: string; content: string }[], userId?: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/chat`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ messages, user_id: userId }),
  });
  if (!response.ok) throw new Error('Бэкенд не отвечает');
  return response.json();
}
