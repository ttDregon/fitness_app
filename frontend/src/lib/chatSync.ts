import { supabase } from './supabase';
import type { ChatSession } from '../types';
import type { RemoteChatMeta, RemoteChatRow } from '../utils/chatSync';

// Сетевая часть синхронизации истории ИИ-чата (таблица chat_sessions, db/phase9_chat_sync.sql).
// Логика сведения — в utils/chatSync.ts. Все функции не бросают: при ошибке (нет сети, таблица
// ещё не создана) возвращают null/false, и приложение работает с локальной историей, как раньше.

const TABLE = 'chat_sessions';
const CHUNK = 40; // диалогов за один запрос — чтобы не упираться в размер ответа

/** Список диалогов пользователя на сервере, без текста. null — сервер недоступен. */
export async function fetchChatMeta(uid: string): Promise<RemoteChatMeta[] | null> {
  try {
    const { data, error } = await supabase.from(TABLE).select('id, updated_at, deleted').eq('user_id', uid).limit(2000);
    if (error) return null;
    return (data || []) as RemoteChatMeta[];
  } catch { return null; }
}

/** Полные строки для указанных диалогов. null — не удалось скачать хотя бы часть. */
export async function fetchChatRows(uid: string, ids: string[]): Promise<RemoteChatRow[] | null> {
  const out: RemoteChatRow[] = [];
  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase.from(TABLE)
        .select('id, title, messages, updated_at, deleted')
        .eq('user_id', uid).in('id', ids.slice(i, i + CHUNK));
      if (error) return null;
      out.push(...((data || []) as RemoteChatRow[]));
    }
    return out;
  } catch { return null; }
}

/** Записать диалоги на сервер. */
export async function upsertChats(uid: string, sessions: ChatSession[]): Promise<boolean> {
  if (!sessions.length) return true;
  try {
    for (let i = 0; i < sessions.length; i += CHUNK) {
      const rows = sessions.slice(i, i + CHUNK).map(s => ({
        user_id: uid, id: s.id, title: (s.title || '').slice(0, 200), messages: s.messages,
        updated_at: s.updatedAt, deleted: false,
      }));
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'user_id,id' });
      if (error) return false;
    }
    return true;
  } catch { return false; }
}

/** Пометить диалоги удалёнными (текст стирается, остаётся только «надгробие»).
 *  deletes: id → отметка времени удаления (nextChatStamp от последней версии диалога). */
export async function pushChatTombstones(uid: string, deletes: Record<string, number>): Promise<boolean> {
  const ids = Object.keys(deletes);
  if (!ids.length) return true;
  try {
    const rows = ids.map(id => ({ user_id: uid, id, title: '', messages: [], updated_at: deletes[id], deleted: true }));
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'user_id,id' });
    return !error;
  } catch { return false; }
}
