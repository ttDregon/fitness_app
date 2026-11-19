import type { ChatMessage, ChatSession } from '../types';

// Чистая логика синхронизации истории ИИ-чата с облаком (таблица chat_sessions, см.
// db/phase9_chat_sync.sql). Без сети и React — проверяется в scripts/logic-test.js.
//
// Модель простая: диалог целиком — одна строка, побеждает копия с бо́льшим updatedAt
// (каждое изменение диалога в приложении его обновляет). Удаление — «надгробие»
// (deleted = true), чтобы диалог, удалённый на одном телефоне, не вернулся с другого.

/** Лёгкий список с сервера: без текста сообщений, только чтобы понять, что докачать. */
export interface RemoteChatMeta { id: string; updated_at: number | string; deleted: boolean; }
/** Полная строка chat_sessions. */
export interface RemoteChatRow extends RemoteChatMeta { title: string; messages: unknown; }

const ts = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const isMessage = (m: any): m is ChatMessage =>
  !!m && typeof m.id === 'string' && typeof m.text === 'string' && (m.sender === 'user' || m.sender === 'ai');

/** Строка сервера → диалог приложения (мусор в messages отбрасываем, а не роняем экран). */
export function rowToSession(r: RemoteChatRow): ChatSession {
  const messages = Array.isArray(r.messages) ? (r.messages as unknown[]).filter(isMessage) : [];
  return { id: String(r.id), title: r.title || 'Диалог', messages, updatedAt: ts(r.updated_at) };
}

/** Какие диалоги надо скачать целиком: на сервере свежее, чем на телефоне (или их тут нет). */
export function chatIdsToFetch(local: ChatSession[], meta: RemoteChatMeta[], pendingDeletes: string[] = []): string[] {
  const loc = new Map(local.map(s => [s.id, s.updatedAt]));
  const del = new Set(pendingDeletes);
  return meta
    .filter(m => !m.deleted && !del.has(String(m.id)))
    .filter(m => { const l = loc.get(String(m.id)); return l === undefined || ts(m.updated_at) > l; })
    .map(m => String(m.id));
}

/**
 * Свести локальные диалоги с серверными. meta — все строки пользователя (лёгкие),
 * full — полные строки для id из chatIdsToFetch. Локальные правки, которых ещё нет на
 * сервере, сохраняются; удалённые на другом устройстве — убираются.
 */
export function applyRemoteChats(
  local: ChatSession[], meta: RemoteChatMeta[], full: RemoteChatRow[], pendingDeletes: string[] = [],
): ChatSession[] {
  const metaById = new Map(meta.map(m => [String(m.id), m]));
  const fullById = new Map(full.map(r => [String(r.id), r]));
  const del = new Set(pendingDeletes);
  const out: ChatSession[] = [];
  const seen = new Set<string>();

  for (const l of local) {
    if (del.has(l.id) || seen.has(l.id)) continue;
    seen.add(l.id);
    const m = metaById.get(l.id);
    if (m?.deleted && ts(m.updated_at) >= l.updatedAt) continue;   // удалён на другом устройстве
    const r = fullById.get(l.id);
    if (m && !m.deleted && r && ts(r.updated_at) > l.updatedAt) out.push(rowToSession(r));
    else out.push(l);
  }
  for (const r of full) {
    const id = String(r.id);
    if (seen.has(id) || del.has(id) || r.deleted) continue;
    seen.add(id);
    out.push(rowToSession(r));
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Версии, которые уже лежат на сервере (id → updatedAt), включая «надгробия»: с ними
 *  сравнивается, что отправить. Копия диалога, удалённого на другом устройстве, старше его
 *  надгробия — значит, не «грязная» и не воскресит диалог. */
export function syncedVersions(meta: RemoteChatMeta[]): Record<string, number> {
  const out: Record<string, number> = {};
  meta.forEach(m => { out[String(m.id)] = ts(m.updated_at); });
  return out;
}

/** Диалоги, которые изменились на телефоне после последней синхронизации. Копию старше
 *  серверной не отправляем никогда — она затёрла бы более свежую переписку. */
export function dirtyChats(sessions: ChatSession[], synced: Record<string, number>): ChatSession[] {
  return sessions.filter(s => synced[s.id] === undefined || s.updatedAt > synced[s.id]);
}

/** Новая отметка времени изменения диалога. Всегда больше прежней — даже если часы этого
 *  телефона отстают от того, где диалог правили в прошлый раз (иначе правка «проигрывала»
 *  бы старой копии при сведении). */
export function nextChatStamp(prev?: { updatedAt?: number } | null, now = Date.now()): number {
  return Math.max(now, (prev?.updatedAt || 0) + 1);
}
