import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { supabase } from '../lib/supabase';
import { parseMeal } from '../api/backend';
import { groupWorkoutData } from '../utils/workout';
import { getCurrentDateString } from '../utils/date';
import { useApp } from '../context/AppContext';
import type { WorkoutData, GroupedWorkout, MealItem, MealLogRow } from '../types';

const PERIODS = [
  { key: 'day', label: 'День', days: 1 },
  { key: '3day', label: '3 дня', days: 3 },
  { key: 'week', label: 'Неделя', days: 7 },
  { key: 'month', label: 'Месяц', days: 30 },
];

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
    assignNote, setAssignNote, assignWorkoutDate, assignDateObj, assignDatePickerVisible,
    setAssignDatePickerVisible, onAssignDateChange, assignWorkoutToMember, isLoading, memberDayPlan,
  } = useApp();

  // Аккордеон: какая из двух главных секций раскрыта.
  const [activeSection, setActiveSection] = useState<'workout' | 'nutrition' | null>(null);

  // --- Питание: всё локально, чтобы не раздувать общий контекст ---
  const [period, setPeriod] = useState<string>('day');
  const [startDate, setStartDate] = useState<string>(getCurrentDateString());
  const [startObj, setStartObj] = useState<Date>(new Date());
  const [startPickerVisible, setStartPickerVisible] = useState<boolean>(false);
  const [dayIndex, setDayIndex] = useState<number>(0);
  const [mealInput, setMealInput] = useState<string>('');
  const [mealPreview, setMealPreview] = useState<MealItem | null>(null);
  const [mealPreviewLoading, setMealPreviewLoading] = useState<boolean>(false);
  const [dayMeals, setDayMeals] = useState<MealItem[]>([]);
  const [eatenLog, setEatenLog] = useState<MealLogRow[]>([]);

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
      const data = await parseMeal(mealInput);
      if (!data || data.error || data.name === undefined || data.calories === undefined) throw new Error(data?.error || 'ИИ вернул данные в неверном формате');
      setMealPreview({ id: `meal_${Date.now()}`, name: data.name, calories: data.calories || 0, protein: data.protein || 0, fat: data.fat || 0, carbs: data.carbs || 0, eaten: false });
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
    await persistMeals(updated);
  };

  const removeMeal = async (id: string) => {
    const updated = dayMeals.filter(m => m.id !== id);
    setDayMeals(updated);
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

  const close = () => closeAnimatedModal(() => setSelectedMember(null));

  if (!selectedMember) return null;

  const totals = dayMeals.reduce((a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }), { cal: 0, p: 0, f: 0, c: 0 });
  const sectionBtn = (active: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: active ? COLORS.tabBar : COLORS.bg, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: active ? COLORS.tabBar : 'rgba(255,255,255,0.08)' });

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
            <TouchableOpacity style={sectionBtn(activeSection === 'workout')} onPress={() => setActiveSection(s => s === 'workout' ? null : 'workout')}>
              <Ionicons name="barbell" size={24} color="#fff" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, color: '#fff', fontSize: 17, fontWeight: '800' }}>Тренировка</Text>
              <Ionicons name={activeSection === 'workout' ? 'chevron-up' : 'chevron-down'} size={22} color="#fff" />
            </TouchableOpacity>

            {activeSection === 'workout' && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Новая тренировка (ИИ):</Text>
                <TextInput style={styles.inputArea} multiline placeholder="Присед 100кг 3 по 10..." placeholderTextColor={COLORS.textSecondary} value={assignNote} onChangeText={setAssignNote} />
                <TouchableOpacity style={styles.pickerButton} onPress={() => setAssignDatePickerVisible(true)}>
                  <Ionicons name="calendar-outline" size={20} color={COLORS.tabBar} />
                  <Text style={styles.pickerButtonText}>Дата: {assignWorkoutDate}</Text>
                </TouchableOpacity>
                {assignDatePickerVisible && (
                  <DateTimePicker value={assignDateObj} mode="date" display="default" onChange={onAssignDateChange} />
                )}
                <TouchableOpacity style={[styles.button, { marginBottom: 22 }]} onPress={assignWorkoutToMember} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Добавить/Назначить</Text>}</TouchableOpacity>
                <Text style={styles.historyTitle}>Выполнение на {assignWorkoutDate}:</Text>
                {(() => {
                  const plan = memberDayPlan;
                  if (!plan || !Array.isArray(plan.workout_data) || !plan.workout_data.length) return <Text style={styles.placeholderText}>План не назначен</Text>;
                  return groupWorkoutData(plan.workout_data).map((group: GroupedWorkout, gIdx: number) => (
                    <View key={gIdx} style={{ marginBottom: 20, backgroundColor: COLORS.bg, padding: 15, borderRadius: 16 }}>
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
            <TouchableOpacity style={sectionBtn(activeSection === 'nutrition')} onPress={() => setActiveSection(s => s === 'nutrition' ? null : 'nutrition')}>
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
                      style={{ flex: 1, marginHorizontal: 3, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: period === p.key ? COLORS.tabBar : COLORS.bg, borderWidth: 1, borderColor: period === p.key ? COLORS.tabBar : 'rgba(255,255,255,0.08)' }}>
                      <Text style={{ color: period === p.key ? '#fff' : COLORS.textSecondary, fontSize: 13, fontWeight: '700' }}>{p.label}</Text>
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

                {/* Ввод блюда */}
                <Text style={[styles.label, { marginTop: 8 }]}>Добавить блюдо на {fmtDate(nutritionDate)}:</Text>
                <TextInput style={styles.inputArea} multiline placeholder="200г куриной грудки и рис..." placeholderTextColor={COLORS.textSecondary} value={mealInput} onChangeText={setMealInput} />
                <TouchableOpacity style={[styles.button, { marginBottom: 14 }]} onPress={calcPreview} disabled={mealPreviewLoading}>{mealPreviewLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Рассчитать КБЖУ</Text>}</TouchableOpacity>

                {mealPreview && (
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewTitle}>{mealPreview.name}</Text>
                    <Text style={styles.previewCals}>{mealPreview.calories} ккал</Text>
                    <View style={styles.previewMacrosRow}>
                      <View style={styles.previewMacro}><Text style={{ color: COLORS.protein, fontWeight: 'bold', marginBottom: 4 }}>Белки</Text><Text style={{ color: COLORS.textPrimary }}>{mealPreview.protein} г</Text></View>
                      <View style={styles.previewMacro}><Text style={{ color: COLORS.fat, fontWeight: 'bold', marginBottom: 4 }}>Жиры</Text><Text style={{ color: COLORS.textPrimary }}>{mealPreview.fat} г</Text></View>
                      <View style={styles.previewMacro}><Text style={{ color: COLORS.carb, fontWeight: 'bold', marginBottom: 4 }}>Углеводы</Text><Text style={{ color: COLORS.textPrimary }}>{mealPreview.carbs} г</Text></View>
                    </View>
                    <TouchableOpacity style={[styles.button, { marginTop: 18 }]} onPress={addMeal}><Text style={styles.buttonText}>Добавить в меню</Text></TouchableOpacity>
                  </View>
                )}

                {/* Назначенное меню на день */}
                <Text style={[styles.historyTitle, { marginTop: 18 }]}>Меню на {fmtDate(nutritionDate)}:</Text>
                {dayMeals.length === 0 ? (
                  <Text style={styles.placeholderText}>Блюда не назначены</Text>
                ) : (
                  <>
                    {dayMeals.map(m => (
                      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                        <Ionicons name={m.eaten ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={m.eaten ? COLORS.success : COLORS.textSecondary} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>{m.name}</Text>
                          <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>{m.calories} ккал · Б{m.protein} Ж{m.fat} У{m.carbs}{m.eaten ? '  · съедено' : ''}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeMeal(m.id)} style={{ padding: 4 }}><Ionicons name="trash-outline" size={20} color={COLORS.error} /></TouchableOpacity>
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
                      <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Ionicons name="fast-food-outline" size={18} color={COLORS.tabBar} style={{ marginRight: 10 }} />
                        <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14 }}>{e.name}</Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>{e.calories} ккал</Text>
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
                <View style={{ backgroundColor: COLORS.bg, borderRadius: 18, padding: 18, marginTop: 12, marginBottom: 20 }}>
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
