import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../components/Gradient';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { groupWorkoutData } from '../utils/workout';
import { useApp } from '../context/AppContext';
import { appAlert } from '../components/AppAlert';
import { EXERCISES, EXERCISE_GROUPS } from '../data/exercises';
import type { ExerciseDef } from '../data/exercises';
import type { WorkoutRecord, GroupedWorkout, WorkoutData } from '../types';

// Подход в конструкторе: и вручную добавленный, и предложенный ИИ — один и тот же тип,
// отличаются только источником блока (source). Отмечается галочкой "выполнено" и только
// такие подходы попадают в историю при сохранении.
interface BSet { id: string; reps: string; weight: string; completed: boolean }
interface BBlock { id: string; exercise: string; sets: BSet[]; source: 'manual' | 'ai' }

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const newSet = (reps = '', weight = ''): BSet => ({ id: uid('s'), reps, weight, completed: false });
const newBlock = (name: string, source: BBlock['source'] = 'manual'): BBlock => ({ id: uid('b'), exercise: name, source, sets: [newSet()] });

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Первая буква названия упражнения — всегда заглавная (для отображения).
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function WorkoutScreen() {
  const {
    handleTabChange, sendToAI, isLoading, history, addStructuredWorkout,
    isGeneratingPlan, generateAiWorkoutPlan,
  } = useApp();
  const [note, setNote] = useState('');

  // --- Генерация ИИ-плана тренировки ---
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planMuscleGroup, setPlanMuscleGroup] = useState('');
  const [planPrefs, setPlanPrefs] = useState('');
  const submitPlanRequest = async () => {
    if (!planMuscleGroup) { appAlert('Выбери группу мышц', 'Например «Грудь» или «Всё тело».'); return; }
    const plan = await generateAiWorkoutPlan(planMuscleGroup, planPrefs);
    if (!plan) return; // сообщение об ошибке/лимите уже показано внутри generateAiWorkoutPlan

    // ИИ сам "выбирает" упражнения — просто добавляем их как обычные блоки
    // конструктора, с уже проставленными подходами/весом. Дальше пользователь
    // работает с ними точно так же, как с блоками, добавленными вручную.
    setBlocks(prev => {
      const existing = new Set(prev.map(b => b.exercise));
      const additions: BBlock[] = plan.exercises
        .filter(ex => ex.exercise && !existing.has(cap(ex.exercise)))
        .map(ex => ({
          id: uid('b'),
          exercise: cap(ex.exercise),
          source: 'ai',
          sets: (ex.sets && ex.sets.length ? ex.sets : [{ target_reps: 8, target_weight: 0 }])
            .map(s => newSet(s.target_reps != null ? String(s.target_reps) : '', s.target_weight != null ? String(s.target_weight) : '')),
        }));
      if (additions.length === 0) {
        appAlert('Уже в списке', 'Эти упражнения уже есть в конструкторе ниже — отметь подходы там.');
        return prev;
      }
      return [...prev, ...additions];
    });
    setPlanModalVisible(false); setPlanMuscleGroup(''); setPlanPrefs('');
  };

  // --- Конструктор тренировки (блоки упражнений с подходами) ---
  const [blocks, setBlocks] = useState<BBlock[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('Все');
  const [customName, setCustomName] = useState('');

  // Выбор упражнений (мультивыбор с подсветкой)
  const toggleSelect = (name: string) =>
    setSelected(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
  const addCustomToSelection = () => {
    const n = cap(customName.trim());
    if (!n) return;
    setSelected(prev => (prev.includes(n) ? prev : [...prev, n]));
    setCustomName('');
  };
  const openPicker = () => { setSelected([]); setSearch(''); setCustomName(''); setPickerVisible(true); };
  const commitSelection = () => {
    setBlocks(prev => {
      const existing = new Set(prev.map(b => b.exercise));
      const additions = selected.filter(n => !existing.has(n)).map(n => newBlock(n, 'manual'));
      return [...prev, ...additions];
    });
    setSelected([]);
    setPickerVisible(false);
  };

  // Операции с блоками/подходами
  const addSet = (blockId: string) =>
    setBlocks(prev => prev.map(b => (b.id === blockId ? { ...b, sets: [...b.sets, newSet()] } : b)));
  const removeSet = (blockId: string, setId: string) =>
    setBlocks(prev =>
      prev
        .map(b => (b.id === blockId ? { ...b, sets: b.sets.filter(s => s.id !== setId) } : b))
        .filter(b => b.sets.length > 0)
    );
  const removeBlock = (blockId: string) => setBlocks(prev => prev.filter(b => b.id !== blockId));
  const updateSet = (blockId: string, setId: string, field: 'reps' | 'weight', value: string) =>
    setBlocks(prev =>
      prev.map(b =>
        b.id === blockId
          ? { ...b, sets: b.sets.map(s => (s.id === setId ? { ...s, [field]: value.replace(/[^0-9.]/g, '') } : s)) }
          : b
      )
    );
  // Отметка "выполнил этот подход" — только такие подходы уйдут в историю.
  const toggleSetDone = (blockId: string, setId: string) =>
    setBlocks(prev =>
      prev.map(b =>
        b.id === blockId ? { ...b, sets: b.sets.map(s => (s.id === setId ? { ...s, completed: !s.completed } : s)) } : b
      )
    );

  // Подход считается заполненным, если есть вес ИЛИ повторы (вес 0 — это норм для упражнений с весом тела).
  const isFilled = (s: BSet) => (Number(s.weight) || 0) > 0 || (Number(s.reps) || 0) > 0;
  const isDone = (s: BSet) => s.completed && isFilled(s);
  const doneCount = blocks.reduce((n, b) => n + b.sets.filter(isDone).length, 0);

  const saveBlocks = async () => {
    const items = blocks
      .flatMap(b => b.sets.filter(isDone).map(s => ({ exercise: b.exercise, weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })));
    if (items.length === 0) { appAlert('Нечего сохранять', 'Заполни подход и отметь его галочкой ✓ — «выполнено».'); return; }
    const ok = await addStructuredWorkout(items);
    if (ok) { setBlocks([]); setDayIdx(Math.max(0, dayGroups.keys.length - 1)); }
  };

  const filtered = EXERCISES.filter(e =>
    (filterGroup === 'Все' || e.group === filterGroup) &&
    (search.trim() === '' || e.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  // --- История по дням ---
  const dayGroups = useMemo(() => {
    const map = new Map<string, WorkoutData[]>();
    (history || []).forEach((w: WorkoutRecord) => {
      const key = ymd(new Date(w.created_at));
      map.set(key, [...(map.get(key) || []), ...((w.parsed_data) || [])]);
    });
    const keys = Array.from(map.keys()).sort();
    return { keys, map };
  }, [history]);

  const [dayIdx, setDayIdx] = useState(0);
  useEffect(() => { setDayIdx(Math.max(0, dayGroups.keys.length - 1)); }, [dayGroups.keys.length]);

  const safeIdx = Math.min(Math.max(dayIdx, 0), Math.max(dayGroups.keys.length - 1, 0));
  const dayKey = dayGroups.keys[safeIdx];
  const dayData = dayKey ? groupWorkoutData(dayGroups.map.get(dayKey) || []) : [];

  const dayLabel = (key?: string) => {
    if (!key) return '';
    const today = new Date();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    if (key === ymd(today)) return 'Сегодня';
    if (key === ymd(yest)) return 'Вчера';
    return new Date(key + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  };

  return (
    <ScrollView contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Личный Журнал</Text></View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>

      {/* Быстрая запись через ИИ */}
      <Text style={sectionCaption}>Быстрая запись</Text>
      <View style={styles.inputSection}>
        <TextInput style={styles.inputArea} multiline placeholder="Жим 100кг 5 по 5..." placeholderTextColor={COLORS.textSecondary} value={note} onChangeText={setNote} />
        <GradientButton colors={GRADIENTS.amber} style={styles.button} onPress={async () => { const ok = await sendToAI(note); if (ok) setNote(''); }} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить с помощью ИИ</Text>}</GradientButton>
      </View>

      {/* Конструктор тренировки */}
      <Text style={sectionCaption}>Тренировка</Text>

      {/* Сгенерировать план через ИИ */}
      <TouchableOpacity onPress={() => setPlanModalVisible(true)} style={aiPlanTrigger}>
        <View style={aiPlanIconWrap}><Ionicons name="sparkles" size={20} color={COLORS.indigo} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' }}>Сгенерировать план</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>ИИ подберёт упражнения по твоей истории</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>

      {/* Блоки упражнений (и вручную добавленные, и предложенные ИИ) */}
      {blocks.map(block => (
        <View key={block.id} style={[blockCard, block.source === 'ai' && blockCardAi]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View style={[blockIconWrap, block.source === 'ai' && blockIconWrapAi]}>
              <Ionicons name={block.source === 'ai' ? 'sparkles' : 'barbell'} size={16} color={block.source === 'ai' ? COLORS.indigo : COLORS.amber} />
            </View>
            <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' }} numberOfLines={2}>{cap(block.exercise)}</Text>
            <TouchableOpacity onPress={() => removeBlock(block.id)} style={{ padding: 4 }}><Ionicons name="trash-outline" size={20} color={COLORS.error} /></TouchableOpacity>
          </View>

          {block.sets.map((s, i) => (
            <View key={s.id} style={[setRowCard, s.completed && setRowCardDone]}>
              <View style={[setIndexBadge, s.completed && setIndexBadgeDone]}><Text style={[setIndexText, s.completed && setIndexTextDone]}>{i + 1}</Text></View>
              <TextInput style={miniInput} keyboardType="numeric" placeholder="повт" placeholderTextColor={COLORS.textMuted} value={s.reps} onChangeText={v => updateSet(block.id, s.id, 'reps', v)} />
              <TextInput style={miniInput} keyboardType="numeric" placeholder="кг" placeholderTextColor={COLORS.textMuted} value={s.weight} onChangeText={v => updateSet(block.id, s.id, 'weight', v)} />
              <TouchableOpacity onPress={() => toggleSetDone(block.id, s.id)} style={{ paddingHorizontal: 8 }}>
                <Ionicons name={s.completed ? 'checkmark-circle' : 'ellipse-outline'} size={27} color={s.completed ? COLORS.emerald : COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeSet(block.id, s.id)}><Ionicons name="close-circle" size={22} color={COLORS.textMuted} /></TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity onPress={() => addSet(block.id)} style={addSetBtn}>
            <Ionicons name="add" size={18} color={COLORS.amber} />
            <Text style={{ color: COLORS.amber, fontWeight: '800', fontSize: 14, marginLeft: 6 }}>Добавить подход</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Добавить упражнение */}
      <GradientButton colors={GRADIENTS.amber} style={[styles.mainActionBtn, { marginBottom: blocks.length ? 12 : 20 }]} onPress={openPicker}>
        <Ionicons name="list" size={24} color="#fff" style={{ marginRight: 10 }} />
        <Text style={styles.mainActionText}>Добавить упражнение</Text>
      </GradientButton>

      {/* Сохранить в «сегодня» — только отмеченные галочкой подходы */}
      {blocks.length > 0 && (
        <GradientButton colors={GRADIENTS.emerald} style={[styles.button, { marginBottom: 24 }]} onPress={saveBlocks} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Добавить в журнал ({doneCount})</Text>}
        </GradientButton>
      )}

      {/* История по дням */}
      <Text style={sectionCaption}>История</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <TouchableOpacity disabled={safeIdx <= 0} onPress={() => setDayIdx(safeIdx - 1)} style={{ padding: 8, opacity: safeIdx <= 0 ? 0.25 : 1 }}>
          <Ionicons name="chevron-back" size={26} color={COLORS.amber} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '900', textTransform: 'capitalize', letterSpacing: -0.3 }}>{dayKey ? dayLabel(dayKey) : 'История'}</Text>
          {dayGroups.keys.length > 0 && <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{safeIdx + 1} из {dayGroups.keys.length}</Text>}
        </View>
        <TouchableOpacity disabled={safeIdx >= dayGroups.keys.length - 1} onPress={() => setDayIdx(safeIdx + 1)} style={{ padding: 8, opacity: safeIdx >= dayGroups.keys.length - 1 ? 0.25 : 1 }}>
          <Ionicons name="chevron-forward" size={26} color={COLORS.amber} />
        </TouchableOpacity>
      </View>

      {dayGroups.keys.length === 0 ? (
        <View style={styles.emptyCardList}><Text style={styles.placeholderText}>Записей пока нет. Создай первую тренировку выше.</Text></View>
      ) : (
        <View style={styles.historyCard}>
          {dayData.map((group: GroupedWorkout, gIdx: number) => (
            <View key={gIdx} style={{ marginTop: gIdx === 0 ? 0 : 18 }}>
              <Text style={styles.groupExerciseTitle}>{cap(group.exercise)}</Text>
              {group.sets.map((item: WorkoutData, index: number) => (
                <View key={index} style={historySetRow}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.emerald} style={{ marginRight: 10 }} />
                  <Text style={styles.exerciseSetText}>Подход {index + 1}</Text>
                  <Text style={styles.setDetails}>{item.weight}кг × {item.reps}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      <View style={{ height: 60 }} />

      {/* Модалка выбора упражнения (мультивыбор) */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlayFull}>
          <View style={styles.modalContentFull}>
            <View style={styles.modalHeaderFull}>
              <Text style={styles.modalTitleFull}>Упражнения</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}><Ionicons name="close-circle" size={36} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>

            {/* Поиск */}
            <TextInput style={[styles.inputArea, { marginTop: 8 }]} placeholder="Поиск упражнения..." placeholderTextColor={COLORS.textSecondary} value={search} onChangeText={setSearch} />

            {/* Своё упражнение вручную */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <TextInput style={[styles.inputArea, { flex: 1, marginBottom: 0 }]} placeholder="Своё упражнение..." placeholderTextColor={COLORS.textSecondary} value={customName} onChangeText={setCustomName} />
              <TouchableOpacity onPress={addCustomToSelection} style={{ marginLeft: 8 }}><Ionicons name="add-circle" size={40} color={COLORS.amber} /></TouchableOpacity>
            </View>

            {/* Категории */}
            <View style={{ height: 44, marginTop: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {EXERCISE_GROUPS.map(g => (
                  <TouchableOpacity key={g} onPress={() => setFilterGroup(g)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: filterGroup === g ? COLORS.amber : COLORS.cardAlt, borderWidth: 1, borderColor: filterGroup === g ? COLORS.amber : 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ color: filterGroup === g ? '#1A1205' : COLORS.textSecondary, fontWeight: '700', fontSize: 13 }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Список с подсветкой выбранного */}
            <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {filtered.map((ex: ExerciseDef, i: number) => {
                const isSel = selected.includes(ex.name);
                return (
                  <TouchableOpacity key={i} onPress={() => toggleSelect(ex.name)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, borderRadius: 16, backgroundColor: isSel ? 'rgba(251,191,36,0.16)' : 'transparent', borderWidth: 1, borderColor: isSel ? 'rgba(251,191,36,0.55)' : COLORS.borderSoft }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: isSel ? '800' : '600' }}>{ex.name}</Text>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>{ex.group} · {ex.equipment}</Text>
                    </View>
                    <Ionicons name={isSel ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={isSel ? COLORS.amber : COLORS.textMuted} />
                  </TouchableOpacity>
                );
              })}
              {filtered.length === 0 && <Text style={[styles.placeholderText, { marginTop: 20 }]}>Ничего не найдено. Добавь как своё упражнение ↑</Text>}
              <View style={{ height: 20 }} />
            </ScrollView>

            <GradientButton colors={GRADIENTS.amber} style={[styles.button, { marginTop: 6 }]} onPress={commitSelection} disabled={selected.length === 0}>
              <Text style={styles.buttonText}>Готово{selected.length ? ` (${selected.length})` : ''}</Text>
            </GradientButton>
          </View>
        </View>
      </Modal>

      {/* Модалка запроса ИИ-плана: группа мышц + предпочтения */}
      <Modal visible={planModalVisible} animationType="slide" transparent onRequestClose={() => setPlanModalVisible(false)}>
        <View style={styles.modalOverlayFull}>
          <View style={styles.modalContentFull}>
            <View style={styles.modalHeaderFull}>
              <Text style={styles.modalTitleFull}>План от ИИ</Text>
              <TouchableOpacity onPress={() => setPlanModalVisible(false)}><Ionicons name="close-circle" size={36} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>

            <Text style={[styles.label, { marginTop: 8 }]}>Группа мышц / комплекс</Text>
            <View style={{ height: 44, marginTop: 4 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {EXERCISE_GROUPS.filter(g => g !== 'Все').map(g => (
                  <TouchableOpacity key={g} onPress={() => setPlanMuscleGroup(g)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: planMuscleGroup === g ? COLORS.indigo : COLORS.cardAlt, borderWidth: 1, borderColor: planMuscleGroup === g ? COLORS.indigo : 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ color: planMuscleGroup === g ? '#fff' : COLORS.textSecondary, fontWeight: '700', fontSize: 13 }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Предпочтения (необязательно)</Text>
            <TextInput
              style={[styles.inputArea, { marginTop: 4 }]} multiline
              placeholder="Например: нет доступа к штанге, болит колено, хочу упор на трицепс..."
              placeholderTextColor={COLORS.textSecondary} value={planPrefs} onChangeText={setPlanPrefs}
            />

            <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 10, lineHeight: 17 }}>
              ИИ учтёт твой личный журнал (последний вес и повторы) и добавит подобранные упражнения
              прямо сюда, в конструктор — останется отметить выполненные подходы и нажать «Добавить».
            </Text>

            <GradientButton colors={GRADIENTS.violetIndigo} style={[styles.button, { marginTop: 16 }]} onPress={submitPlanRequest} disabled={isGeneratingPlan || !planMuscleGroup}>
              {isGeneratingPlan ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сгенерировать</Text>}
            </GradientButton>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const miniInput = { width: 64, height: 44, backgroundColor: COLORS.bg, borderRadius: 12, color: COLORS.textPrimary, textAlign: 'center' as const, marginRight: 8, fontSize: 15, fontWeight: '700' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' };

const sectionCaption = { color: COLORS.textMuted, fontSize: 12, fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 1.4, marginBottom: 10, marginTop: 2 };

const aiPlanTrigger = { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: COLORS.card, borderRadius: 22, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' };
const aiPlanIconWrap = { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 14 };

const blockCard = { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(251,191,36,0.22)' };
const blockCardAi = { borderColor: 'rgba(139,92,246,0.3)' };
const blockIconWrap = { width: 32, height: 32, borderRadius: 11, backgroundColor: 'rgba(251,191,36,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 10 };
const blockIconWrapAi = { backgroundColor: 'rgba(139,92,246,0.14)' };

const setRowCard = { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: COLORS.cardAlt, borderRadius: 16, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' };
const setRowCardDone = { backgroundColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.3)' };
const setIndexBadge = { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 10 };
const setIndexBadgeDone = { backgroundColor: 'rgba(52,211,153,0.2)' };
const setIndexText = { color: COLORS.textSecondary, fontWeight: '800' as const, fontSize: 12 };
const setIndexTextDone = { color: COLORS.emerald };

const addSetBtn = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 11, borderRadius: 14, backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)', marginTop: 4 };

const historySetRow = { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8 };
