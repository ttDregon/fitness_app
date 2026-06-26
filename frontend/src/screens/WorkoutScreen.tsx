import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { groupWorkoutData } from '../utils/workout';
import { useApp } from '../context/AppContext';
import type { WorkoutRecord, GroupedWorkout, WorkoutData } from '../types';

export default function WorkoutScreen() {
  const { handleTabChange, sendToAI, isLoading, history } = useApp();
  // Локальный стейт ввода — чтобы набор текста не перерисовывал весь общий контекст.
  const [note, setNote] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Личный Журнал</Text></View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>
      <View style={styles.inputSection}>
        <TextInput style={styles.inputArea} multiline placeholder="Жим 100кг 5 по 5..." placeholderTextColor={COLORS.textSecondary} value={note} onChangeText={setNote} />
        <TouchableOpacity style={styles.button} onPress={async () => { const ok = await sendToAI(note); if (ok) setNote(''); }} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить с помощью ИИ</Text>}</TouchableOpacity>
      </View>
      <Text style={styles.historyTitle}>Последние записи</Text>
      {history.map((workout: WorkoutRecord) => {
        const groupedData = groupWorkoutData(workout.parsed_data || []);
        return (
          <View key={workout.id} style={styles.historyCard}>
            <Text style={styles.dateText}>{new Date(workout.created_at).toLocaleString('ru-RU')}</Text>
            {groupedData.map((group: GroupedWorkout, gIdx: number) => (
              <View key={gIdx} style={{marginTop: 15}}>
                <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
                {group.sets.map((item: WorkoutData, index: number) => (
                  <View key={index} style={[styles.setRow, {paddingLeft: 10}]}><Text style={styles.exerciseSetText}>Подход {index + 1}</Text><Text style={styles.setDetails}>{item.weight}кг × {item.reps}</Text></View>
                ))}
              </View>
            ))}
          </View>
        );
      })}
      <View style={{height: 60}}/>
    </ScrollView>
  );
}
