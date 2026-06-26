import type { WorkoutData } from '../types';

export const getBackendUrl = (): string => {
  // Вставь сюда публичный URL туннеля (например, VS Code Ports, ngrok, localtunnel), если используешь его.
  // Пример: const TUNNEL_URL = 'https://xxxx-8000.app.online.visualstudio.com';
  const TUNNEL_URL = 'https://fitness-app-backend-4q04.onrender.com';
  if (TUNNEL_URL) return TUNNEL_URL;

  // Иначе используй локальный IP-адрес компьютера
  const MY_PC_IP = '192.168.0.107';
  return `http://${MY_PC_IP}:8000`;
};

// Парсинг текста тренировки -> { parsed_data: [...] }
export async function parseWorkout(text: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error('Бэкенд сервер не отвечает');
  return response.json();
}

// Распознавание блюда -> { name, calories, protein, fat, carbs }
export async function parseMeal(text: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/parse_meal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Ошибка сервера: статус ${response.status}`);
  return response.json();
}

// Разбор питания на приёмы и продукты -> { meals: [{ meal_type, items: [{name,calories,protein,fat,carbs}] }] }
export async function parseMeals(text: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/parse_meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Ошибка сервера: статус ${response.status}`);
  return response.json();
}

// Расчёт сожжённых калорий -> { burned_kcal, weight_loss_kg }
export async function calculateLoss(weight: number, exercises: WorkoutData[]): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/calculate_loss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight, exercises }),
  });
  if (!response.ok) throw new Error('calculate_loss failed');
  return response.json();
}

// Чат с ИИ -> { reply, calories, protein, fat, carbs }
export async function sendChat(messages: { role: string; content: string }[], userId?: string): Promise<any> {
  const response = await fetch(`${getBackendUrl()}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, user_id: userId }),
  });
  if (!response.ok) throw new Error('Бэкенд не отвечает');
  return response.json();
}
