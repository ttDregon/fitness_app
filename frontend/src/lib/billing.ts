import { Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as ExpoIapTypes from 'expo-iap';
import type { Purchase, ExpoPurchaseError } from 'expo-iap';
import { PREMIUM_PRODUCT_ID, ANDROID_PACKAGE, MANAGE_SUBSCRIPTION_URL } from '../config/billing';
import type { StoreOffer } from '../utils/premium';

// Google Play Billing через expo-iap. Модуль нативный — он есть только в сборках, собранных
// после его добавления (1.1.0+). В старой сборке, Expo Go или на iOS его нет: тогда все
// функции ниже честно говорят «недоступно», а не роняют приложение.
type Iap = typeof ExpoIapTypes;
let iapModule: Iap | null | undefined;

function iap(): Iap | null {
  if (iapModule !== undefined) return iapModule;
  iapModule = null;
  if (Platform.OS !== 'android') return null;
  try {
    if (requireOptionalNativeModule('ExpoIap')) iapModule = require('expo-iap') as Iap;
  } catch {
    iapModule = null;
  }
  return iapModule;
}

export const billingSupported = (): boolean => !!iap();

let connected: Promise<boolean> | null = null;

/** Подключиться к Google Play Billing (один раз за запуск). false — оплата недоступна. */
export function connectBilling(): Promise<boolean> {
  const m = iap();
  if (!m) return Promise.resolve(false);
  if (!connected) {
    // Неудачу не кэшируем: Google Play мог быть временно недоступен — попробуем при следующем вызове.
    connected = m.initConnection()
      .then(r => { if (r === false) connected = null; return r !== false; })
      .catch(() => { connected = null; return false; });
  }
  return connected;
}

/** Предложения (базовые планы + акции) подписки Премиум из Google Play, уже в валюте пользователя. */
export async function loadPremiumOffers(): Promise<StoreOffer[]> {
  const m = iap();
  if (!m || !(await connectBilling())) throw new Error('billing-unavailable');
  const products = (await m.fetchProducts({ skus: [PREMIUM_PRODUCT_ID], type: 'subs' })) || [];
  const product: any = (products as any[]).find(p => p?.id === PREMIUM_PRODUCT_ID);
  return (product?.subscriptionOffers || []) as StoreOffer[];
}

/**
 * Открыть окно оплаты Google Play. Результат приходит в слушатель onPurchaseUpdated.
 * obfuscatedAccountId = id пользователя Striva: бэкенд сверяет его, чтобы подписку,
 * купленную на одном аккаунте, нельзя было активировать на другом.
 */
export async function startPremiumPurchase(offerToken: string, userId: string): Promise<void> {
  const m = iap();
  if (!m || !(await connectBilling())) throw new Error('billing-unavailable');
  await m.requestPurchase({
    type: 'subs',
    request: {
      google: {
        skus: [PREMIUM_PRODUCT_ID],
        subscriptionOffers: [{ sku: PREMIUM_PRODUCT_ID, offerToken }],
        obfuscatedAccountId: userId,
      },
    },
  });
}

/** Покупки Премиума, которые Google Play числит за этим Google-аккаунтом (для восстановления). */
export async function ownedPremiumPurchases(): Promise<Purchase[]> {
  const m = iap();
  if (!m || !(await connectBilling())) return [];
  const list = (await m.getAvailablePurchases()) || [];
  return list.filter(p => p.productId === PREMIUM_PRODUCT_ID && !!p.purchaseToken);
}

/** Подтвердить покупку на устройстве (если бэкенд не смог). Ошибку «уже подтверждена» глушим. */
export async function finishPremiumPurchase(purchase: Purchase): Promise<void> {
  const m = iap();
  if (!m) return;
  try { await m.finishTransaction({ purchase, isConsumable: false }); } catch {}
}

export function onPurchaseUpdated(
  onPurchase: (p: Purchase) => void,
  onError: (e: ExpoPurchaseError) => void,
): () => void {
  const m = iap();
  if (!m) return () => {};
  const a = m.purchaseUpdatedListener(onPurchase);
  const b = m.purchaseErrorListener(onError);
  return () => { a.remove(); b.remove(); };
}

export const isUserCancelled = (e: any): boolean => e?.code === 'user-cancelled';
export const isAlreadyOwned = (e: any): boolean => e?.code === 'already-owned';

/** Управление подпиской (отмена, смена карты) — экран подписок Google Play. */
export async function openManageSubscription(): Promise<void> {
  const m = iap();
  try {
    if (m) { await m.deepLinkToSubscriptions({ skuAndroid: PREMIUM_PRODUCT_ID, packageNameAndroid: ANDROID_PACKAGE }); return; }
  } catch {}
  Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() => {});
}
