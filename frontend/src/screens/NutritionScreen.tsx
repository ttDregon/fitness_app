import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';
import type { FoodItem, MealItem, MealLogRow } from '../types';

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

  // Подтягиваем меню от тренера и самозапись при открытии экрана.
  useEffect(() => { loadClientNutrition(); }, []);

  const caloriesProgress = dailyCalorieNorm > 0 ? Math.min((consumedCalories / dailyCalorieNorm) * 100, 100) : 0;
  const pProgress = dailyMacros.protein > 0 ? Math.min((consumedMacros.protein / dailyMacros.protein) * 100, 100) : 0;
  const fProgress = dailyMacros.fat > 0 ? Math.min((consumedMacros.fat / dailyMacros.fat) * 100, 100) : 0;
  const cProgress = dailyMacros.carb > 0 ? Math.min((consumedMacros.carb / dailyMacros.carb) * 100, 100) : 0;

  const closeMealModal = () => closeAnimatedModal(() => { setIsMealModalVisible(false); setMealParse(null); setMealInput(''); });

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Питание</Text></View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View style={styles.metricCardFull}>
          <Text style={styles.metricTitle}>Съедено за сегодня</Text>
          <Text style={styles.metricValueFull}>{consumedCalories} / {dailyCalorieNorm > 0 ? dailyCalorieNorm : '--'} ккал</Text>
          <View style={[styles.progressBarBg, { width: '100%', height: 20, marginTop: 15, borderRadius: 12 }]}>
            <View style={[styles.progressBarFill, { width: `${caloriesProgress}%`, backgroundColor: caloriesProgress >= 100 ? COLORS.error : COLORS.tabBar, borderRadius: 12 }]} />
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
          <View style={[styles.metricCardFull, { marginTop: 20 }]}>
            <Text style={styles.metricTitle}>Меню от тренера на сегодня</Text>
            {assignedMealsToday.map((m: MealItem) => (
              <TouchableOpacity key={m.id} onPress={() => toggleAssignedMealEaten(m.id)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name={m.eaten ? 'checkbox' : 'square-outline'} size={26} color={m.eaten ? COLORS.success : COLORS.textSecondary} style={{ marginRight: 12 }} />
                  <Text style={[{ flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }, m.eaten && { color: COLORS.textSecondary }]}>{mealTypeLabel(m.meal_type)}</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{m.calories} ккал</Text>
                </View>
                {asItems(m).map((it: FoodItem, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 38, paddingTop: 5 }}>
                    <Text style={[{ color: COLORS.textPrimary, fontSize: 13, flex: 1, marginRight: 8 }, m.eaten && { textDecorationLine: 'line-through', color: COLORS.textSecondary }]}>{it.name}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{it.calories} ккал · Б{it.protein} Ж{it.fat} У{it.carbs}</Text>
                  </View>
                ))}
              </TouchableOpacity>
            ))}
            <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 10 }}>Отмечай съеденное — тренер это видит.</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.mainActionBtn, {marginTop: 20}]} onPress={() => openAnimatedModal(setIsMealModalVisible)}>
          <Ionicons name="add-circle" size={24} color="#fff" style={{marginRight: 10}} />
          <Text style={styles.mainActionText}>Добавить блюдо</Text>
        </TouchableOpacity>

        {selfMealsToday.length > 0 && (
          <View style={[styles.metricCardFull, { marginTop: 20 }]}>
            <Text style={styles.metricTitle}>Я ел сегодня</Text>
            {selfMealsToday.map((e: MealLogRow) => (
              <View key={e.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
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
                   <Text style={styles.label}>Можно сразу несколько приёмов: «на завтрак овсянка и кофе, на обед борщ»</Text>
                   <TextInput style={styles.inputArea} placeholder="на завтрак 200г творога, на обед суп и хлеб..." placeholderTextColor={COLORS.textSecondary} value={mealInput} onChangeText={setMealInput} multiline />

                   <TouchableOpacity style={[styles.button, {marginBottom: 18}]} onPress={() => calcClientMeals(mealInput)} disabled={isMealPreviewLoading}>
                      {isMealPreviewLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Рассчитать КБЖУ</Text>}
                   </TouchableOpacity>

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
                         <TouchableOpacity style={[styles.button, {marginTop: 10}]} onPress={() => { confirmClientMeals(); setMealInput(''); }}>
                            <Text style={styles.buttonText}>Добавить</Text>
                         </TouchableOpacity>
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
