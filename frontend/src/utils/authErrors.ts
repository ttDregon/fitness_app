// Supabase Auth отвечает по-английски («Invalid login credentials») — пользователь видел
// эти тексты как есть. Переводим частые случаи; неизвестное показываем как пришло.
const RULES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Неверный email или пароль.'],
  [/email not confirmed/i, 'Email не подтверждён. Откройте письмо от Striva и перейдите по ссылке.'],
  [/user already registered|already been registered|already exists/i, 'Аккаунт с таким email уже есть. Попробуйте войти.'],
  [/password should be at least|password.*(short|length)/i, 'Пароль должен быть не короче 6 символов.'],
  [/weak password|password is too weak|pwned/i, 'Слишком простой пароль. Добавьте цифры и буквы разного регистра.'],
  [/invalid format|unable to validate email|invalid email/i, 'Некорректный email.'],
  [/rate limit|too many requests|only request this after|security purposes/i, 'Слишком много попыток. Подождите минуту и попробуйте снова.'],
  [/signups not allowed|signup.*disabled/i, 'Регистрация временно недоступна.'],
  [/refresh token|session.*(expired|missing|not found)|jwt expired/i, 'Сессия истекла. Войдите заново.'],
  [/network request failed|failed to fetch|fetch failed|network|timeout/i, 'Нет соединения с сервером. Проверьте интернет.'],
];

export function translateAuthError(error: unknown): string {
  const msg = String((error as any)?.message || error || '').trim();
  for (const [re, text] of RULES) if (re.test(msg)) return text;
  return msg || 'Неизвестная ошибка. Попробуйте ещё раз.';
}

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
