import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../components/Gradient';
import { KeyboardAvoid } from '../components/KeyboardAvoid';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { groupWorkoutData } from '../utils/workout';
import { exerciseKey, formatSet, type ExerciseStat } from '../utils/stats';
import { ymd, parseYmd, plural } from '../utils/date';
import { useApp } from '../context/AppContext';
import { appAlert } from '../components/AppAlert';
import { EXERCISES, EXERCISE_GROUPS } from '../data/exercises';
import type { ExerciseDef } from '../data/exercises';
import type {
  GroupedWorkout, GeneratedWorkoutPlan, JournalSet,
  WorkoutBuilderSet as BSet, WorkoutBuilderBlock as BBlock,
} from '../types';

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const newSet = (reps = '', weight = ''): BSet => ({ id: uid('s'), reps, weight, completed: false });
const newBlock = (name: string, source: BBlock['source'] = 'manual'): BBlock => ({ id: uid('b'), exercise: name, source, sets: [newSet()] });

// Первая буква названия упражнения — всегда заглавная (для отображения).
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const numStr = (n: unknown) => (n === null || n === undefined || n === '' ? '' : String(n));

// План от ИИ (из модалки "Сгенерировать план" или предложенный прямо в чате) -> блоки
// конструктора. existing — ключи упражнений, уже присутствующих в списке (не дублируем).
const buildAiBlocks = (plan: GeneratedWorkoutPlan, existing: Set<string>): BBlock[] =>
  (plan.exercises || [])
    .filter(ex => ex.exercise && !existing.has(exerciseKey(ex.exercise)))
    .map(ex => ({
      id: uid('b'),
      exercise: cap(ex.exercise),
      source: 'ai' as const,
      sets: (ex.sets && ex.sets.length ? ex.sets : [{ target_reps: 8, target_weight: 0 }])
        .map(s => newSet(numStr(s.target_reps), numStr(s.target_weight))),
    }));

const REST_OPTIONS = [0, 60, 90, 120, 180];
const fmtRest = (sec: number) => (sec === 0 ? 'Выкл' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
const shortDate = (d: string) => parseYmd(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

// Одна карточка блока-упражнения в конструкторе. React.memo — чтобы ввод в одном подходе
// (или изменение любого другого стейта экрана) не перерисовывал ВСЕ блоки/подходы, когда их
// много (например, после большого ИИ-плана): перерисуется только тот блок, чьи данные и правда
// изменились. Все колбэки-пропсы у родителя обёрнуты в useCallback, а stat берётся из
// мемоизированной статистики контекста — ссылка стабильна, пока не изменилась история.
const BlockCard = React.memo(function BlockCard({
  block, stat, onRemoveBlock, onAddSet, onRemoveSet, onUpdateSet, onToggleSetDone, onFillFromLast,
}: {
  block: BBlock;
  stat?: ExerciseStat;
  onRemoveBlock: (blockId: string) => void;
  onAddSet: (blockId: string) => void;
  onRemoveSet: (blockId: string, setId: string) => void;
  onUpdateSet: (blockId: string, setId: string, field: 'reps' | 'weight', value: string) => void;
  onToggleSetDone: (blockId: string, setId: string, wasCompleted: boolean) => void;
  onFillFromLast: (blockId: string) => void;
}) {
  const allEmpty = block.sets.every(s => !s.reps && !s.weight);
  const hasLast = !!stat && stat.lastSets.length > 0;
  return (
    <View style={[blockCard, block.source === 'ai' && blockCardAi]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: hasLast ? 8 : 14 }}>
        <View style={[blockIconWrap, block.source === 'ai' && blockIconWrapAi]}>
          <Ionicons name={block.source === 'ai' ? 'sparkles' : 'barbell'} size={16} color={block.source === 'ai' ? COLORS.indigo : COLORS.amber} />
        </View>
        <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' }} numberOfLines={2}>{cap(block.exercise)}</Text>
        <TouchableOpacity onPress={() => onRemoveBlock(block.id)} style={{ padding: 4 }} accessibilityLabel="Удалить упражнение"><Ionicons name="trash-outline" size={20} color={COLORS.error} /></TouchableOpacity>
      </View>

      {/* Прошлый раз и рекорд — чтобы прогрессировать нагрузку, а не вспоминать цифры. */}
      {hasLast && (
        <View style={lastBox}>
          <Text style={lastText} numberOfLines={2}>
            <Text style={{ color: COLORS.textSecondary, fontWeight: '700' }}>Прошлый раз ({shortDate(stat!.lastDate)}): </Text>
            {stat!.lastSets.slice(0, 5).map(formatSet).join(' · ')}
          </Text>
          {stat!.bestWeight > 0 && <Text style={[lastText, { marginTop: 2 }]}>🏆 Рекорд: {stat!.bestWeight} кг × {stat!.bestWeightReps}</Text>}
          {allEmpty && (
            <TouchableOpacity onPress={() => onFillFromLast(block.id)} style={fillBtn}>
              <Ionicons name="repeat" size={15} color={COLORS.cyan} />
              <Text style={{ color: COLORS.cyan, fontWeight: '800', fontSize: 13, marginLeft: 6 }}>Заполнить как в прошлый раз</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {block.sets.map((s, i) => {
        const isPR = s.completed && !!stat && stat.bestWeight > 0 && Number(s.weight) > stat.bestWeight;
        return (
          <View key={s.id} style={[setRowCard, s.completed && setRowCardDone]}>
            <View style={[setIndexBadge, s.completed && setIndexBadgeDone]}><Text style={[setIndexText, s.completed && setIndexTextDone]}>{i + 1}</Text></View>
            <TextInput style={miniInput} keyboardType="decimal-pad" placeholder="повт" placeholderTextColor={COLORS.textMuted} value={s.reps} onChangeText={v => onUpdateSet(block.id, s.id, 'reps', v)} maxLength={4} />
            <TextInput style={miniInput} keyboardType="decimal-pad" placeholder="кг" placeholderTextColor={COLORS.textMuted} value={s.weight} onChangeText={v => onUpdateSet(block.id, s.id, 'weight', v)} maxLength={6} />
            {isPR ? <Text style={prBadge}>🏆</Text> : <View style={{ flex: 1 }} />}
            <TouchableOpacity onPress={() => onToggleSetDone(block.id, s.id, s.completed)} style={{ paddingHorizontal: 8 }} accessibilityLabel={s.completed ? 'Снять отметку' : 'Подход выполнен'}>
              <Ionicons name={s.completed ? 'checkmark-circle' : 'ellipse-outline'} size={27} color={s.completed ? COLORS.emerald : COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onRemoveSet(block.id, s.id)} accessibilityLabel="Удалить подход"><Ionicons name="close-circle" size={22} color={COLORS.textMuted} /></TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity onPress={() => onAddSet(block.id)} style={addSetBtn}>
        <Ionicons name="add" size={18} color={COLORS.amber} />
        <Text style={{ color: COLORS.amber, fontWeight: '800', fontSize: 14, marginLeft: 6 }}>Добавить подход</Text>
      </TouchableOpacity>
    </View>
  );
});

// Плашка таймера отдыха над таб-баром. Тикает локально; момент окончания — в контексте,
// так что таймер переживает уход на другую вкладку, а уведомление сработает и в фоне.
function RestTimerBar({ endsAt, onAdjust, onStop }: { endsAt: number; onAdjust: (d: number) => void; onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = left === 0;
  useEffect(() => {
    if (done && now - endsAt > 8000) onStop(); // через 8 с после окончания плашка убирается сама
  }, [done, now, endsAt, onStop]);
  return (
    <View style={[restBar, done && { borderColor: 'rgba(52,211,153,0.6)' }]}>
      <Ionicons name={done ? 'checkmark-circle' : 'timer-outline'} size={22} color={done ? COLORS.emerald : COLORS.cyan} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700' }}>{done ? 'ОТДЫХ ОКОНЧЕН' : 'ОТДЫХ'}</Text>
        <Text style={{ color: done ? COLORS.emerald : COLORS.textPrimary, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
          {done ? 'Следующий подход!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
        </Text>
      </View>
      {!done && (
        <>
          <TouchableOpacity onPress={() => onAdjust(-15)} style={restBtn}><Text style={restBtnText}>−15</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => onAdjust(15)} style={restBtn}><Text style={restBtnText}>+15</Text></TouchableOpacity>
        </>
      )}
      <TouchableOpacity onPress={onStop} style={{ padding: 6, marginLeft: 2 }} accessibilityLabel="Закрыть таймер"><Ionicons name="close" size={22} color={COLORS.textSecondary} /></TouchableOpacity>
    </View>
  );
}

export default function WorkoutScreen() {
  const {
    handleTabChange, sendToAI, isLoading, addStructuredWorkout,
    isGeneratingPlan, generateAiWorkoutPlan, pendingWorkoutPlan, setPendingWorkoutPlan,
    workoutBlocks: blocks, setWorkoutBlocks: setBlocks, journalDayGroups: dayGroups, deleteJournalSets,
    exerciseStats, restEndsAt, restDuration, startRestTimer, adjustRestTimer, stopRestTimer, changeRestDuration,
    askCompanion,
  } = useApp();
  const [note, setNote] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const builderY = useRef(0);

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
    const additions = buildAiBlocks(plan, new Set(blocks.map(b => exerciseKey(b.exercise))));
    if (additions.length === 0) {
      appAlert('Уже в списке', 'Эти упражнения уже есть в конструкторе ниже — отметь подходы там.');
    } else {
      setBlocks(prev => [...prev, ...additions]);
    }
    setPlanModalVisible(false); setPlanMuscleGroup(''); setPlanPrefs('');
  };

  // --- Конструктор тренировки (блоки упражнений с подходами) ---
  // blocks/setBlocks — из контекста (см. useApp() выше), а не локальный useState: экран
  // размонтируется при переключении вкладок, и локальный стейт стирался бы каждый раз.

  // ИИ мог предложить тренировку прямо в обычном чате ("Добавить в тренировку" под
  // сообщением) — она приезжает сюда через контекст и точно так же превращается в блоки.
  useEffect(() => {
    if (!pendingWorkoutPlan) return;
    setBlocks(prev => {
      const additions = buildAiBlocks(pendingWorkoutPlan, new Set(prev.map(b => exerciseKey(b.exercise))));
      return additions.length ? [...prev, ...additions] : prev;
    });
    setPendingWorkoutPlan(null);
  }, [pendingWorkoutPlan, setPendingWorkoutPlan]);

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
      const existing = new Set(prev.map(b => exerciseKey(b.exercise)));
      const additions = selected.filter(n => !existing.has(exerciseKey(n))).map(n => newBlock(n, 'manual'));
      return [...prev, ...additions];
    });
    setSelected([]);
    setPickerVisible(false);
  };

  // Таймер отдыха стартует при отметке подхода. Через ref — чтобы колбэк оставался
  // стабильным (иначе BlockCard перерисовывался бы целиком на каждый рендер экрана).
  const startRestRef = useRef(startRestTimer);
  startRestRef.current = startRestTimer;
  const statsRef = useRef(exerciseStats);
  statsRef.current = exerciseStats;

  // Операции с блоками/подходами. useCallback со стабильной ссылкой (весь код использует
  // функциональную форму setBlocks(prev => ...), внешних зависимостей нет) — нужно, чтобы
  // BlockCard ниже мог быть React.memo и не перерисовывать ВСЕ блоки на каждый чих.
  const addSet = React.useCallback((blockId: string) =>
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      // Новый подход наследует вес/повторы предыдущего — обычно их и повторяют.
      const last = b.sets[b.sets.length - 1];
      return { ...b, sets: [...b.sets, newSet(last?.reps || '', last?.weight || '')] };
    })), [setBlocks]);
  const removeSet = React.useCallback((blockId: string, setId: string) =>
    setBlocks(prev =>
      prev
        .map(b => (b.id === blockId ? { ...b, sets: b.sets.filter(s => s.id !== setId) } : b))
        .filter(b => b.sets.length > 0)
    ), [setBlocks]);
  const removeBlock = React.useCallback((blockId: string) => setBlocks(prev => prev.filter(b => b.id !== blockId)), [setBlocks]);
  const updateSet = React.useCallback((blockId: string, setId: string, field: 'reps' | 'weight', value: string) =>
    setBlocks(prev =>
      prev.map(b =>
        b.id === blockId
          // Запятая → точка: русская цифровая клавиатура даёт «52,5», и раньше запятая просто
          // вырезалась — получалось 525 кг.
          ? { ...b, sets: b.sets.map(s => (s.id === setId ? { ...s, [field]: value.replace(/,/g, '.').replace(/[^0-9.]/g, '') } : s)) }
          : b
      )
    ), [setBlocks]);
  // Отметка "выполнил этот подход" — только такие подходы уйдут в историю.
  const toggleSetDone = React.useCallback((blockId: string, setId: string, wasCompleted: boolean) => {
    setBlocks(prev =>
      prev.map(b =>
        b.id === blockId ? { ...b, sets: b.sets.map(s => (s.id === setId ? { ...s, completed: !s.completed } : s)) } : b
      )
    );
    if (!wasCompleted) startRestRef.current();
  }, [setBlocks]);
  const fillFromLast = React.useCallback((blockId: string) =>
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const st = statsRef.current[exerciseKey(b.exercise)];
      if (!st?.lastSets.length) return b;
      return { ...b, sets: st.lastSets.map(s => newSet(String(s.reps || ''), s.weight ? String(s.weight) : '')) };
    })), [setBlocks]);

  // Подход считается заполненным, если есть вес ИЛИ повторы (вес 0 — это норм для упражнений с весом тела).
  const isFilled = (s: BSet) => (Number(s.weight) || 0) > 0 || (Number(s.reps) || 0) > 0;
  const isDone = (s: BSet) => s.completed && isFilled(s);
  const doneCount = blocks.reduce((n, b) => n + b.sets.filter(isDone).length, 0);

  const saveBlocks = async () => {
    const items = blocks
      .flatMap(b => b.sets.filter(isDone).map(s => ({ exercise: b.exercise, weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })));
    if (items.length === 0) { appAlert('Нечего сохранять', 'Заполни подход и отметь его галочкой ✓ — «выполнено».'); return; }
    const ok = await addStructuredWorkout(items);
    if (ok) {
      // Невыполненные подходы остаются в конструкторе — их можно доделать и добавить позже.
      setBlocks(prev => prev.map(b => ({ ...b, sets: b.sets.filter(s => !isDone(s)) })).filter(b => b.sets.length > 0));
      stopRestTimer();
    }
  };

  const clearBuilder = () => appAlert('Очистить конструктор?', 'Невыполненные подходы будут удалены.', [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Очистить', style: 'destructive', onPress: () => setBlocks([]) },
  ]);

  // Список упражнений для модалки выбора — считаем только пока она реально открыта
  // (Modal в RN монтирует children даже при visible=false).
  const filtered = useMemo(() => {
    if (!pickerVisible) return [];
    const q = exerciseKey(search);
    return EXERCISES.filter(e =>
      (filterGroup === 'Все' || e.group === filterGroup) &&
      (q === '' || exerciseKey(e.name).includes(q))
    );
  }, [pickerVisible, filterGroup, search]);

  // --- История по дням --- dayGroups приходит из контекста (journalDayGroups), не
  // пересчитывается локально: экран размонтируется при каждом переключении вкладки.

  // Ленивый инициализатор — а не useState(0) + корректирующий useEffect: dayGroups уже
  // посчитан к этому моменту рендера, так что сразу берём последний день.
  const [dayIdx, setDayIdx] = useState(() => Math.max(0, dayGroups.keys.length - 1));
  useEffect(() => { setDayIdx(Math.max(0, dayGroups.keys.length - 1)); }, [dayGroups.keys.length]);
  const [editHistory, setEditHistory] = useState(false);

  const safeIdx = Math.min(Math.max(dayIdx, 0), Math.max(dayGroups.keys.length - 1, 0));
  const dayKey = dayGroups.keys[safeIdx];
  const daySets = useMemo(() => (dayKey ? dayGroups.map.get(dayKey) || [] : []), [dayKey, dayGroups]);
  const dayData = useMemo(() => groupWorkoutData(daySets), [daySets]);
  const dayVolume = daySets.reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);

  const dayLabel = (key?: string) => {
    if (!key) return '';
    const today = new Date();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    if (key === ymd(today)) return 'Сегодня';
    if (key === ymd(yest)) return 'Вчера';
    return parseYmd(key).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  };

  // «Повторить тренировку»: упражнения выбранного дня → в конструктор, с теми же весами и
  // повторами (без отметок). Самый частый сценарий в зале — сделать то же, что в прошлый раз.
  const repeatDay = () => {
    const additions: BBlock[] = dayData
      .filter(g => !blocks.some(b => exerciseKey(b.exercise) === exerciseKey(g.exercise)))
      .map(g => ({
        id: uid('b'), exercise: cap(g.exercise), source: 'manual' as const,
        sets: g.sets.map(s => newSet(numStr(s.reps), Number(s.weight) ? numStr(s.weight) : '')),
      }));
    if (!additions.length) { appAlert('Уже в конструкторе', 'Эти упражнения уже добавлены выше.'); return; }
    setBlocks(prev => [...prev, ...additions]);
    setEditHistory(false);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, builderY.current - 10), animated: true }));
  };

  const deleteExerciseFromDay = (group: GroupedWorkout) => appAlert(
    'Удалить из истории?', `${cap(group.exercise)} — ${group.sets.length} ${plural(group.sets.length, ['подход', 'подхода', 'подходов'])} за ${dayLabel(dayKey).toLowerCase()}.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteJournalSets(group.sets as JournalSet[]) },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoid>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Личный Журнал</Text></View>
            <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
          </View>

          {/* Быстрая запись через ИИ */}
          <Text style={sectionCaption}>Быстрая запись</Text>
          <View style={styles.inputSection}>
            <TextInput style={styles.inputArea} multiline placeholder="Жим 100кг 5 по 5..." placeholderTextColor={COLORS.textSecondary} value={note} onChangeText={setNote} maxLength={2000} />
            <GradientButton colors={GRADIENTS.amber} style={styles.button} onPress={async () => { const ok = await sendToAI(note); if (ok) setNote(''); }} disabled={isLoading || !note.trim()}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить с помощью ИИ</Text>}</GradientButton>
          </View>

          {/* Конструктор тренировки */}
          <View onLayout={e => { builderY.current = e.nativeEvent.layout.y; }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={sectionCaption}>Тренировка</Text>
            {blocks.length > 0 && <TouchableOpacity onPress={clearBuilder}><Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>Очистить</Text></TouchableOpacity>}
          </View>

          {/* Что делать сегодня — компаньон смотрит журнал и предлагает тренировку */}
          <TouchableOpacity onPress={() => askCompanion('Пересмотри мои последние тренировки и посоветуй, что сделать сегодня. Дай конкретный план с весами.')} style={[aiPlanTrigger, { borderColor: 'rgba(34,211,238,0.3)' }]}>
            <View style={[aiPlanIconWrap, { backgroundColor: 'rgba(34,211,238,0.14)' }]}><Ionicons name="chatbubbles" size={20} color={COLORS.cyan} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' }}>Что сделать сегодня?</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>Компаньон разберёт журнал и предложит тренировку</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Сгенерировать план через ИИ */}
          <TouchableOpacity onPress={() => setPlanModalVisible(true)} style={aiPlanTrigger}>
            <View style={aiPlanIconWrap}><Ionicons name="sparkles" size={20} color={COLORS.indigo} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' }}>Сгенерировать план</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>ИИ подберёт упражнения на группу мышц по твоей истории</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Блоки упражнений (и вручную добавленные, и предложенные ИИ) */}
          {blocks.map(block => (
            <BlockCard
              key={block.id} block={block} stat={exerciseStats[exerciseKey(block.exercise)]}
              onRemoveBlock={removeBlock} onAddSet={addSet} onRemoveSet={removeSet}
              onUpdateSet={updateSet} onToggleSetDone={toggleSetDone} onFillFromLast={fillFromLast}
            />
          ))}

          {/* Отдых между подходами — таймер стартует, когда отмечаешь подход выполненным */}
          {blocks.length > 0 && (
            <View style={restRow}>
              <Ionicons name="timer-outline" size={16} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '700', marginLeft: 6, marginRight: 8 }}>Отдых:</Text>
              {REST_OPTIONS.map(sec => (
                <TouchableOpacity key={sec} onPress={() => changeRestDuration(sec)} style={[restChip, restDuration === sec && restChipActive]}>
                  <Text style={{ color: restDuration === sec ? '#06222A' : COLORS.textSecondary, fontSize: 12, fontWeight: '800' }}>{fmtRest(sec)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Добавить упражнение */}
          <GradientButton colors={GRADIENTS.amber} style={[styles.mainActionBtn, { marginBottom: blocks.length ? 12 : 20 }]} onPress={openPicker}>
            <Ionicons name="list" size={24} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.mainActionText}>Добавить упражнение</Text>
          </GradientButton>

          {/* Сохранить в «сегодня» — только отмеченные галочкой подходы */}
          {blocks.length > 0 && (
            <GradientButton colors={GRADIENTS.emerald} style={[styles.button, { marginBottom: 24 }]} onPress={saveBlocks} disabled={isLoading || doneCount === 0}>
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{doneCount ? `Добавить в журнал (${doneCount})` : 'Отметь выполненные подходы ✓'}</Text>}
            </GradientButton>
          )}

          {/* История по дням */}
          <Text style={sectionCaption}>История</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <TouchableOpacity disabled={safeIdx <= 0} onPress={() => { setDayIdx(safeIdx - 1); setEditHistory(false); }} style={{ padding: 8, opacity: safeIdx <= 0 ? 0.25 : 1 }}>
              <Ionicons name="chevron-back" size={26} color={COLORS.amber} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '900', textTransform: 'capitalize', letterSpacing: -0.3 }}>{dayKey ? dayLabel(dayKey) : 'История'}</Text>
              {dayGroups.keys.length > 0 && <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{safeIdx + 1} из {dayGroups.keys.length}</Text>}
            </View>
            <TouchableOpacity disabled={safeIdx >= dayGroups.keys.length - 1} onPress={() => { setDayIdx(safeIdx + 1); setEditHistory(false); }} style={{ padding: 8, opacity: safeIdx >= dayGroups.keys.length - 1 ? 0.25 : 1 }}>
              <Ionicons name="chevron-forward" size={26} color={COLORS.amber} />
            </TouchableOpacity>
          </View>

          {dayGroups.keys.length === 0 ? (
            <View style={styles.emptyCardList}><Text style={styles.placeholderText}>Записей пока нет. Создай первую тренировку выше.</Text></View>
          ) : (
            <View style={styles.historyCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
                  {daySets.length} {plural(daySets.length, ['подход', 'подхода', 'подходов'])}{dayVolume > 0 ? ` · ${Math.round(dayVolume)} кг тоннаж` : ''}
                </Text>
                <TouchableOpacity onPress={repeatDay} style={historyAction}>
                  <Ionicons name="repeat" size={15} color={COLORS.amber} />
                  <Text style={historyActionText}>Повторить</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditHistory(v => !v)} style={[historyAction, { marginLeft: 8 }]}>
                  <Ionicons name={editHistory ? 'checkmark' : 'create-outline'} size={15} color={editHistory ? COLORS.emerald : COLORS.textSecondary} />
                  <Text style={[historyActionText, { color: editHistory ? COLORS.emerald : COLORS.textSecondary }]}>{editHistory ? 'Готово' : 'Изменить'}</Text>
                </TouchableOpacity>
              </View>
              {dayData.map((group: GroupedWorkout, gIdx: number) => (
                <View key={`${group.exercise}_${gIdx}`} style={{ marginTop: gIdx === 0 ? 0 : 18 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.groupExerciseTitle, { flex: 1 }]}>{cap(group.exercise)}</Text>
                    {editHistory && (
                      <TouchableOpacity onPress={() => deleteExerciseFromDay(group)} style={{ padding: 4, marginBottom: 8 }} accessibilityLabel="Удалить упражнение из истории">
                        <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {(group.sets as JournalSet[]).map((item, index: number) => (
                    <View key={`${item._rid}_${item._idx}`} style={historySetRow}>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.emerald} style={{ marginRight: 10 }} />
                      <Text style={styles.exerciseSetText}>Подход {index + 1}</Text>
                      <Text style={styles.setDetails}>{item.weight}кг × {item.reps}</Text>
                      {editHistory && (
                        <TouchableOpacity onPress={() => deleteJournalSets([item])} style={{ paddingLeft: 12 }} accessibilityLabel="Удалить подход">
                          <Ionicons name="close-circle" size={22} color={COLORS.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
          <View style={{ height: restEndsAt ? 140 : 60 }} />
        </ScrollView>
      </KeyboardAvoid>

      {restEndsAt !== null && <RestTimerBar endsAt={restEndsAt} onAdjust={adjustRestTimer} onStop={stopRestTimer} />}

      {/* Модалка выбора упражнения (мультивыбор) */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <KeyboardAvoid style={styles.modalOverlayFull}>
          <View style={styles.modalContentFull}>
            <View style={styles.modalHeaderFull}>
              <Text style={styles.modalTitleFull}>Упражнения</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}><Ionicons name="close-circle" size={36} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>

            {/* Поиск */}
            <TextInput style={[styles.inputArea, searchInput]} placeholder="Поиск упражнения..." placeholderTextColor={COLORS.textSecondary} value={search} onChangeText={setSearch} />

            {/* Своё упражнение вручную */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <TextInput style={[styles.inputArea, searchInput, { flex: 1, marginBottom: 0, marginTop: 0 }]} placeholder="Своё упражнение..." placeholderTextColor={COLORS.textSecondary} value={customName} onChangeText={setCustomName} onSubmitEditing={addCustomToSelection} returnKeyType="done" />
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
            <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Свои упражнения, выбранные вручную, — тоже видны в списке, чтобы их можно было снять */}
              {selected.filter(n => !EXERCISES.some(e => e.name === n)).map(n => (
                <TouchableOpacity key={`custom_${n}`} onPress={() => toggleSelect(n)} style={[pickerRow, pickerRowSel]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' }}>{n}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>своё упражнение</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={28} color={COLORS.amber} />
                </TouchableOpacity>
              ))}
              {filtered.map((ex: ExerciseDef) => {
                const isSel = selected.includes(ex.name);
                const st = exerciseStats[exerciseKey(ex.name)];
                return (
                  <TouchableOpacity key={ex.name} onPress={() => toggleSelect(ex.name)} style={[pickerRow, isSel && pickerRowSel]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: isSel ? '800' : '600' }}>{ex.name}</Text>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {ex.group} · {ex.equipment}{st?.bestWeight ? ` · рекорд ${st.bestWeight} кг` : ''}
                      </Text>
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
        </KeyboardAvoid>
      </Modal>

      {/* Модалка запроса ИИ-плана: группа мышц + предпочтения */}
      <Modal visible={planModalVisible} animationType="slide" transparent onRequestClose={() => setPlanModalVisible(false)}>
        <KeyboardAvoid style={styles.modalOverlayFull}>
          <View style={styles.modalContentFull}>
            <View style={styles.modalHeaderFull}>
              <Text style={styles.modalTitleFull}>План от ИИ</Text>
              <TouchableOpacity onPress={() => setPlanModalVisible(false)}><Ionicons name="close-circle" size={36} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { marginTop: 8 }]}>Группа мышц / комплекс</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                {EXERCISE_GROUPS.filter(g => g !== 'Все').map(g => (
                  <TouchableOpacity key={g} onPress={() => setPlanMuscleGroup(g)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8, backgroundColor: planMuscleGroup === g ? COLORS.indigo : COLORS.cardAlt, borderWidth: 1, borderColor: planMuscleGroup === g ? COLORS.indigo : 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ color: planMuscleGroup === g ? '#fff' : COLORS.textSecondary, fontWeight: '700', fontSize: 13 }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 12 }]}>Предпочтения (необязательно)</Text>
              <TextInput
                style={[styles.inputArea, { marginTop: 4 }]} multiline maxLength={500}
                placeholder="Например: нет доступа к штанге, болит колено, хочу упор на трицепс..."
                placeholderTextColor={COLORS.textSecondary} value={planPrefs} onChangeText={setPlanPrefs}
              />

              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                ИИ учтёт твой журнал (последний вес и повторы, рекорды, что тренировалось недавно) и добавит
                упражнения прямо сюда, в конструктор — останется отметить выполненные подходы и нажать «Добавить».
              </Text>

              <GradientButton colors={GRADIENTS.violetIndigo} style={[styles.button, { marginTop: 16, marginBottom: 20 }]} onPress={submitPlanRequest} disabled={isGeneratingPlan || !planMuscleGroup}>
                {isGeneratingPlan ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сгенерировать</Text>}
              </GradientButton>
            </ScrollView>
          </View>
        </KeyboardAvoid>
      </Modal>
    </View>
  );
}

const miniInput = { width: 64, height: 44, backgroundColor: COLORS.bg, borderRadius: 12, color: COLORS.textPrimary, textAlign: 'center' as const, marginRight: 8, fontSize: 15, fontWeight: '700' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' };

const sectionCaption = { color: COLORS.textMuted, fontSize: 12, fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 1.4, marginBottom: 10, marginTop: 2 };

const aiPlanTrigger = { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: COLORS.card, borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' };
const aiPlanIconWrap = { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 14 };

const blockCard = { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(251,191,36,0.22)' };
const blockCardAi = { borderColor: 'rgba(139,92,246,0.3)' };
const blockIconWrap = { width: 32, height: 32, borderRadius: 11, backgroundColor: 'rgba(251,191,36,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 10 };
const blockIconWrapAi = { backgroundColor: 'rgba(139,92,246,0.14)' };
const lastBox = { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10 };
const lastText = { color: COLORS.textMuted, fontSize: 12, lineHeight: 17 };
const fillBtn = { flexDirection: 'row' as const, alignItems: 'center' as const, alignSelf: 'flex-start' as const, marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(34,211,238,0.1)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)' };

const setRowCard = { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: COLORS.cardAlt, borderRadius: 16, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' };
const setRowCardDone = { backgroundColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.3)' };
const setIndexBadge = { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 10 };
const setIndexBadgeDone = { backgroundColor: 'rgba(52,211,153,0.2)' };
const setIndexText = { color: COLORS.textSecondary, fontWeight: '800' as const, fontSize: 12 };
const setIndexTextDone = { color: COLORS.emerald };
const prBadge = { flex: 1, fontSize: 18, textAlign: 'center' as const };

const addSetBtn = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 11, borderRadius: 14, backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)', marginTop: 4 };

const restRow = { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, marginBottom: 14 };
const restChip = { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginRight: 6, backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' };
const restChipActive = { backgroundColor: COLORS.cyan, borderColor: COLORS.cyan };
const restBar = { position: 'absolute' as const, left: 16, right: 16, bottom: 104, flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: 'rgba(18,23,40,0.97)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10 };
const restBtn = { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 6 };
const restBtnText = { color: COLORS.textPrimary, fontWeight: '800' as const, fontSize: 13 };

const historySetRow = { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8 };
const historyAction = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' };
const historyActionText = { color: COLORS.amber, fontWeight: '800' as const, fontSize: 12, marginLeft: 4 };

const pickerRow = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, borderRadius: 16, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.borderSoft };
const pickerRowSel = { backgroundColor: 'rgba(251,191,36,0.16)', borderColor: 'rgba(251,191,36,0.55)' };
const searchInput = { height: 52, paddingVertical: 12, marginTop: 8, marginBottom: 0 };
