import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { groupWorkoutData } from '../utils/workout';
import { getCurrentDateString } from '../utils/date';
import { useApp } from '../context/AppContext';
import type { AssignedWorkout, WorkoutData, GroupMember, GroupedWorkout, Group } from '../types';

export default function ClubScreen() {
  const {
    activeGroup, session, todayWorkouts, setGroupMembers, setTodayWorkouts, smoothStateUpdate, setActiveGroup,
    userRole, groupMembers, fetchGroupDetails, openAnimatedModal, setSelectedMember, selectedMember,
    setIsMyWorkoutVisible, isMyWorkoutVisible, assignNote, setAssignNote, assignWorkoutToMember, isLoading,
    assignWorkoutDate, setAssignWorkoutDate, assignDateObj, setAssignDateObj, assignDatePickerVisible, setAssignDatePickerVisible, onAssignDateChange,
    myPlanViewDate, setMyPlanViewDate, myDayPlan, setMyDayPlan, shiftMyPlanDate, memberDayPlan, clientProfile,
    toggleExerciseStatus, deleteOrLeaveGroup, groups, setIsCreatingGroup, handleTabChange, setIsJoiningGroup,
    isCreatingGroup, newGroupName, setNewGroupName, createGroup, isJoiningGroup, joinCode, setJoinCode, joinGroup,
    modalOpacityAnim, modalScaleAnim, closeAnimatedModal,
  } = useApp();

  const calculateProgress = (memberId: string) => {
    const w = todayWorkouts.find((plan: AssignedWorkout) => plan.client_id === memberId);
    if (!w || !Array.isArray(w.workout_data) || w.workout_data.length === 0) return 0;
    const completed = w.workout_data.filter((ex: WorkoutData) => ex.completed).length;
    return (completed / w.workout_data.length) * 100;
  };

  if (activeGroup) {
    const isOwner = session?.user && activeGroup.owner_id === session.user.id;
    const myPlan = todayWorkouts.find((w: AssignedWorkout) => session?.user && w.client_id === session.user.id);

    return (
      <View style={styles.groupDetailContainer}>
        <View style={styles.groupHeader}>
          <TouchableOpacity onPress={() => { smoothStateUpdate(() => { setActiveGroup(null); setGroupMembers([]); setTodayWorkouts([]); }); }}><Ionicons name="arrow-back" size={32} color={COLORS.textPrimary} /></TouchableOpacity>
          <Text style={styles.groupHeaderTitle} numberOfLines={1}>{activeGroup.name}</Text>
          <TouchableOpacity onPress={() => {Alert.alert(isOwner ? "Настройки" : "Клуб", `Код доступа: ${activeGroup.code}`, [{ text: isOwner ? "Удалить клуб" : "Выйти из клуба", style: "destructive", onPress: () => deleteOrLeaveGroup(activeGroup) }, { text: "Закрыть", style: "cancel" }]);}}><Ionicons name="settings-sharp" size={28} color={COLORS.textPrimary} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} showsVerticalScrollIndicator={false}>
          {userRole === 'trainer' && (
            <View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <Text style={styles.historyTitle}>Участники ({groupMembers.length})</Text>
                <TouchableOpacity onPress={fetchGroupDetails}><Ionicons name="refresh" size={28} color={COLORS.tabBar} /></TouchableOpacity>
              </View>
              {groupMembers.map((member: GroupMember) => {
                if (session?.user && member.id === session.user.id) return null;
                const progress = calculateProgress(member.id);
                return (
                  <TouchableOpacity key={member.id} style={styles.memberCard} onPress={() => { setAssignWorkoutDate(getCurrentDateString()); setAssignDateObj(new Date()); openAnimatedModal(() => setSelectedMember(member)); }}>
                    <View style={{flex: 1}}>
                      <Text style={styles.memberName}>{member.name || member.email}</Text>
                      <Text style={styles.memberRole}>Прогресс: {Math.round(progress)}%</Text>
                    </View>
                    <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: progress === 100 ? COLORS.success : COLORS.tabBar }]} /></View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {userRole === 'client' && (
            <View style={{marginTop: 10}}>
              <TouchableOpacity style={styles.mainActionBtn} onPress={() => { setMyPlanViewDate(getCurrentDateString()); setMyDayPlan(null); openAnimatedModal(setIsMyWorkoutVisible); }}>
                <Ionicons name="fitness-outline" size={24} color="#fff" style={{marginRight: 10}} />
                <Text style={styles.mainActionText}>Моя тренировка</Text>
              </TouchableOpacity>
              <Text style={styles.placeholderText}>Код клуба: {activeGroup.code}</Text>
            </View>
          )}
        </ScrollView>

        {selectedMember && (
          <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(() => setSelectedMember(null))}>
            <Animated.View style={[styles.modalOverlayFull, { opacity: modalOpacityAnim }]}>
              <Animated.View style={[styles.modalContentFull, { transform: [{ scale: modalScaleAnim }] }]}>
                <View style={styles.modalHeaderFull}>
                  <Text style={styles.modalTitleFull}>План: {selectedMember?.name || selectedMember?.email?.split('@')[0]}</Text>
                  <TouchableOpacity onPress={() => closeAnimatedModal(() => setSelectedMember(null))}>
                    <Ionicons name="close-circle" size={36} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{width: '100%', marginTop: 10}} showsVerticalScrollIndicator={false}>
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
                      <View style={{ backgroundColor: COLORS.bg, borderRadius: 18, padding: 18, marginBottom: 22 }}>
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
                  <Text style={styles.label}>Новая тренировка (ИИ):</Text>
                  <TextInput style={styles.inputArea} multiline placeholder="Присед 100кг 3 по 10..." placeholderTextColor={COLORS.textSecondary} value={assignNote} onChangeText={setAssignNote} />
                  <TouchableOpacity style={styles.pickerButton} onPress={() => setAssignDatePickerVisible(true)}>
                    <Ionicons name="calendar-outline" size={20} color={COLORS.tabBar} />
                    <Text style={styles.pickerButtonText}>Дата: {assignWorkoutDate}</Text>
                  </TouchableOpacity>
                  {assignDatePickerVisible && (
                    <DateTimePicker value={assignDateObj} mode="date" display="default" onChange={onAssignDateChange} />
                  )}
                  <TouchableOpacity style={[styles.button, {marginBottom: 30}]} onPress={assignWorkoutToMember} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Добавить/Назначить</Text>}</TouchableOpacity>
                  <Text style={styles.historyTitle}>Выполнение на {assignWorkoutDate}:</Text>
                  {(() => {
                    const plan = memberDayPlan;
                    if (!plan || !Array.isArray(plan.workout_data) || !plan.workout_data.length) return <Text style={styles.placeholderText}>План не назначен</Text>;
                    const groupedData = groupWorkoutData(plan.workout_data);
                    return groupedData.map((group: GroupedWorkout, gIdx: number) => (
                      <View key={gIdx} style={{marginBottom: 20, backgroundColor: COLORS.bg, padding: 15, borderRadius: 16}}>
                        <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
                        {group.sets.map((ex: WorkoutData, idx: number) => (
                          <View key={idx} style={[styles.setRow, {paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)', paddingLeft: 5}]}>
                            <Text style={[styles.exerciseSetText, ex.completed && {textDecorationLine: 'line-through', color: COLORS.textSecondary}]}>Подход {idx + 1}: {ex.weight}кг x {ex.reps}</Text>
                            <Ionicons name={ex.completed ? "checkmark-circle" : "ellipse-outline"} size={28} color={ex.completed ? COLORS.success : COLORS.textSecondary} />
                          </View>
                        ))}
                      </View>
                    ));
                  })()}
                </ScrollView>
              </Animated.View>
            </Animated.View>
          </Modal>
        )}

        {isMyWorkoutVisible && (
          <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsMyWorkoutVisible)}>
            <Animated.View style={[styles.modalOverlayFull, { opacity: modalOpacityAnim }]}>
              <Animated.View style={[styles.modalContentFull, { transform: [{ scale: modalScaleAnim }] }]}>
                <View style={styles.modalHeaderFull}>
                  <Text style={styles.modalTitleFull}>Мой план</Text>
                  <TouchableOpacity onPress={() => closeAnimatedModal(setIsMyWorkoutVisible)}>
                    <Ionicons name="close-circle" size={36} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
                  <TouchableOpacity onPress={() => shiftMyPlanDate(-1)} style={{padding: 8}}><Ionicons name="chevron-back" size={26} color={COLORS.tabBar} /></TouchableOpacity>
                  <Text style={{color: COLORS.textPrimary, fontSize: 17, fontWeight: '800'}}>
                    {myPlanViewDate === getCurrentDateString() ? 'Сегодня' : new Date(myPlanViewDate + 'T12:00:00').toLocaleDateString('ru-RU', {weekday: 'short', day: 'numeric', month: 'short'})}
                  </Text>
                  <TouchableOpacity onPress={() => shiftMyPlanDate(1)} style={{padding: 8}}><Ionicons name="chevron-forward" size={26} color={COLORS.tabBar} /></TouchableOpacity>
                </View>
                <ScrollView style={{width: '100%', marginTop: 6}} showsVerticalScrollIndicator={false}>
                  {(() => {
                    const isViewingToday = myPlanViewDate === getCurrentDateString();
                    const planToShow = isViewingToday ? myPlan : myDayPlan;
                    if (!planToShow || !Array.isArray(planToShow.workout_data) || !planToShow.workout_data.length) {
                      return (
                        <View style={{alignItems: 'center', marginTop: 50}}>
                          <Ionicons name="cafe-outline" size={90} color={COLORS.tabBar} style={{opacity: 0.8}} />
                          <Text style={styles.emptyText}>{isViewingToday ? 'Тренер еще не назначил план. Отдыхаем!' : 'На этот день плана нет'}</Text>
                        </View>
                      );
                    }
                    return groupWorkoutData(planToShow.workout_data).map((group: GroupedWorkout, gIdx: number) => (
                      <View key={gIdx} style={{marginBottom: 25}}>
                        <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
                        {group.sets.map((ex: WorkoutData, idx: number) => (
                          isViewingToday ? (
                            <TouchableOpacity key={ex.id} style={styles.clientExerciseCard} onPress={() => toggleExerciseStatus(planToShow.id, ex.id, ex.completed || false)}>
                              <View style={{flex: 1}}>
                                <Text style={[styles.exerciseSetText, ex.completed && {textDecorationLine: 'line-through', color: COLORS.textSecondary}]}>Подход {idx + 1}</Text>
                                <Text style={styles.setDetails}>{ex.weight}кг × {ex.reps}</Text>
                              </View>
                              <Ionicons name={ex.completed ? "checkbox" : "square-outline"} size={36} color={ex.completed ? COLORS.success : COLORS.textSecondary} />
                            </TouchableOpacity>
                          ) : (
                            <View key={ex.id} style={styles.clientExerciseCard}>
                              <View style={{flex: 1}}>
                                <Text style={[styles.exerciseSetText, ex.completed && {textDecorationLine: 'line-through', color: COLORS.textSecondary}]}>Подход {idx + 1}</Text>
                                <Text style={styles.setDetails}>{ex.weight}кг × {ex.reps}</Text>
                              </View>
                              <Ionicons name={ex.completed ? "checkbox" : "square-outline"} size={36} color={ex.completed ? COLORS.success : COLORS.textSecondary} />
                            </View>
                          )
                        ))}
                      </View>
                    ));
                  })()}
                </ScrollView>
              </Animated.View>
            </Animated.View>
          </Modal>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mainContent}>
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Клубы</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {userRole === 'trainer' && (<TouchableOpacity onPress={() => openAnimatedModal(setIsCreatingGroup)} style={{ marginRight: 15 }}><Ionicons name="add-circle" size={40} color={COLORS.tabBar} /></TouchableOpacity>)}
          <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
        </View>
      </View>
      {groups.length === 0 ? (
        <View style={styles.emptyGroupsContainer}>
          <Ionicons name="people-circle-outline" size={120} color={COLORS.tabBar} style={{opacity: 0.8, marginBottom: 10}} />
          <Text style={styles.emptyText}>Вы еще не состоите в клубах</Text>
          <View style={styles.actionButtonsRow}>
            {userRole === 'trainer' && (<TouchableOpacity style={styles.centerActionBtn} onPress={() => openAnimatedModal(setIsCreatingGroup)}><Text style={styles.buttonText}>Создать клуб</Text></TouchableOpacity>)}
            <TouchableOpacity style={[styles.centerActionBtn, {backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginTop: 15}]} onPress={() => openAnimatedModal(setIsJoiningGroup)}><Text style={[styles.buttonText, {color: COLORS.textPrimary}]}>Вступить по коду</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.groupsGrid} showsVerticalScrollIndicator={false}>
          {groups.map((group: Group) => (
            <TouchableOpacity key={group.id} style={styles.groupSquare} onPress={() => { smoothStateUpdate(() => setActiveGroup(group)); }}>
              <Ionicons name="people" size={46} color={COLORS.tabBar} />
              <Text style={styles.groupSquareText} numberOfLines={1}>{group.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.groupSquare, {backgroundColor: 'rgba(255,255,255,0.03)', borderStyle: 'dashed', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)'}]} onPress={() => openAnimatedModal(setIsJoiningGroup)}>
            <Ionicons name="enter-outline" size={46} color={COLORS.textSecondary} />
            <Text style={[styles.groupSquareText, {color: COLORS.textSecondary}]}>Вступить</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {isCreatingGroup && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsCreatingGroup)}>
          <Animated.View style={[styles.modalOverlay, { opacity: modalOpacityAnim }]}>
            <Animated.View style={[styles.modalContent, { transform: [{ scale: modalScaleAnim }] }]}>
              <Text style={styles.modalTitle}>Название клуба</Text>
              <TextInput style={styles.input} value={newGroupName} onChangeText={setNewGroupName} placeholder="Напр: Power Gym" placeholderTextColor={COLORS.textSecondary}/>
              <TouchableOpacity style={styles.button} onPress={createGroup}><Text style={styles.buttonText}>Создать</Text></TouchableOpacity>
              <TouchableOpacity style={{marginTop: 20}} onPress={() => closeAnimatedModal(setIsCreatingGroup)}><Text style={styles.backButtonText}>Отмена</Text></TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}

      {isJoiningGroup && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsJoiningGroup)}>
          <Animated.View style={[styles.modalOverlay, { opacity: modalOpacityAnim }]}>
            <Animated.View style={[styles.modalContent, { transform: [{ scale: modalScaleAnim }] }]}>
              <Text style={styles.modalTitle}>Код доступа</Text>
              <TextInput style={styles.input} value={joinCode} onChangeText={setJoinCode} keyboardType="numeric" maxLength={6} placeholder="6 цифр" placeholderTextColor={COLORS.textSecondary}/>
              <TouchableOpacity style={[styles.button, {backgroundColor: COLORS.tabBar}]} onPress={joinGroup}><Text style={styles.buttonText}>Подключиться</Text></TouchableOpacity>
              <TouchableOpacity style={{marginTop: 20}} onPress={() => closeAnimatedModal(setIsJoiningGroup)}><Text style={styles.backButtonText}>Отмена</Text></TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </View>
  );
}
