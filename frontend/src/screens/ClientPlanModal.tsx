import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GradientButton } from '../components/Gradient';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { supabase } from '../lib/supabase';
import { parseMeals, notifyUser } from '../api/backend';
import { groupWorkoutData } from '../utils/workout';
import { getCurrentDateString } from '../utils/date';
import { useApp } from '../context/AppContext';
import type { WorkoutData, GroupedWorkout, MealItem, MealLogRow, FoodItem } from '../types';

const PERIODS = [
  { key: 'day', label: 'День', days: 1 },
  { key: '3day', label: '3 дня', days: 3 },
  { key: 'week', label: 'Неделя', days: 7 },
  { key: 'month', label: 'Месяц', days: 30 },
];

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' },
];
const mealTypeLabel = (t?: string) => MEAL_TYPES.find(x => x.key === t)?.label || 'Приём пищи';
// Совместимость со старыми записями без разбивки на продукты.
const asItems = (m: { items?: FoodItem[]; name: string; calories: number; protein: number; fat: number; carbs: number }): FoodItem[] =>
  m.items && m.items.length > 0 ? m.items : [{ name: m.name, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs }];

const addDays = (base: string, n: number) => {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const fmtDate = (d: string) =>
  d === getCurrentDateString() ? 'Сегодня' : new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

export default function ClientPlanModal() {
  const {
    selectedMember, setSelectedMember, closeAnimatedModal, modalOpacityAnim, modalScaleAnim,
    clientProfile, activeGroup, session,
    assignNote, setAssignNote, assignWorkoutDate, setAssignWorkoutDate, assignDateObj, setAssignDateObj,
    assignDatePickerVisible, setAssignDatePickerVisible, onAssignDateChange, assignWorkoutToMember, isLoading, memberDayPlan,
  } = useApp();

  // Сдвиг даты тренировки стрелками (меняет дату → контекст подгружает план на неё).
  const shiftAssignDate = (delta: number) => {
    const [y, m, d] = assignWorkoutDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + delta);
    setAssignWorkoutDate(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`);
    setAssignDateObj(base);
  };

  // Аккордеон: какая из двух главных секций раскрыта.
  const [activeSection, setActiveSection] = useState<'workout' | 'nutrition' | null>(null);

  // --- Питание: всё локально, чтобы не раздувать общий контекст ---
  const [period, setPeriod] = useState<string>('day');
  const [startDate, setStartDate] = useState<string>(getCurrentDateString());
  const [startObj, setStartObj] = useState<Date>(new Date());
  const [startPickerVisible, setStartPickerVisible] = useState<boolean>(false);
  const [dayIndex, setDayIndex] = useState<number>(0);
  const [mealInput, setMealInput] = useState<string>('');
  const [mealType, setMealType] = useState<string>('breakfast');
  const [mealTypeOpen, setMealTypeOpen] = useState<boolean>(false);
  const [mealPreview, setMealPreview] = useState<MealItem | null>(null);
  const [mealPreviewLoading, setMealPreviewLoading] = useState<boolean>(false);
  const [dayMeals, setDayMeals] = useState<MealItem[]>([]);
  const [eatenLog, setEatenLog] = useState<MealLogRow[]>([]);
  // Меню меняли в этой сессии модалки → один пуш клиенту при закрытии (без спама на каждое блюдо).
  const [mealsTouched, setMealsTouched] = useState(false);

  const periodDays = PERIODS.find(p => p.key === period)?.days || 1;
  const nutritionDate = addDays(startDate, dayIndex);

  const loadNutritionDay = async (date: string) => {
    if (!selectedMember?.id) return;
    const { data: am } = await supabase.from('assigned_meals').select('meal_data').eq('client_id', selectedMember.id).eq('date', date).maybeSingle();
    setDayMeals((am?.meal_data as MealItem[]) || []);
    const { data: ml } = await supabase.from('meal_log').select('*').eq('user_id', selectedMember.id).eq('date', date).order('created_at', { ascending: true });
    setEatenLog((ml as MealLogRow[]) || []);
  };

  useEffect(() => {
    if (activeSection === 'nutrition' && selectedMember?.id) loadNutritionDay(nutritionDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, startDate, dayIndex, selectedMember?.id]);

  const persistMeals = async (meals: MealItem[]) => {
    if (!selectedMember?.id || !activeGroup?.id || !session?.user?.id) return;
    const { error } = await supabase.from('assigned_meals').upsert(
      { group_id: activeGroup.id, client_id: selectedMember.id, trainer_id: session.user.id, date: nutritionDate, meal_data: meals },
      { onConflict: 'client_id, date' }
    );
    if (error) Alert.alert('Ошибка', error.message);
  };

  const calcPreview = async () => {
    if (!mealInput.trim()) return;
    setMealPreviewLoading(true);
    try {
      const data = await parseMeals(mealInput, session?.user?.id);
      if (data?.status === 'limit_reached') { Alert.alert('Лимит разбора', `Разбор еды: ${data.limit}/день. Лимит на сегодня исчерпан.`); return; }
      if (!data || data.error || !Array.isArray(data.meals)) throw new Error(data?.error || 'ИИ вернул данные в неверном формате');
      const items: FoodItem[] = data.meals.flatMap((meal: any) => (meal.items || []).map((it: any) => ({ name: it.name || 'блюдо', calories: it.calories || 0, protein: it.protein || 0, fat: it.fat || 0, carbs: it.carbs || 0 })));
      if (items.length === 0) throw new Error('Не удалось распознать продукты');
      const t = items.reduce((a, i) => ({ c: a.c + i.calories, p: a.p + i.protein, f: a.f + i.fat, cb: a.cb + i.carbs }), { c: 0, p: 0, f: 0, cb: 0 });
      setMealPreview({ id: `meal_${Date.now()}`, meal_type: mealType, name: items.map(i => i.name).join(', '), items, calories: t.c, protein: t.p, fat: t.f, carbs: t.cb, eaten: false });
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setMealPreviewLoading(false);
    }
  };

  const addMeal = async () => {
    if (!mealPreview) return;
    const updated = [...dayMeals, mealPreview];
    setDayMeals(updated);
    setMealInput('');
    setMealPreview(null);
    setMealsTouched(true);
    await persistMeals(updated);
  };

  const removeMeal = async (id: string) => {
    const updated = dayMeals.filter(m => m.id !== id);
    setDayMeals(updated);
    setMealsTouched(true);
    await persistMeals(updated);
  };

  const onStartChange = (event: any, sel: Date | undefined) => {
    setStartPickerVisible(false);
    if (event.type === 'set' && sel) {
      setStartObj(sel);
      setStartDate(`${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`);
      setDayIndex(0);
    }
  };

  const close = () => {
    if (mealsTouched && selectedMember?.id) {
      notifyUser(selectedMember.id, 'Меню питания обновлено 🥗', 'Тренер обновил твоё меню', { tab: 'nutrition' });
    }
    setMealsTouched(false);
    closeAnimatedModal(() => setSelectedMember(null));
  };

  if (!selectedMember) return null;

  const totals = dayMeals.reduce((a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }), { cal: 0, p: 0, f: 0, c: 0 });
  const sectionBtn = (active: boolean, color: string = COLORS.violet) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: active ? color : COLORS.cardAlt, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: active ? color : 'rgba(255,255,255,0.08)' });

  return (
    <Modal transparent animationType="none" onRequestClose={close}>
      <Animated.View style={[styles.modalOverlayFull, { opacity: modalOpacityAnim }]}>
        <Animated.View style={[styles.modalContentFull, { transform: [{ scale: modalScaleAnim }] }]}>
          <View style={styles.modalHeaderFull}>
            <Text style={styles.modalTitleFull}>План: {selectedMember?.name || selectedMember?.email?.split('@')[0]}</Text>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close-circle" size={36} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ width: '100%', marginTop: 10 }} showsVerticalScrollIndicator={false}>
            {/* ===== Кнопка ТРЕНИРОВКА ===== */}
            <TouchableOpacity style={sectionBtn(activeSection === 'workout', COLORS.violet)} onPress={() => setActiveSection(s => s === 'workout' ? null : 'workout')}>
              <Ionicons name="barbell" size={24} color="#fff" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, color: '#fff', fontSize: 17, fontWeight: '800' }}>Тренировка</Text>
              <Ionicons name={activeSection === 'workout' ? 'chevron-up' : 'chevron-down'} size={22} color="#fff" />
            </TouchableOpacity>

            {activeSection === 'workout' && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Новая тренировка (ИИ):</Text>
                <TextInput style={styles.inputArea} multiline placeholder="Присед 100кг 3 по 10..." placeholderTextColor={COLORS.textSecondary} value={assignNote} onChangeText={setAssignNote} />
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => shiftAssignDate(-1)} style={{ padding: 8 }}><Ionicons name="chevron-back" size={26} color={COLORS.tabBar} /></TouchableOpacity>
                  <TouchableOpacity style={[styles.pickerButton, { flex: 1 }]} onPress={() => setAssignDatePickerVisible(true)}>
                    <Ionicons name="calendar-outline" size={20} color={COLORS.tabBar} />
                    <Text style={styles.pickerButtonText}>{assignWorkoutDate === getCurrentDateString() ? 'Сегодня' : assignWorkoutDate}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => shiftAssignDate(1)} style={{ padding: 8 }}><Ionicons name="chevron-forward" size={26} color={COLORS.tabBar} /></TouchableOpacity>
                </View>
                {assignDatePickerVisible && (
                  <DateTimePicker value={assignDateObj} mode="date" display="default" onChange={onAssignDateChange} />
                )}
                <GradientButton colors={GRADIENTS.violet} style={[styles.button, { marginBottom: 22 }]} onPress={assignWorkoutToMember} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Добавить/Назначить</Text>}</GradientButton>
                <Text style={styles.historyTitle}>Выполнение на {assignWorkoutDate}:</Text>
                {(() => {
                  const plan = memberDayPlan;
                  if (!plan || !Array.isArray(plan.workout_data) || !plan.workout_data.length) return <Text style={styles.placeholderText}>План не назначен</Text>;
                  return groupWorkoutData(plan.workout_data).map((group: GroupedWorkout, gIdx: number) => (
                    <View key={gIdx} style={{ marginBottom: 20, backgroundColor: COLORS.cardAlt, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderSoft }}>
                      <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
                      {group.sets.map((ex: WorkoutData, idx: number) => (
                        <View key={idx} style={[styles.setRow, { paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)', paddingLeft: 5 }]}>
                          <Text style={[styles.exerciseSetText, ex.completed && { textDecorationLine: 'line-through', color: COLORS.textSecondary }]}>Подход {idx + 1}: {ex.weight}кг x {ex.reps}</Text>
                          <Ionicons name={ex.completed ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={ex.completed ? COLORS.success : COLORS.textSecondary} />
                        </View>
                      ))}
                    </View>
                  ));
                })()}
              </View>
            )}

            {/* ===== Кнопка ПИТАНИЕ ===== */}
            <TouchableOpacity style={sectionBtn(activeSection === 'nutrition', COLORS.emerald)} onPress={() => setActiveSection(s => s === 'nutrition' ? null : 'nutrition')}>
              <Ionicons name="restaurant" size={24} color="#fff" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, color: '#fff', fontSize: 17, fontWeight: '800' }}>Питание</Text>
              <Ionicons name={activeSection === 'nutrition' ? 'chevron-up' : 'chevron-down'} size={22} color="#fff" />
            </TouchableOpacity>

            {activeSection === 'nutrition' && (
              <View style={{ marginBottom: 8 }}>
                {/* Период */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  {PERIODS.map(p => (
                    <TouchableOpacity key={p.key} onPress={() => { setPeriod(p.key); setDayIndex(0); }}
                      style={{ flex: 1, marginHorizontal: 3, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: period === p.key ? COLORS.emerald : COLORS.cardAlt, borderWidth: 1, borderColor: period === p.key ? COLORS.emerald : 'rgba(255,255,255,0.08)' }}>
                      <Text style={{ color: period === p.key ? '#06281D' : COLORS.textSecondary, fontSize: 13, fontWeight: '700' }}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Начало периода */}
                <TouchableOpacity style={styles.pickerButton} onPress={() => setStartPickerVisible(true)}>
                  <Ionicons name="calendar-outline" size={20} color={COLORS.tabBar} />
                  <Text style={styles.pickerButtonText}>Начало: {startDate}</Text>
                </TouchableOpacity>
                {startPickerVisible && (
                  <DateTimePicker value={startObj} mode="date" display="default" onChange={onStartChange} />
                )}

                {/* Навигация по дням периода */}
                {periodDays > 1 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
                    <TouchableOpacity disabled={dayIndex <= 0} onPress={() => setDayIndex(i => Math.max(0, i - 1))} style={{ padding: 8, opacity: dayIndex <= 0 ? 0.3 : 1 }}><Ionicons name="chevron-back" size={26} color={COLORS.tabBar} /></TouchableOpacity>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' }}>День {dayIndex + 1} из {periodDays} · {fmtDate(nutritionDate)}</Text>
                    <TouchableOpacity disabled={dayIndex >= periodDays - 1} onPress={() => setDayIndex(i => Math.min(periodDays - 1, i + 1))} style={{ padding: 8, opacity: dayIndex >= periodDays - 1 ? 0.3 : 1 }}><Ionicons name="chevron-forward" size={26} color={COLORS.tabBar} /></TouchableOpacity>
                  </View>
                )}

                {/* Приём пищи — выпадающий список */}
                <Text style={[styles.label, { marginTop: 8 }]}>Приём пищи:</Text>
                <TouchableOpacity style={styles.pickerButton} onPress={() => setMealTypeOpen(o => !o)}>
                  <Ionicons name="restaurant-outline" size={20} color={COLORS.tabBar} />
                  <Text style={[styles.pickerButtonText, { flex: 1 }]}>{mealTypeLabel(mealType)}</Text>
                  <Ionicons name={mealTypeOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.tabBar} />
                </TouchableOpacity>
                {mealTypeOpen && (
                  <View style={{ backgroundColor: COLORS.bgDeep, borderRadius: 12, marginTop: 4, marginBottom: 4, overflow: 'hidden' }}>
                    {MEAL_TYPES.map(mt => (
                      <TouchableOpacity key={mt.key} onPress={() => { setMealType(mt.key); setMealTypeOpen(false); }} style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: mealType === mt.key ? 'rgba(52,211,153,0.16)' : 'transparent' }}>
                        <Text style={{ color: mealType === mt.key ? COLORS.emerald : COLORS.textPrimary, fontSize: 15, fontWeight: mealType === mt.key ? '700' : '500' }}>{mt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Состав приёма */}
                <Text style={[styles.label, { marginTop: 10 }]}>Что в приёме (через запятую):</Text>
                <TextInput style={styles.inputArea} multiline placeholder="200г куриного филе, 150г пюре, огурец, сок..." placeholderTextColor={COLORS.textSecondary} value={mealInput} onChangeText={setMealInput} />
                <GradientButton colors={GRADIENTS.emerald} style={[styles.button, { marginBottom: 14 }]} onPress={calcPreview} disabled={mealPreviewLoading}>{mealPreviewLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Рассчитать КБЖУ</Text>}</GradientButton>

                {mealPreview && (
                  <View style={styles.previewContainer}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={styles.previewTitle}>{mealTypeLabel(mealPreview.meal_type)}</Text>
                      <Text style={styles.previewCals}>{mealPreview.calories} ккал</Text>
                    </View>
                    {(mealPreview.items || []).map((it: FoodItem, i: number) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                        <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }}>{it.name}</Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{it.calories} ккал · Б{it.protein} Ж{it.fat} У{it.carbs}</Text>
                      </View>
                    ))}
                    <GradientButton colors={GRADIENTS.emerald} style={[styles.button, { marginTop: 14 }]} onPress={addMeal}><Text style={styles.buttonText}>Добавить в меню</Text></GradientButton>
                  </View>
                )}

                {/* Назначенное меню на день */}
                <Text style={[styles.historyTitle, { marginTop: 18 }]}>Меню на {fmtDate(nutritionDate)}:</Text>
                {dayMeals.length === 0 ? (
                  <Text style={styles.placeholderText}>Блюда не назначены</Text>
                ) : (
                  <>
                    {dayMeals.map(m => (
                      <View key={m.id} style={{ backgroundColor: COLORS.cardAlt, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderSoft }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name={m.eaten ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={m.eaten ? COLORS.success : COLORS.textSecondary} style={{ marginRight: 10 }} />
                          <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }}>{mealTypeLabel(m.meal_type)}{m.eaten ? ' · съедено' : ''}</Text>
                          <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginRight: 8 }}>{m.calories} ккал</Text>
                          <TouchableOpacity onPress={() => removeMeal(m.id)} style={{ padding: 4 }}><Ionicons name="trash-outline" size={20} color={COLORS.error} /></TouchableOpacity>
                        </View>
                        {asItems(m).map((it: FoodItem, i: number) => (
                          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 32, paddingTop: 4 }}>
                            <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }}>{it.name}</Text>
                            <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{it.calories} ккал · Б{it.protein} Ж{it.fat} У{it.carbs}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                    <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 4 }}>Итого: {totals.cal} ккал · Б{totals.p} / Ж{totals.f} / У{totals.c}</Text>
                  </>
                )}

                {/* Что клиент записал сам */}
                {eatenLog.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.historyTitle}>Клиент записал сам:</Text>
                    {eatenLog.map(e => (
                      <View key={e.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="fast-food-outline" size={18} color={COLORS.tabBar} style={{ marginRight: 8 }} />
                          <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' }}>{mealTypeLabel(e.meal_type)}</Text>
                          <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>{e.calories} ккал</Text>
                        </View>
                        {asItems(e).map((it: FoodItem, i: number) => (
                          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 26, paddingTop: 3 }}>
                            <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }}>{it.name}</Text>
                            <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{it.calories} ккал</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ===== Профиль клиента (под кнопками) ===== */}
            {clientProfile && (() => {
              const goalMap: Record<string, string> = { lose: 'Похудение', gain: 'Набор массы', maintain: 'Поддержание формы' };
              const goalLabel = goalMap[clientProfile.goal] || 'Не указана';
              const cw = clientProfile.weight || 0;
              const tw = clientProfile.target_weight;
              const startW = clientProfile.startWeight || cw;
              const hasTarget = tw && tw > 0;
              const total = hasTarget ? Math.abs(startW - tw) : 0;
              const done = hasTarget ? Math.abs(startW - cw) : 0;
              const pct = total > 0 ? Math.min(Math.round(done / total * 100), 100) : 0;
              return (
                <View style={{ backgroundColor: COLORS.cardAlt, borderRadius: 18, padding: 18, marginTop: 12, marginBottom: 20, borderWidth: 1, borderColor: COLORS.borderSoft }}>
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
                      <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 }}>{(clientProfile.waterToday || 0).toFixed(1)} л</Text>
                    </View>
                  </View>
                </View>
              );
            })()}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
