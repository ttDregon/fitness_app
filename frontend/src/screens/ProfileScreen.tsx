import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';

export default function ProfileScreen() {
  const {
    displayName, userRole, userGoal, currentWeight, targetWeight, weightHistoryLogs, waterIntake,
    handleTabChange, openAnimatedModal, setIsAccountSwitcherVisible, handleSignOut, handleDeleteAccount,
  } = useApp();

  const goalMap: Record<string, string> = { lose: 'Похудение', gain: 'Набор массы', maintain: 'Поддержание формы' };
  const goalLabel = goalMap[userGoal] || 'Не указана';
  const cw = currentWeight || 0;
  const tw = targetWeight;
  const startW = weightHistoryLogs.length > 0 ? (weightHistoryLogs[weightHistoryLogs.length - 1]?.weight || cw) : cw;
  const hasTarget = tw && tw > 0;
  const total = hasTarget ? Math.abs(startW - tw) : 0;
  const done = hasTarget ? Math.abs(startW - cw) : 0;
  const pct = total > 0 ? Math.min(Math.round(done / total * 100), 100) : 0;

  const rowBtn = { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: COLORS.card, borderRadius: 16, padding: 18, marginBottom: 14 };

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => handleTabChange('home')} style={{ padding: 5 }}><Ionicons name="arrow-back" size={32} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={[styles.pageTitle, { flex: 1, textAlign: 'center', marginRight: 42 }]}>Профиль</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 22 }}>
          <Ionicons name="person-circle" size={96} color={COLORS.tabBar} />
          <Text style={{ color: COLORS.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 8 }}>{displayName}</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 14, marginTop: 2 }}>{userRole === 'trainer' ? 'Фитнес-тренер' : 'Спортсмен'}</Text>
        </View>

        <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 18, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: hasTarget ? 14 : 4 }}>
            <Ionicons name="flag" size={18} color={COLORS.tabBar} style={{ marginRight: 8 }} />
            <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }}>Цель: {goalLabel}</Text>
          </View>
          {hasTarget && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Старт {startW.toFixed(1)}</Text>
                <Text style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' }}>Сейчас {cw.toFixed(1)}</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Цель {tw.toFixed(1)}</Text>
              </View>
              <View style={styles.wmProgressBg}>
                <View style={[styles.wmProgressFill, { width: `${pct}%` as any }]} />
              </View>
              <Text style={[styles.wmProgressPct, { marginBottom: 16 }]}>Пройдено {pct}%</Text>
            </>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Вес сейчас</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 }}>{cw > 0 ? cw.toFixed(1) : '--'} кг</Text>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Вода сегодня</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 }}>{(waterIntake || 0).toFixed(1)} л</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={rowBtn} onPress={() => openAnimatedModal(setIsAccountSwitcherVisible)}>
          <Ionicons name="swap-horizontal-outline" size={24} color={COLORS.textPrimary} style={{ marginRight: 14 }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' }}>Сменить аккаунт</Text>
        </TouchableOpacity>

        <TouchableOpacity style={rowBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color={COLORS.textPrimary} style={{ marginRight: 14 }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' }}>Выйти</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.dangerButton, { marginTop: 10 }]} onPress={handleDeleteAccount}>
          <Ionicons name="warning-outline" size={24} color={COLORS.error} style={{ marginRight: 12 }} />
          <Text style={styles.dangerButtonText}>Удалить аккаунт</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
