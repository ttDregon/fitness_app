import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from './Gradient';
import { COLORS, GRADIENTS } from '../theme';
import { TRAINER_PLANS, AI_PLANS } from '../config/billing';
import { useApp } from '../context/AppContext';

export function Paywall() {
  const { paywall, setPaywall, openCheckout, refreshSubscription, trainerSubActive, aiUnlimited } = useApp();
  const [checking, setChecking] = useState(false);

  if (!paywall) return null;
  const isTrainer = paywall === 'trainer';
  const plans: ReadonlyArray<{ id: string; label: string; priceUah: number }> = isTrainer ? TRAINER_PLANS : AI_PLANS;
  const grad = isTrainer ? GRADIENTS.rose : GRADIENTS.indigo;
  const accent = isTrainer ? COLORS.rose : COLORS.indigo;

  const onCheck = async () => {
    setChecking(true);
    await refreshSubscription();
    setChecking(false);
    // если подписка стала активной — закрываем
    if (isTrainer ? trainerSubActive : aiUnlimited) setPaywall(null);
    else setPaywall(null); // в любом случае закрываем; статус обновится из профиля
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={() => setPaywall(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: COLORS.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 8, paddingBottom: 36, maxHeight: '88%' }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, marginBottom: 6 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: isTrainer ? 'rgba(251,113,133,0.16)' : 'rgba(99,102,241,0.16)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Ionicons name={isTrainer ? 'people' : 'sparkles'} size={26} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>
                {isTrainer ? 'Подписка «Тренер»' : 'Лимит ИИ-чата'}
              </Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 2 }}>
                {isTrainer ? 'Открывает работу с клиентами' : 'Дневной лимит исчерпан — подними его'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setPaywall(null)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={34} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: 22 }} contentContainerStyle={{ paddingTop: 10 }} showsVerticalScrollIndicator={false}>
            {!isTrainer && (
              <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
                Бесплатно 10 вопросов в день. Разбор еды и тренировок всегда бесплатный (10/день каждый).
              </Text>
            )}
            {plans.map(p => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.85}
                onPress={() => openCheckout(isTrainer ? 'trainer' : 'ai', p.id)}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: isTrainer ? 'rgba(251,113,133,0.3)' : 'rgba(99,102,241,0.3)' }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' }}>{p.label}</Text>
                </View>
                <Text style={{ color: accent, fontSize: 18, fontWeight: '900', marginRight: 10 }}>{p.priceUah} грн</Text>
                <Ionicons name="logo-usd" size={18} color={accent} />
              </TouchableOpacity>
            ))}

            <GradientButton colors={grad} style={{ borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 8 }} onPress={onCheck} disabled={checking}>
              {checking ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Я оплатил — проверить</Text>}
            </GradientButton>

            <Text style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
              Оплата проходит в Telegram (звёздами). После оплаты доступ откроется автоматически — нажми «проверить».
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
