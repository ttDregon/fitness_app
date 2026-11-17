import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton, GradientView } from './Gradient';
import { COLORS, GRADIENTS } from '../theme';
import { useApp } from '../context/AppContext';
import { PREMIUM_FEATURES, PREMIUM_PLANS, DEFAULT_PLAN } from '../config/billing';
import { formatPremiumDate, type PlanOffer } from '../utils/premium';
import { PRIVACY_POLICY_URL } from '../config/links';
import type { PaywallReason } from '../context/premium';

const SUBTITLE: Record<PaywallReason, string> = {
  banner: 'Больше ИИ и инструменты тренера',
  profile: 'Больше ИИ и инструменты тренера',
  trainer: 'Клубы, назначения и расписание входят в Премиум',
  limit_chat: 'Лимит ИИ-чата на сегодня исчерпан',
  limit_parse: 'Лимит разбора на сегодня исчерпан',
  limit_plan: 'Лимит ИИ-планов на сегодня исчерпан',
};

const PERIOD_SUFFIX: Record<number, string> = { 1: 'в месяц', 3: 'за 3 месяца', 12: 'в год' };
const planLabel = (id: string | null) => PREMIUM_PLANS.find(p => p.id === id)?.label || null;

export function PremiumPaywall() {
  const {
    paywallReason, closePaywall, isPremium, premiumUntil, premiumPlan, premiumSource, autoRenewing,
    planOffers, offersState, loadOffers, purchaseFlow, buyPlan, isRestoring, restorePurchases,
    manageSubscription, openStoreUpdate,
  } = useApp();
  const [selected, setSelected] = useState<string>(DEFAULT_PLAN);

  // Когда тарифы загрузились — выбираем годовой (если он есть в Google Play), иначе первый.
  useEffect(() => {
    if (planOffers.length && !planOffers.some(o => o.planId === selected)) {
      setSelected((planOffers.find(o => o.planId === DEFAULT_PLAN) || planOffers[0]).planId);
    }
  }, [planOffers]);

  if (!paywallReason) return null;
  const busy = purchaseFlow === 'buying' || purchaseFlow === 'verifying';
  const offer = planOffers.find(o => o.planId === selected) || null;

  const ctaText = !offer ? 'Оформить Премиум'
    : offer.trialDays > 0 ? `Попробовать ${offer.trialDays} дн. бесплатно`
    : `Оформить за ${offer.price}`;

  return (
    <Modal transparent animationType="slide" onRequestClose={closePaywall} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(3,4,10,0.72)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: COLORS.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 8, maxHeight: '92%', borderTopWidth: 1, borderColor: COLORS.borderSoft }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, marginBottom: 4 }}>
            <GradientView colors={GRADIENTS.violetPink} style={{ width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 13 }}>
              <Ionicons name="diamond" size={24} color="#fff" />
            </GradientView>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 }}>Striva Премиум</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 2 }}>
                {isPremium ? 'Подписка активна' : SUBTITLE[paywallReason]}
              </Text>
            </View>
            <TouchableOpacity onPress={closePaywall} style={{ padding: 4 }} accessibilityLabel="Закрыть">
              <Ionicons name="close-circle" size={34} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: 22 }} contentContainerStyle={{ paddingTop: 14, paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
            {isPremium ? (
              <ActiveCard
                until={premiumUntil} plan={planLabel(premiumPlan)} autoRenewing={autoRenewing}
                fromPlay={premiumSource !== 'manual'} onManage={manageSubscription} onDone={closePaywall}
              />
            ) : (
              <>
                {PREMIUM_FEATURES.map(f => (
                  <View key={f.title} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.accentSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name={f.icon as any} size={19} color={COLORS.accentHover} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }}>{f.title}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12.5, marginTop: 1 }}>{f.sub}</Text>
                    </View>
                  </View>
                ))}

                <View style={{ marginTop: 8 }}>
                  {offersState === 'loading' || offersState === 'idle' ? (
                    <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                      <ActivityIndicator color={COLORS.accentHover} />
                      <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 10 }}>Загружаем тарифы из Google Play…</Text>
                    </View>
                  ) : offersState === 'unsupported' ? (
                    <Notice
                      icon="cloud-download-outline"
                      text="Оформить Премиум можно в новой версии приложения из Google Play."
                      action="Обновить приложение" onAction={openStoreUpdate}
                    />
                  ) : offersState === 'unavailable' ? (
                    <Notice
                      icon="alert-circle-outline"
                      text="Не удалось загрузить тарифы из Google Play. Проверьте интернет и что вы вошли в аккаунт Google Play."
                      action="Повторить" onAction={loadOffers}
                    />
                  ) : (
                    planOffers.map(o => (
                      <PlanCard key={o.planId} offer={o} selected={o.planId === selected} onPress={() => setSelected(o.planId)} />
                    ))
                  )}
                </View>

                <GradientButton
                  colors={GRADIENTS.violetPink}
                  style={{ borderRadius: 18, paddingVertical: 17, alignItems: 'center', marginTop: 10 }}
                  onPress={() => offer && buyPlan(offer.planId)}
                  disabled={!offer || busy || offersState !== 'ready'}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16.5, fontWeight: '800' }}>{ctaText}</Text>}
                </GradientButton>
                {purchaseFlow === 'verifying' && (
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>Проверяем покупку…</Text>
                )}
                {purchaseFlow === 'pending' && (
                  <Text style={{ color: COLORS.amber, fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>Платёж обрабатывается Google Play — Премиум включится сам.</Text>
                )}

                <TouchableOpacity onPress={restorePurchases} disabled={isRestoring} style={{ alignItems: 'center', paddingVertical: 14 }}>
                  {isRestoring
                    ? <ActivityIndicator color={COLORS.textSecondary} />
                    : <Text style={{ color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' }}>Восстановить покупки</Text>}
                </TouchableOpacity>

                {/* Условия подписки — Google Play требует показывать их до оплаты. */}
                <Text style={{ color: COLORS.textMuted, fontSize: 11.5, lineHeight: 17, textAlign: 'center' }}>
                  {offer
                    ? `${offer.trialDays > 0 ? `Первые ${offer.trialDays} дн. бесплатно, затем ` : ''}${offer.price} ${PERIOD_SUFFIX[offer.months] || ''}. `
                    : ''}
                  Подписка продлевается автоматически, пока вы её не отмените. Отменить можно в любой момент в Google Play → «Платежи и подписки»; доступ сохранится до конца оплаченного периода. Оплата — через аккаунт Google Play.
                </Text>
                <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})} style={{ alignItems: 'center', paddingTop: 10 }}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, textDecorationLine: 'underline' }}>Политика конфиденциальности</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({ offer, selected, onPress }: { offer: PlanOffer; selected: boolean; onPress: () => void }) {
  const badge = offer.savingsPct > 0 ? `−${offer.savingsPct}%` : null;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: selected ? 'rgba(168,85,247,0.12)' : COLORS.card,
        borderRadius: 18, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10,
        borderWidth: selected ? 2 : 1, borderColor: selected ? COLORS.fuchsia : COLORS.border,
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? COLORS.fuchsia : COLORS.textMuted, alignItems: 'center', justifyContent: 'center', marginRight: 13 }}>
        {selected && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.fuchsia }} />}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' }}>{offer.label}</Text>
          {badge && (
            <View style={{ backgroundColor: COLORS.emerald, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
              <Text style={{ color: '#062A1E', fontSize: 11.5, fontWeight: '900' }}>{badge}</Text>
            </View>
          )}
        </View>
        {(offer.perMonth || offer.trialDays > 0) && (
          <Text style={{ color: COLORS.textSecondary, fontSize: 12.5, marginTop: 3 }}>
            {[offer.perMonth ? `≈ ${offer.perMonth} в месяц` : null, offer.trialDays > 0 ? `${offer.trialDays} дн. бесплатно` : null].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      <Text style={{ color: COLORS.textPrimary, fontSize: 16.5, fontWeight: '900' }}>{offer.price}</Text>
    </TouchableOpacity>
  );
}

function Notice({ icon, text, action, onAction }: { icon: string; text: string; action: string; onAction: () => void }) {
  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        <Ionicons name={icon as any} size={22} color={COLORS.amber} style={{ marginRight: 10, marginTop: 1 }} />
        <Text style={{ flex: 1, color: COLORS.textSecondary, fontSize: 13.5, lineHeight: 19 }}>{text}</Text>
      </View>
      <TouchableOpacity onPress={onAction} style={{ alignSelf: 'flex-start', marginTop: 12, marginLeft: 32, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: COLORS.cardAlt }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: 13.5, fontWeight: '700' }}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ActiveCard({ until, plan, autoRenewing, fromPlay, onManage, onDone }: {
  until: string | null; plan: string | null; autoRenewing: boolean; fromPlay: boolean; onManage: () => void; onDone: () => void;
}) {
  return (
    <>
      <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: 'rgba(232,121,249,0.35)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="checkmark-circle" size={22} color={COLORS.emerald} style={{ marginRight: 8 }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' }}>
            {until ? `Активен до ${formatPremiumDate(until)}` : 'Премиум активен'}
          </Text>
        </View>
        {plan && <Text style={{ color: COLORS.textSecondary, fontSize: 13.5, marginBottom: 4 }}>Тариф: {plan}</Text>}
        <Text style={{ color: COLORS.textSecondary, fontSize: 13.5, lineHeight: 19 }}>
          {!fromPlay ? 'Доступ выдан вручную — продлевать ничего не нужно.'
            : autoRenewing ? 'Подписка продлится автоматически. Отменить можно в Google Play.'
            : 'Автопродление выключено — доступ сохранится до конца оплаченного срока.'}
        </Text>
      </View>
      {PREMIUM_FEATURES.map(f => (
        <View key={f.title} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          <Ionicons name="checkmark" size={18} color={COLORS.fuchsia} style={{ marginRight: 10 }} />
          <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14 }}>{f.title}</Text>
        </View>
      ))}
      {fromPlay && (
        <TouchableOpacity onPress={onManage} style={{ marginTop: 22, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }}>Управлять подпиской в Google Play</Text>
        </TouchableOpacity>
      )}
      <GradientButton colors={GRADIENTS.violetPink} style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 12 }} onPress={onDone}>
        <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '800' }}>Готово</Text>
      </GradientButton>
    </>
  );
}
