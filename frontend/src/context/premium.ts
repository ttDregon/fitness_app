import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import type { Purchase } from 'expo-iap';
import { fetchPremiumStatus, verifyPremiumPurchase, type PremiumStatus } from '../api/backend';
import {
  billingSupported, connectBilling, loadPremiumOffers, startPremiumPurchase, ownedPremiumPurchases,
  finishPremiumPurchase, onPurchaseUpdated, isUserCancelled, isAlreadyOwned, openManageSubscription,
} from '../lib/billing';
import { PREMIUM_PLANS, PREMIUM_PRODUCT_ID, PLAY_STORE_URL } from '../config/billing';
import { buildPlanOffers, isPremiumActive, formatPremiumDate, type PlanOffer } from '../utils/premium';
import { appAlert } from '../components/AppAlert';

// Почему открыт экран Премиума — от этого зависит заголовок.
export type PaywallReason = 'banner' | 'profile' | 'trainer' | 'limit_chat' | 'limit_parse' | 'limit_plan';
// Состояние тарифов из Google Play: loading → ready | unsupported (нет модуля оплаты в этой
// сборке) | unavailable (Google Play не отдал подписку: не вошли в Play, тарифы не созданы).
export type OffersState = 'idle' | 'loading' | 'ready' | 'unsupported' | 'unavailable';
export type PurchaseFlow = 'idle' | 'buying' | 'verifying' | 'pending';

const STATUS_REFRESH_MS = 5 * 60 * 1000; // при возврате в приложение — не чаще раза в 5 минут

/**
 * Премиум: статус (только с сервера), экран тарифов, покупка через Google Play.
 * Подключается в AppContext; uid — текущий пользователь (смена аккаунта сбрасывает состояние).
 */
export function usePremiumController(uid: string | null | undefined) {
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [premiumPlan, setPremiumPlan] = useState<string | null>(null);
  const [premiumSource, setPremiumSource] = useState<string | null>(null);
  const [autoRenewing, setAutoRenewing] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason | null>(null);
  const [planOffers, setPlanOffers] = useState<PlanOffer[]>([]);
  const [offersState, setOffersState] = useState<OffersState>('idle');
  const [purchaseFlow, setPurchaseFlow] = useState<PurchaseFlow>('idle');
  const [isRestoring, setIsRestoring] = useState(false);

  const isPremium = isPremiumActive(premiumUntil);

  // Ответы приходят асинхронно (Google Play, Render) — сверяем, что аккаунт тот же.
  const uidRef = useRef<string | null>(uid || null);
  useEffect(() => { uidRef.current = uid || null; }, [uid]);
  const lastStatusAt = useRef(0);
  const inFlight = useRef(new Set<string>()); // токены, которые сейчас проверяются

  const applyStatus = (s: Partial<PremiumStatus> | null | undefined) => {
    if (!s) return;
    setPremiumUntil(s.premium ? s.premium_until || null : null);
    setPremiumPlan(s.premium ? s.plan || null : null);
    setPremiumSource(s.premium ? s.source || null : null);
    setAutoRenewing(!!(s.premium && s.auto_renewing));
  };

  /** Быстрый статус из строки профиля (select('*') в AppContext), пока не ответил бэкенд. */
  const applyProfilePremium = (row: any) => {
    if (!row || lastStatusAt.current) return; // ответ бэкенда точнее — не перетираем его
    if (row.premium_until !== undefined) {
      const active = isPremiumActive(row.premium_until);
      setPremiumUntil(active ? row.premium_until : null);
      setPremiumPlan(active ? row.premium_plan || null : null);
      setPremiumSource(active ? row.premium_source || null : null);
    }
  };

  const refreshPremium = async (): Promise<PremiumStatus | null> => {
    const forUid = uidRef.current;
    if (!forUid) return null;
    try {
      const s = await fetchPremiumStatus(forUid);
      if (uidRef.current !== forUid) return null;
      lastStatusAt.current = Date.now();
      applyStatus(s);
      return s;
    } catch {
      return null; // офлайн / Render спит — остаётся статус из профиля
    }
  };

  // Проверка одной покупки на сервере. silent — восстановление при запуске (без сообщений).
  const verifyPurchase = async (purchase: Purchase, silent: boolean) => {
    const token = purchase.purchaseToken;
    const forUid = uidRef.current;
    if (!token || !forUid || inFlight.current.has(token)) return;
    if (purchase.purchaseState === 'pending') {
      if (!silent) {
        setPurchaseFlow('pending');
        appAlert('Платёж обрабатывается', 'Google Play ещё не подтвердил оплату. Премиум включится сам, как только платёж пройдёт.');
      }
      return;
    }
    inFlight.current.add(token);
    if (!silent) setPurchaseFlow('verifying');
    try {
      const res = await verifyPremiumPurchase(token, purchase.productId || PREMIUM_PRODUCT_ID, forUid);
      if (uidRef.current !== forUid) return;
      if (res.status === 'active' || res.status === 'inactive') {
        lastStatusAt.current = Date.now();
        applyStatus(res);
        if (!res.acknowledged) await finishPremiumPurchase(purchase);
      }
      if (silent) return;
      if (res.status === 'active') {
        setPaywallReason(null);
        appAlert('Премиум включён 🎉', res.premium_until ? `Доступ открыт до ${formatPremiumDate(res.premium_until)}. Спасибо, что поддерживаете Striva!` : 'Спасибо, что поддерживаете Striva!');
      } else if (res.status === 'pending') {
        setPurchaseFlow('pending');
        appAlert('Платёж обрабатывается', 'Google Play ещё не подтвердил оплату. Премиум включится сам, как только платёж пройдёт.');
        return;
      } else if (res.status === 'foreign') {
        appAlert('Подписка на другом аккаунте', 'Эта подписка Google Play уже привязана к другому аккаунту Striva. Войдите в тот аккаунт или оформите подписку на этот.');
      } else if (res.status === 'unavailable') {
        appAlert('Оплата прошла', 'Сервер пока не может проверить покупку. Премиум включится автоматически при следующем запуске приложения.');
      } else {
        appAlert('Подписка не активна', 'Google Play не подтвердил эту покупку. Если деньги списались — напишите в поддержку, указав номер заказа из письма Google Play.');
      }
    } catch (e: any) {
      // Оплата прошла, а проверка не дошла (сеть, Render спит). Покупка не подтверждена —
      // при следующем запуске её найдёт ownedPremiumPurchases и проверит снова (у Google есть
      // 3 дня до автоматического возврата).
      if (!silent) appAlert('Оплата прошла', `${e?.message || 'Не удалось связаться с сервером.'} Премиум включится автоматически при следующем запуске приложения.`);
    } finally {
      inFlight.current.delete(token);
      if (!silent) setPurchaseFlow(prev => (prev === 'pending' ? prev : 'idle'));
    }
  };
  const verifyRef = useRef(verifyPurchase);
  useEffect(() => { verifyRef.current = verifyPurchase; });

  // Слушатели покупок — на весь запуск (покупка может «доехать» и после закрытия экрана).
  useEffect(() => {
    if (!billingSupported()) return;
    const off = onPurchaseUpdated(
      p => { if (p.productId === PREMIUM_PRODUCT_ID) verifyRef.current(p, false); },
      e => {
        setPurchaseFlow('idle');
        if (isUserCancelled(e)) return;
        if (isAlreadyOwned(e)) { restorePurchases(); return; }
        appAlert('Оплата не прошла', e?.message || 'Google Play вернул ошибку. Попробуйте ещё раз.');
      },
    );
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сменился пользователь: сбрасываем, спрашиваем статус у сервера и тихо досылаем на проверку
  // покупки, которые Google Play числит за телефоном (переустановка, прерванная проверка).
  useEffect(() => {
    setPremiumUntil(null); setPremiumPlan(null); setPremiumSource(null); setAutoRenewing(false);
    setPaywallReason(null); setPurchaseFlow('idle');
    lastStatusAt.current = 0;
    if (!uid) return;
    refreshPremium();
    if (billingSupported()) {
      ownedPremiumPurchases()
        .then(list => list.forEach(p => verifyRef.current(p, true)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Возврат в приложение: подтягиваем продление/отмену (не чаще раза в 5 минут).
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active' && uidRef.current && Date.now() - lastStatusAt.current > STATUS_REFRESH_MS) refreshPremium();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOffers = async () => {
    if (!billingSupported()) { setOffersState('unsupported'); return; }
    setOffersState('loading');
    try {
      const offers = buildPlanOffers(await loadPremiumOffers(), PREMIUM_PLANS);
      setPlanOffers(offers);
      setOffersState(offers.length ? 'ready' : 'unavailable');
    } catch {
      setOffersState('unavailable');
    }
  };

  const openPaywall = (reason: PaywallReason = 'banner') => {
    setPaywallReason(reason);
    if (offersState !== 'ready') loadOffers();
    if (Date.now() - lastStatusAt.current > STATUS_REFRESH_MS) refreshPremium();
  };
  const closePaywall = () => {
    setPaywallReason(null);
    setPurchaseFlow(prev => (prev === 'pending' ? 'idle' : prev));
  };

  /** Гейт платной функции: true — можно; иначе открывает экран Премиума. */
  const requirePremium = (reason: PaywallReason): boolean => {
    if (isPremium) return true;
    openPaywall(reason);
    return false;
  };

  const buyPlan = async (planId: string) => {
    const offer = planOffers.find(o => o.planId === planId);
    const forUid = uidRef.current;
    if (!offer || !forUid || purchaseFlow === 'buying' || purchaseFlow === 'verifying') return;
    setPurchaseFlow('buying');
    try {
      await startPremiumPurchase(offer.offerToken, forUid);
      // Дальше — purchaseUpdatedListener (успех) или purchaseErrorListener (отмена/ошибка).
    } catch (e: any) {
      setPurchaseFlow('idle');
      if (isUserCancelled(e)) return;
      if (isAlreadyOwned(e)) { restorePurchases(); return; }
      appAlert('Оплата не прошла', e?.message === 'billing-unavailable'
        ? 'Google Play Billing недоступен на этом устройстве. Проверьте, что вы вошли в Google Play.'
        : e?.message || 'Попробуйте ещё раз.');
    }
  };

  /** «Восстановить покупки»: подписка оформлена раньше (другой телефон, переустановка). */
  const restorePurchases = async () => {
    if (!uidRef.current) return;
    setIsRestoring(true);
    try {
      const list = billingSupported() && (await connectBilling()) ? await ownedPremiumPurchases() : [];
      for (const p of list) await verifyRef.current(p, true);
      const s = await refreshPremium();
      if (s?.premium) {
        setPaywallReason(null);
        appAlert('Премиум восстановлен', s.premium_until ? `Доступ открыт до ${formatPremiumDate(s.premium_until)}.` : 'Доступ открыт.');
      } else {
        appAlert('Покупок не найдено', list.length
          ? 'Подписка Google Play на этом телефоне неактивна или привязана к другому аккаунту Striva.'
          : 'Google Play не нашёл подписку Striva Премиум для аккаунта Google на этом телефоне.');
      }
    } catch {
      appAlert('Не удалось проверить', 'Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setIsRestoring(false);
    }
  };

  const manageSubscription = () => { openManageSubscription(); };
  const openStoreUpdate = () => { Linking.openURL(PLAY_STORE_URL).catch(() => {}); };

  return {
    isPremium, premiumUntil, premiumPlan, premiumSource, autoRenewing,
    paywallReason, openPaywall, closePaywall, requirePremium,
    planOffers, offersState, loadOffers, purchaseFlow, buyPlan,
    isRestoring, restorePurchases, manageSubscription, openStoreUpdate,
    refreshPremium, applyProfilePremium,
  };
}
