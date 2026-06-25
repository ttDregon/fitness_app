import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';

export default function NutritionScreen() {
  const {
    dailyCalorieNorm, consumedCalories, dailyMacros, consumedMacros,
    openAnimatedModal, setIsSideMenuVisible, setIsMealModalVisible, isMealModalVisible,
    modalOpacityAnim, modalScaleAnim, closeAnimatedModal, setMealPreview, setMealInput,
    mealInput, handleCalculateMealPreview, isMealPreviewLoading, mealPreview, confirmAddMeal,
  } = useApp();

  const caloriesProgress = dailyCalorieNorm > 0 ? Math.min((consumedCalories / dailyCalorieNorm) * 100, 100) : 0;
  const pProgress = dailyMacros.protein > 0 ? Math.min((consumedMacros.protein / dailyMacros.protein) * 100, 100) : 0;
  const fProgress = dailyMacros.fat > 0 ? Math.min((consumedMacros.fat / dailyMacros.fat) * 100, 100) : 0;
  const cProgress = dailyMacros.carb > 0 ? Math.min((consumedMacros.carb / dailyMacros.carb) * 100, 100) : 0;

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Питание</Text></View>
        <TouchableOpacity onPress={() => openAnimatedModal(setIsSideMenuVisible)} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
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

        <TouchableOpacity style={[styles.mainActionBtn, {marginTop: 20}]} onPress={() => openAnimatedModal(setIsMealModalVisible)}>
          <Ionicons name="add-circle" size={24} color="#fff" style={{marginRight: 10}} />
          <Text style={styles.mainActionText}>Добавить блюдо</Text>
        </TouchableOpacity>
      </ScrollView>

      {isMealModalVisible && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(() => { setIsMealModalVisible(false); setMealPreview(null); setMealInput(''); })}>
          <Animated.View style={[styles.modalOverlayFull, { opacity: modalOpacityAnim }]}>
             <Animated.View style={[styles.modalContentFull, { transform: [{ scale: modalScaleAnim }] }]}>
                <View style={styles.modalHeaderFull}>
                   <Text style={styles.modalTitleFull}>Запись блюда</Text>
                   <TouchableOpacity onPress={() => closeAnimatedModal(() => { setIsMealModalVisible(false); setMealPreview(null); setMealInput(''); })}>
                      <Ionicons name="close-circle" size={36} color={COLORS.textSecondary} />
                   </TouchableOpacity>
                </View>

                <ScrollView style={{width: '100%', marginTop: 10}} showsVerticalScrollIndicator={false}>
                   <Text style={styles.label}>Что вы съели?</Text>
                   <TextInput style={styles.inputArea} placeholder="Например: 200г вареной курицы и гречка" placeholderTextColor={COLORS.textSecondary} value={mealInput} onChangeText={setMealInput} multiline />

                   <TouchableOpacity style={[styles.button, {marginBottom: 25}]} onPress={handleCalculateMealPreview} disabled={isMealPreviewLoading}>
                      {isMealPreviewLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Рассчитать КБЖУ</Text>}
                   </TouchableOpacity>

                   {mealPreview && (
                      <View style={styles.previewContainer}>
                         <Text style={styles.previewTitle}>{mealPreview.name}</Text>
                         <Text style={styles.previewCals}>{mealPreview.calories} ккал</Text>

                         <View style={styles.previewMacrosRow}>
                            <View style={styles.previewMacro}><Text style={{color: COLORS.protein, fontWeight:'bold', marginBottom: 4}}>Белки</Text><Text style={{color: COLORS.textPrimary}}>{mealPreview.protein} г</Text></View>
                            <View style={styles.previewMacro}><Text style={{color: COLORS.fat, fontWeight:'bold', marginBottom: 4}}>Жиры</Text><Text style={{color: COLORS.textPrimary}}>{mealPreview.fat} г</Text></View>
                            <View style={styles.previewMacro}><Text style={{color: COLORS.carb, fontWeight:'bold', marginBottom: 4}}>Углеводы</Text><Text style={{color: COLORS.textPrimary}}>{mealPreview.carbs} г</Text></View>
                         </View>

                         <TouchableOpacity style={[styles.button, {marginTop: 25}]} onPress={confirmAddMeal}>
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
