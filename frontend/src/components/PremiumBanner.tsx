import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientView } from './Gradient';
import { COLORS, GRADIENTS } from '../theme';
import { useApp } from '../context/AppContext';
import { kvGet, kvSet } from '../lib/storage';
import { AI_PREMIUM_CHAT_PER_DAY } from '../config/billing';

const HIDE_DAYS = 7; // «×» прячет плашку на неделю — без навязчивости

/** Плашка «Striva Премиум» на главном. Не показывается тем, у кого Премиум уже есть. */
export function PremiumBanner() {
  const { isPremium, openPaywall, userRole, session } = useApp();
  const key = `premiumBannerHiddenUntil_${session?.user?.id || 'guest'}`;
  const [hidden, setHidden] = useState(true); // пока не прочитали хранилище — не мигаем

  useEffect(() => {
    let alive = true;
    kvGet(key).then(v => { if (alive) setHidden(!!v && Number(v) > Date.now()); });
    return () => { alive = false; };
  }, [key]);

  if (isPremium || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    kvSet(key, String(Date.now() + HIDE_DAYS * 24 * 3600 * 1000));
  };
  const sub = userRole === 'trainer'
    ? 'Клубы и назначения клиентам'
    : `До ${AI_PREMIUM_CHAT_PER_DAY} сообщений ИИ в день`;

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={() => openPaywall('banner')} style={{ marginBottom: 16 }} accessibilityRole="button" accessibilityLabel="Открыть Striva Премиум">
      <GradientView colors={['#2A1748', '#1B1636']} style={{ borderRadius: 22, paddingVertical: 15, paddingLeft: 15, paddingRight: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(232,121,249,0.38)' }}>
        <GradientView colors={GRADIENTS.violetPink} style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Ionicons name="diamond" size={21} color="#fff" />
        </GradientView>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '900' }}>Striva Премиум</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{sub}</Text>
        </View>
        <View style={{ backgroundColor: 'rgba(232,121,249,0.18)', borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7, marginLeft: 8 }}>
          <Text style={{ color: COLORS.fuchsia, fontSize: 13, fontWeight: '800' }}>Тарифы</Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} style={{ padding: 6, marginLeft: 2 }} accessibilityLabel="Скрыть на неделю">
          <Ionicons name="close" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </GradientView>
    </TouchableOpacity>
  );
}
