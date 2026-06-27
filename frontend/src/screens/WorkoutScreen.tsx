import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../components/Gradient';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { groupWorkoutData } from '../utils/workout';
import { useApp } from '../context/AppContext';
import { EXERCISES, EXERCISE_GROUPS } from '../data/exercises';
import type { ExerciseDef } from '../data/exercises';
import type { WorkoutRecord, GroupedWorkout, WorkoutData } from '../types';

interface BSet { id: string; reps: string; weight: string }
interface BBlock { id: string; exercise: string; sets: BSet[] }

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const newSet = (): BSet => ({ id: uid('s'), reps: '', weight: '' });
const newBlock = (name: string): BBlock => ({ id: uid('b'), exercise: name, sets: [newSet()] });

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function WorkoutScreen() {
  const { handleTabChange, sendToAI, isLoading, history, addStructuredWorkout } = useApp();
  const [note, setNote] = useState('');

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
    const n = customName.trim();
    if (!n) return;
    setSelected(prev => (prev.includes(n) ? prev : [...prev, n]));
    setCustomName('');
  };
  const openPicker = () => { setSelected([]); setSearch(''); setCustomName(''); setPickerVisible(true); };
  const commitSelection = () => {
    setBlocks(prev => {
      const existing = new Set(prev.map(b => b.exercise));
      const additions = selected.filter(n => !existing.has(n)).map(newBlock);
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

  // Подход считается заполненным, если есть вес ИЛИ повторы (вес 0 — это норм для упражнений с весом тела).
  const isFilled = (s: BSet) => (Number(s.weight) || 0) > 0 || (Number(s.reps) || 0) > 0;
  const filledCount = blocks.reduce((n, b) => n + b.sets.filter(isFilled).length, 0);

  const saveBlocks = async () => {
    const items = blocks
      .flatMap(b => b.sets.filter(isFilled).map(s => ({ exercise: b.exercise, weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })));
    if (items.length === 0) { Alert.alert('Пусто', 'Заполни вес или повторы хотя бы в одном подходе.'); return; }
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
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Личный Журнал</Text></View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>

      {/* Быстрая запись через ИИ */}
      <View style={styles.inputSection}>
        <TextInput style={styles.inputArea} multiline placeholder="Жим 100кг 5 по 5..." placeholderTextColor={COLORS.textSecondary} value={note} onChangeText={setNote} />
        <GradientButton colors={GRADIENTS.amber} style={styles.button} onPress={async () => { const ok = await sendToAI(note); if (ok) setNote(''); }} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить с помощью ИИ</Text>}</GradientButton>
      </View>

      {/* Конструктор: блоки упражнений */}
      {blocks.map(block => (
        <View key={block.id} style={blockCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons name="barbell" size={20} color={COLORS.amber} style={{ marginRight: 8 }} />
            <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' }} numberOfLines={2}>{block.exercise}</Text>
            <TouchableOpacity onPress={() => removeBlock(block.id)} style={{ padding: 4 }}><Ionicons name="trash-outline" size={20} color={COLORS.error} /></TouchableOpacity>
          </View>

          {block.sets.map((s, i) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ width: 86, color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' }}>Подход {i + 1}</Text>
              <TextInput style={miniInput} keyboardType="numeric" placeholder="повт" placeholderTextColor={COLORS.textMuted} value={s.reps} onChangeText={v => updateSet(block.id, s.id, 'reps', v)} />
              <TextInput style={miniInput} keyboardType="numeric" placeholder="кг" placeholderTextColor={COLORS.textMuted} value={s.weight} onChangeText={v => updateSet(block.id, s.id, 'weight', v)} />
              <TouchableOpacity onPress={() => removeSet(block.id, s.id)} style={{ paddingLeft: 8 }}><Ionicons name="close-circle" size={24} color={COLORS.textMuted} /></TouchableOpacity>
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

      {/* Сохранить в «сегодня» */}
      {blocks.length > 0 && (
        <GradientButton colors={GRADIENTS.emerald} style={[styles.button, { marginBottom: 24 }]} onPress={saveBlocks} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Добавить ({filledCount})</Text>}
        </GradientButton>
      )}

      {/* История по дням */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 14 }}>
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
              <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
              {group.sets.map((item: WorkoutData, index: number) => (
                <View key={index} style={[styles.setRow, { paddingLeft: 10 }]}><Text style={styles.exerciseSetText}>Подход {index + 1}</Text><Text style={styles.setDetails}>{item.weight}кг × {item.reps}</Text></View>
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
    </ScrollView>
  );
}

const miniInput = { width: 64, height: 44, backgroundColor: COLORS.cardAlt, borderRadius: 12, color: COLORS.textPrimary, textAlign: 'center' as const, marginLeft: 8, fontSize: 15, fontWeight: '700' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' };
const blockCard = { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(251,191,36,0.22)' };
const addSetBtn = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 11, borderRadius: 14, backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)', marginTop: 4 };
