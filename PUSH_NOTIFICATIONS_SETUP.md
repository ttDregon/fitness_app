# Пуш-уведомления — что нужно сделать (один раз)

Код уже написан (фронт + бэкенд). Осталось внешнее, что я сделать за тебя не могу.
Пуши требуют **новой сборки APK** — по воздуху (OTA) их не доставить.

> ⚠️ `runtimeVersion` поднят с `1.0.0` → `1.1.0`. Это значит: **обновления теперь идут
> только на новую сборку**. Старый установленный APK больше не получает OTA — нужно
> поставить новый APK из шага 5.

## 1. Firebase (для удалённых пушей на Android)
- Зайди в https://console.firebase.google.com → создай проект (или возьми существующий).
- Add app → Android. Package name: **`com.ttdregon.mysafeapp`**.
- Скачай **`google-services.json`** и положи в папку `frontend/` (рядом с `app.json`).
  (в `app.json` уже прописано `android.googleServicesFile: "./google-services.json"`)

## 2. FCM-ключ для Expo (чтобы Expo мог отправлять в FCM)
- Firebase Console → ⚙️ Project settings → **Service accounts** → *Generate new private key* → скачается JSON.
- Загрузи его в EAS: `cd frontend && eas credentials` → Android → *Push Notifications: FCM V1* → загрузить JSON.
  (или через https://expo.dev → проект → Credentials)

## 3. Supabase: таблица токенов
- Открой Supabase → SQL Editor → выполни файл `backend/push_tokens.sql`.
- Убедись, что на бэкенде `SUPABASE_KEY` — это **service_role** ключ
  (иначе `/notify` не сможет читать токены клиентов; либо раскомментируй политику в конце SQL).

## 4. Бэкенд: задеплоить /notify
- Закоммить и запушь — Render передеплоит. `httpx` уже в `requirements.txt`.
- Проверь, что живой: открой `https://fitness-app-backend-4q04.onrender.com/` → `{"status":"ok"}`.

## 5. Собрать и поставить новый APK
```
cd frontend
eas build -p android --profile preview
```
- Скачай готовый APK по ссылке из консоли и установи (поверх старого).
- ⚠️ Нужен **реальный телефон** — на эмуляторе push-токен не выдаётся.

## 6. Проверка
- Открой приложение → разреши уведомления (токен сохранится в `push_tokens` автоматически).
- **Удалённый пуш:** под аккаунтом тренера назначь клиенту тренировку или запись →
  на телефоне клиента придёт уведомление (даже если приложение закрыто).
- **Локальные напоминания:** клиенту автоматически ставятся напоминания за час и в момент
  начала каждой его ближайшей тренировки.
- Тап по уведомлению открывает нужную вкладку.

## Что уже в коде
- `frontend/src/lib/notifications.ts` — разрешения, токен, локальные напоминания, Android-канал.
- `frontend/src/context/AppContext.tsx` — регистрация токена при входе, обработка тапа,
  напоминания клиенту, отправка пушей при действиях тренера.
- `frontend/src/api/backend.ts` — `notifyUser()`.
- `backend/main.py` — эндпоинт `/notify` (Expo Push API).
- `backend/push_tokens.sql` — таблица токенов.
