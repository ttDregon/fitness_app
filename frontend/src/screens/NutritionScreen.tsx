import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton, GradientView } from '../components/Gradient';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { useApp } from '../context/AppContext';
import type { FoodItem, MealItem, MealLogRow } from '../types';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' },
];
const MEAL_TYPE_LABELS: Record<string, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
const mealTypeLabel = (t?: string) => (t && MEAL_TYPE_LABELS[t]) || 'Приём пищи';
// Совместимость со старыми записями без разбивки на продукты.
const asItems = (m: { items?: FoodItem[]; name: string; calories: number; protein: number; fat: number; carbs: number }): FoodItem[] =>
  m.items && m.items.length > 0 ? m.items : [{ name: m.name, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs }];

export default function NutritionScreen() {
  const {
    dailyCalorieNorm, consumedCalories, dailyMacros, consumedMacros,
    openAnimatedModal, handleTabChange, setIsMealModalVisible, isMealModalVisible,
    modalOpacityAnim, modalScaleAnim, closeAnimatedModal, setMealParse,
    calcClientMeals, isMealPreviewLoading, mealParse, confirmClientMeals,
    assignedMealsToday, selfMealsToday, toggleAssignedMealEaten, loadClientNutrition,
  } = useApp();
  // Локальный стейт ввода — чтобы набор текста не перерисовывал весь общий контекст.
  const [mealInput, setMealInput] = useState('');
  const [mealType, setMealType] = useState('breakfast');
  const [mealTypeOpen, setMealTypeOpen] = useState(false);

  // Подтягиваем меню от тренера и самозапись при открытии экрана.
  useEffect(() => { loadClientNutrition(); }, []);

  const caloriesProgress = dailyCalorieNorm > 0 ? Math.min((consumedCalories / dailyCalorieNorm) * 100, 100) : 0;
  const pProgress = dailyMacros.protein > 0 ? Math.min((consumedMacros.protein / dailyMacros.protein) * 100, 100) : 0;
  const fProgress = dailyMacros.fat > 0 ? Math.min((consumedMacros.fat / dailyMacros.fat) * 100, 100) : 0;
  const cProgress = dailyMacros.carb > 0 ? Math.min((consumedMacros.carb / dailyMacros.carb) * 100, 100) : 0;

  const closeMealModal = () => closeAnimatedModal(() => { setIsMealModalVisible(false); setMealParse(null); setMealInput(''); setMealTypeOpen(false); });

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Питание</Text></View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.metricCardFull, { alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Ionicons name="flame" size={22} color={COLORS.emerald} style={{ marginRight: 8 }} />
            <Text style={styles.metricTitle}>Съедено за сегодня</Text>
          </View>
          <Text style={styles.metricValueFull}>{consumedCalories} / {dailyCalorieNorm > 0 ? dailyCalorieNorm : '--'} ккал</Text>
          <View style={[styles.progressBarBg, { width: '100%', height: 20, marginTop: 15, borderRadius: 12 }]}>
            <GradientView colors={caloriesProgress >= 100 ? GRADIENTS.orange : GRADIENTS.emerald} style={[styles.progressBarFill, { width: `${caloriesProgress}%`, height: 20, borderRadius: 12 }]} />
          </View>
        </View>

        <View style={styles.macrosRowContainer}>
           <View style={styles.macroCard}>
              <Text style={styles.macroLabel}>Белки</Text>
              <Text style={styles.macroValueSmall}>{consumedMacros.protein}/{dailyMacros.protein}</Text>
              <View style={styles.macroProgressBg}>
                 <View style={[styles.macroProgressFill, { width: `${pProgress}%`, backgroundColor: COLORS.protein }]} />
              </View>
           </View>
           <View style={styles.macroCard}>
              <Text style={styles.macroLabel}>Жиры</Text>
              <Text style={styles.macroValueSmall}>{consumedMacros.fat}/{dailyMacros.fat}</Text>
              <View style={styles.macroProgressBg}>
                 <View style={[styles.macroProgressFill, { width: `${fProgress}%`, backgroundColor: COLORS.fat }]} />
              </View>
           </View>
           <View style={styles.macroCard}>
              <Text style={styles.macroLabel}>Углеводы</Text>
              <Text style={styles.macroValueSmall}>{consumedMacros.carb}/{dailyMacros.carb}</Text>
              <View style={styles.macroProgressBg}>
                 <View style={[styles.macroProgressFill, { width: `${cProgress}%`, backgroundColor: COLORS.carb }]} />
              </View>
           </View>
        </View>

        {assignedMealsToday.length > 0 && (
          <View style={[styles.metricCardFull, { marginTop: 20, alignItems: 'stretch' }]}>
            <Text style={styles.metricTitle}>Меню от тренера на сегодня</Text>
            {assignedMealsToday.map((m: MealItem) => (
              <TouchableOpacity key={m.id} onPress={() => toggleAssignedMealEaten(m.id)} style={{ width: '100%', paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                  <Ionicons name={m.eaten ? 'checkbox' : 'square-outline'} size={26} color={m.eaten ? COLORS.success : COLORS.textSecondary} style={{ marginRight: 12 }} />
                  <Text style={[{ flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }, m.eaten && { color: COLORS.textSecondary }]} numberOfLines={1}>{mealTypeLabel(m.meal_type)}</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginLeft: 8 }}>{m.calories} ккал</Text>
                </View>
                {asItems(m).map((it: FoodItem, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', paddingLeft: 38, paddingTop: 5 }}>
                    <Text style={[{ color: COLORS.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }, m.eaten && { textDecorationLine: 'line-through', color: COLORS.textSecondary }]}>{it.name}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, flexShrink: 0 }}>{it.calories} ккал · Б{it.protein} Ж{it.fat} У{it.carbs}</Text>
                  </View>
                ))}
              </TouchableOpacity>
            ))}
            <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 10 }}>Отмечай съеденное — тренер это видит.</Text>
          </View>
        )}

        <GradientButton colors={GRADIENTS.emerald} style={[styles.mainActionBtn, {marginTop: 20}]} onPress={() => openAnimatedModal(setIsMealModalVisible)}>
          <Ionicons name="add-circle" size={24} color="#fff" style={{marginRight: 10}} />
          <Text style={styles.mainActionText}>Добавить блюдо</Text>
        </GradientButton>

        {selfMealsToday.length > 0 && (
          <View style={[styles.metricCardFull, { marginTop: 20, alignItems: 'stretch' }]}>
            <Text style={styles.metricTitle}>Я ел сегодня</Text>
            {selfMealsToday.map((e: MealLogRow) => (
              <View key={e.id} style={{ width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                  <Ionicons name="fast-food" size={18} color={COLORS.emerald} style={{ marginRight: 8 }} />
                  <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{mealTypeLabel(e.meal_type)}</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginLeft: 8 }}>{e.calories} ккал</Text>
                </View>
                {asItems(e).map((it: FoodItem, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', paddingLeft: 26, paddingTop: 3 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }}>{it.name}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, flexShrink: 0 }}>{it.calories} ккал</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {isMealModalVisible && (
        <Modal transparent animationType="none" onRequestClose={closeMealModal}>
          <Animated.View style={[styles.modalOverlayFull, { opacity: modalOpacityAnim }]}>
             <Animated.View style={[styles.modalContentFull, { transform: [{ scale: modalScaleAnim }] }]}>
                <View style={styles.modalHeaderFull}>
                   <Text style={styles.modalTitleFull}>Что я ел</Text>
                   <TouchableOpacity onPress={closeMealModal}>
                      <Ionicons name="close-circle" size={36} color={COLORS.textSecondary} />
                   </TouchableOpacity>
                </View>

                <ScrollView style={{width: '100%', marginTop: 10}} showsVerticalScrollIndicator={false}>
                   <Text style={styles.label}>Приём пищи:</Text>
                   <TouchableOpacity style={styles.pickerButton} onPress={() => setMealTypeOpen(o => !o)}>
                     <Ionicons name="restaurant" size={20} color={COLORS.emerald} />
                     <Text style={[styles.pickerButtonText, { flex: 1 }]}>{mealTypeLabel(mealType)}</Text>
                     <Ionicons name={mealTypeOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.emerald} />
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

                   <Text style={[styles.label, { marginTop: 10 }]}>Что я ел (можно сразу несколько: «на завтрак овсянка, на обед борщ»):</Text>
                   <TextInput style={styles.inputArea} placeholder="200г творога и кофе..." placeholderTextColor={COLORS.textSecondary} value={mealInput} onChangeText={setMealInput} multiline />

                   <GradientButton colors={GRADIENTS.emerald} style={[styles.button, {marginBottom: 18}]} onPress={() => calcClientMeals(mealInput, mealType)} disabled={isMealPreviewLoading}>
                      {isMealPreviewLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Рассчитать КБЖУ</Text>}
                   </GradientButton>

                   {mealParse && mealParse.length > 0 && (
                      <View style={styles.previewContainer}>
                         {mealParse.map((meal: MealItem) => (
                           <View key={meal.id} style={{ marginBottom: 14 }}>
                             <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                               <Text style={styles.previewTitle}>{mealTypeLabel(meal.meal_type)}</Text>
                               <Text style={styles.previewCals}>{meal.calories} ккал</Text>
                             </View>
                             {(meal.items || []).map((it: FoodItem, i: number) => (
                               <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                                 <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }}>{it.name}</Text>
                                 <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{it.calories} ккал · Б{it.protein} Ж{it.fat} У{it.carbs}</Text>
                               </View>
                             ))}
                           </View>
                         ))}
                         <GradientButton colors={GRADIENTS.emerald} style={[styles.button, {marginTop: 10}]} onPress={() => { confirmClientMeals(); setMealInput(''); }}>
                            <Text style={styles.buttonText}>Добавить</Text>
                         </GradientButton>
                      </View>
                   )}
                </ScrollView>
             </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </View>
  );
}
