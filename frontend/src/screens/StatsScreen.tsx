import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Line, Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { styles } from '../styles';
import { COLORS, GRADIENTS, screenWidth } from '../theme';
import { useApp } from '../context/AppContext';
import { GradientView } from '../components/Gradient';
import { supabase } from '../lib/supabase';
import { kvMultiGet } from '../lib/storage';
import { addDaysStr, getCurrentDateString, parseYmd, plural, ymd } from '../utils/date';
import { formatVolume } from '../utils/stats';
import { goalProgressPct } from '../utils/goal';
import type { WeightLog } from '../types';

const CARD_INNER = screenWidth - 40 - 40; // ширина контента карточки: поля экрана 20+20, паддинг карточки 20+20

// Мини-график веса без chart-kit: тот рисует оси/подписи и плохо масштабируется в маленьком блоке.
function WeightSparkline({ data, target }: { data: number[]; target: number | null }) {
  const h = 110;
  const w = CARD_INNER;
  if (data.length < 2) return null;
  const values = target ? [...data, target] : data;
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const x = (i: number) => (i / (data.length - 1)) * (w - 8) + 4;
  const y = (v: number) => h - 6 - ((v - min) / (max - min || 1)) * (h - 12);
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `M ${x(0)},${h} L ${data.map((v, i) => `${x(i)},${y(v)}`).join(' L ')} L ${x(data.length - 1)},${h} Z`;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={COLORS.accentHover} stopOpacity={0.35} />
          <Stop offset="1" stopColor={COLORS.accentHover} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {target ? <Line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke={COLORS.emerald} strokeWidth={1.5} strokeDasharray="5 6" opacity={0.7} /> : null}
      <Path d={area} fill="url(#wfill)" />
      <Polyline points={pts} fill="none" stroke={COLORS.accentHover} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={5} fill={COLORS.accentHover} stroke={COLORS.card} strokeWidth={2} />
    </Svg>
  );
}

function Tile({ icon, color, label, value, sub }: { icon: any; color: string; label: string; value: string; sub?: string }) {
  return (
    <View style={tile}>
      <View style={[tileIcon, { backgroundColor: `${color}22` }]}><Ionicons name={icon} size={18} color={color} /></View>
      <Text style={tileValue} numberOfLines={1}>{value}</Text>
      <Text style={tileLabel} numberOfLines={1}>{label}</Text>
      {!!sub && <Text style={tileSub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

export default function StatsScreen() {
  const {
    handleTabChange, workoutSummary: s, exerciseStats, currentWeight, targetWeight, startWeight,
    dailyCalorieNorm, consumedCalories, session, askCompanion,
  } = useApp();
  const uid = session?.user?.id;

  const [weights, setWeights] = useState<WeightLog[] | null>(null);
  const [days7, setDays7] = useState<{ date: string; calories: number }[]>([]);
  const [showAllPrs, setShowAllPrs] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const since = new Date(); since.setDate(since.getDate() - 90);
    supabase.from('weight_log').select('id, weight, created_at').eq('user_id', uid)
      .gte('created_at', since.toISOString()).order('created_at', { ascending: true }).limit(500)
      .then(({ data }) => { if (!cancelled) setWeights((data as WeightLog[]) || []); });

    // Итоги калорий за 7 дней — из дневного кэша на устройстве (его же читает пересчёт веса).
    const today = getCurrentDateString();
    const dates = Array.from({ length: 7 }, (_, i) => addDaysStr(today, i - 6));
    kvMultiGet(dates.map(d => `nutrition_${uid}_${d}`)).then(map => {
      if (cancelled) return;
      setDays7(dates.map(d => {
        let calories = 0;
        try { calories = JSON.parse(map[`nutrition_${uid}_${d}`] || 'null')?.calories || 0; } catch {}
        return { date: d, calories: d === today ? consumedCalories : calories };
      }));
    });
    return () => { cancelled = true; };
  }, [uid, consumedCalories]);

  // Вес по дням (последняя запись дня) — без «пилы» от нескольких взвешиваний в день.
  const dailyWeights = useMemo(() => {
    const byDay = new Map<string, number>();
    (weights || []).forEach(w => byDay.set(ymd(new Date(w.created_at)), Number(w.weight)));
    return [...byDay.values()];
  }, [weights]);

  const prs = useMemo(() => Object.values(exerciseStats)
    .filter(e => e.bestWeight > 0 || e.maxReps > 0)
    .sort((a, b) => b.days - a.days || b.best1RM - a.best1RM), [exerciseStats]);

  const maxWeek = Math.max(1, ...s.weeks.map(w => w.workouts));
  const nutritionDays = days7.filter(d => d.calories > 0);
  const avgCalories = nutritionDays.length ? Math.round(nutritionDays.reduce((a, d) => a + d.calories, 0) / nutritionDays.length) : 0;
  const maxCal = Math.max(dailyCalorieNorm || 0, ...days7.map(d => d.calories), 1);

  const firstW = dailyWeights[0];
  const lastW = dailyWeights[dailyWeights.length - 1];
  const delta = dailyWeights.length >= 2 ? lastW - firstW : 0;
  const pct = targetWeight && currentWeight > 0 ? goalProgressPct(startWeight || currentWeight, currentWeight, targetWeight) : null;

  const weekdayShort = (d: string) => parseYmd(d).toLocaleDateString('ru-RU', { weekday: 'short' }).slice(0, 2);

  return (
    <ScrollView contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Статистика</Text></View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>

      {/* Сводка */}
      <View style={tilesWrap}>
        <Tile icon="barbell" color={COLORS.amber} label={plural(s.totalWorkouts, ['тренировка', 'тренировки', 'тренировок'])} value={String(s.totalWorkouts)} sub={s.totalSets ? `${s.totalSets} ${plural(s.totalSets, ['подход', 'подхода', 'подходов'])}` : undefined} />
        <Tile icon="calendar" color={COLORS.cyan} label="на этой неделе" value={String(s.weekWorkouts)} sub={s.weekVolume ? formatVolume(s.weekVolume) : undefined} />
        <Tile icon="flame" color={COLORS.orange} label={`${plural(s.weekStreak, ['неделя', 'недели', 'недель'])} подряд`} value={String(s.weekStreak)} sub="серия" />
        <Tile icon="trending-up" color={COLORS.emerald} label="поднято всего" value={formatVolume(s.totalVolume)} sub="тоннаж" />
      </View>

      {/* Активность по неделям */}
      <View style={card}>
        <Text style={cardTitle}>Тренировки по неделям</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, marginTop: 14 }}>
          {s.weeks.map((w, i) => {
            const isCurrent = i === s.weeks.length - 1;
            const hPct = w.workouts / maxWeek;
            return (
              <View key={w.start} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ color: w.workouts ? COLORS.textPrimary : COLORS.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 4 }}>{w.workouts || ''}</Text>
                <View style={{ width: 18, height: Math.max(4, hPct * 84), borderRadius: 6, overflow: 'hidden', backgroundColor: w.workouts ? undefined : 'rgba(255,255,255,0.06)' }}>
                  {w.workouts > 0 && <GradientView colors={isCurrent ? GRADIENTS.amber : GRADIENTS.violetIndigo} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />}
                </View>
                <Text style={{ color: isCurrent ? COLORS.amber : COLORS.textMuted, fontSize: 10, marginTop: 6, fontWeight: '600' }}>{isCurrent ? 'эта' : w.label}</Text>
              </View>
            );
          })}
        </View>
        {s.totalWorkouts === 0 && (
          <TouchableOpacity onPress={() => handleTabChange('workout')} style={ctaRow}>
            <Ionicons name="add-circle" size={18} color={COLORS.amber} />
            <Text style={{ color: COLORS.amber, fontWeight: '800', marginLeft: 6 }}>Записать первую тренировку</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Личные рекорды */}
      {prs.length > 0 && (
        <View style={card}>
          <Text style={cardTitle}>Личные рекорды 🏆</Text>
          {(showAllPrs ? prs : prs.slice(0, 6)).map(e => (
            <View key={e.key} style={prRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{e.name}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  {e.days} {plural(e.days, ['тренировка', 'тренировки', 'тренировок'])}
                  {e.bestWeightDate ? ` · рекорд ${parseYmd(e.bestWeightDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: COLORS.amber, fontSize: 16, fontWeight: '900' }}>
                  {e.bestWeight > 0 ? `${+e.bestWeight.toFixed(2)} кг × ${e.bestWeightReps}` : `× ${e.maxReps}`}
                </Text>
                {e.best1RM > e.bestWeight + 0.5 && <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>≈1ПМ {Math.round(e.best1RM)} кг</Text>}
              </View>
            </View>
          ))}
          {prs.length > 6 && (
            <TouchableOpacity onPress={() => setShowAllPrs(v => !v)} style={ctaRow}>
              <Text style={{ color: COLORS.accentHover, fontWeight: '800' }}>{showAllPrs ? 'Свернуть' : `Показать все (${prs.length})`}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Вес */}
      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={cardTitle}>Вес за 90 дней</Text>
          {dailyWeights.length >= 2 && (
            <Text style={{ color: delta > 0 ? COLORS.rose : delta < 0 ? COLORS.emerald : COLORS.textSecondary, fontWeight: '800' }}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)} кг
            </Text>
          )}
        </View>
        {weights === null ? (
          <ActivityIndicator color={COLORS.accentHover} style={{ marginVertical: 30 }} />
        ) : dailyWeights.length >= 2 ? (
          <View style={{ marginTop: 14 }}>
            <WeightSparkline data={dailyWeights} target={targetWeight} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={smallMuted}>{firstW.toFixed(1)} кг</Text>
              {targetWeight ? <Text style={[smallMuted, { color: COLORS.emerald }]}>цель {targetWeight.toFixed(1)}</Text> : null}
              <Text style={[smallMuted, { color: COLORS.textPrimary, fontWeight: '800' }]}>{lastW.toFixed(1)} кг</Text>
            </View>
          </View>
        ) : (
          <Text style={[smallMuted, { marginTop: 12 }]}>Нужно хотя бы два взвешивания в разные дни — добавь вес на главном экране.</Text>
        )}
        {pct !== null && (
          <View style={{ marginTop: 16 }}>
            <View style={styles.wmProgressBg}><View style={[styles.wmProgressFill, { width: `${pct}%` as any }]} /></View>
            <Text style={[smallMuted, { marginTop: 6, textAlign: 'center' }]}>Путь к цели пройден на {pct}%</Text>
          </View>
        )}
      </View>

      {/* Питание за неделю */}
      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={cardTitle}>Калории за 7 дней</Text>
          {avgCalories > 0 && <Text style={{ color: COLORS.textSecondary, fontWeight: '700' }}>в среднем {avgCalories}</Text>}
        </View>
        <View style={{ height: 110, marginTop: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {dailyCalorieNorm > 0 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 18 + (dailyCalorieNorm / maxCal) * 80, height: 1.5, backgroundColor: 'rgba(52,211,153,0.55)' }} />
          )}
          {days7.map(d => {
            const over = dailyCalorieNorm > 0 && d.calories > dailyCalorieNorm * 1.1;
            return (
              <View key={d.date} style={{ alignItems: 'center', flex: 1 }}>
                <View style={{ width: 20, height: Math.max(3, (d.calories / maxCal) * 80), borderRadius: 6, backgroundColor: d.calories ? (over ? COLORS.orange : COLORS.emerald) : 'rgba(255,255,255,0.06)' }} />
                <Text style={{ color: d.date === getCurrentDateString() ? COLORS.emerald : COLORS.textMuted, fontSize: 11, marginTop: 6, fontWeight: '700' }}>{weekdayShort(d.date)}</Text>
              </View>
            );
          })}
        </View>
        {dailyCalorieNorm > 0 && <Text style={[smallMuted, { marginTop: 6 }]}>Зелёная линия — дневная норма {dailyCalorieNorm} ккал</Text>}
      </View>

      {/* Разбор с компаньоном */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => askCompanion('Проанализируй мою статистику: тренировки, рекорды, вес и питание. Что у меня получается хорошо, а что стоит улучшить на этой неделе?')}>
        <GradientView colors={GRADIENTS.violetIndigo} style={companionCta}>
          <Ionicons name="sparkles" size={22} color="#fff" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Разобрать статистику с ИИ</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>Компаньон видит все эти цифры и подскажет, что улучшить</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </GradientView>
      </TouchableOpacity>
    </ScrollView>
  );
}

const tilesWrap = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, marginBottom: 6 };
const tile = { width: '48%' as const, backgroundColor: COLORS.card, borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.borderSoft };
const tileIcon = { width: 34, height: 34, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 10 };
const tileValue = { color: COLORS.textPrimary, fontSize: 26, fontWeight: '900' as const, letterSpacing: -0.5 };
const tileLabel = { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' as const, marginTop: 2 };
const tileSub = { color: COLORS.textMuted, fontSize: 11, marginTop: 4 };
const card = { backgroundColor: COLORS.card, borderRadius: 24, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: COLORS.borderSoft };
const cardTitle = { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' as const };
const prRow = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 11, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' };
const ctaRow = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 14, paddingVertical: 6 };
const smallMuted = { color: COLORS.textMuted, fontSize: 12 };
const companionCta = { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 22, padding: 18, marginTop: 4, marginBottom: 10 };
