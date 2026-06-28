import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../components/Gradient';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { groupWorkoutData } from '../utils/workout';
import { getCurrentDateString } from '../utils/date';
import { useApp } from '../context/AppContext';
import ClientPlanModal from './ClientPlanModal';
import type { AssignedWorkout, WorkoutData, GroupMember, GroupedWorkout, Group } from '../types';

export default function ClubScreen() {
  const {
    activeGroup, session, todayWorkouts, setGroupMembers, setTodayWorkouts, smoothStateUpdate, setActiveGroup,
    userRole, groupMembers, fetchGroupDetails, openAnimatedModal, setSelectedMember,
    setIsMyWorkoutVisible, isMyWorkoutVisible, setAssignWorkoutDate, setAssignDateObj,
    myPlanViewDate, setMyPlanViewDate, myDayPlan, setMyDayPlan, shiftMyPlanDate,
    toggleExerciseStatus, deleteOrLeaveGroup, groups, setIsCreatingGroup, handleTabChange, setIsJoiningGroup,
    isCreatingGroup, newGroupName, setNewGroupName, createGroup, isJoiningGroup, joinCode, setJoinCode, joinGroup,
    modalOpacityAnim, modalScaleAnim, closeAnimatedModal, requireTrainerSub,
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
                <TouchableOpacity onPress={fetchGroupDetails}><Ionicons name="refresh" size={28} color={COLORS.rose} /></TouchableOpacity>
              </View>
              {groupMembers.map((member: GroupMember) => {
                if (session?.user && member.id === session.user.id) return null;
                const progress = calculateProgress(member.id);
                return (
                  <TouchableOpacity key={member.id} style={styles.memberCard} onPress={() => { if (!requireTrainerSub()) return; setAssignWorkoutDate(getCurrentDateString()); setAssignDateObj(new Date()); openAnimatedModal(() => setSelectedMember(member)); }}>
                    <View style={{flex: 1}}>
                      <Text style={styles.memberName}>{member.name || member.email}</Text>
                      <Text style={styles.memberRole}>Прогресс: {Math.round(progress)}%</Text>
                    </View>
                    <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: progress === 100 ? COLORS.success : COLORS.rose }]} /></View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {userRole === 'client' && (
            <View style={{marginTop: 10}}>
              <GradientButton colors={GRADIENTS.rose} style={styles.mainActionBtn} onPress={() => { setMyPlanViewDate(getCurrentDateString()); setMyDayPlan(null); openAnimatedModal(setIsMyWorkoutVisible); }}>
                <Ionicons name="fitness" size={24} color="#fff" style={{marginRight: 10}} />
                <Text style={styles.mainActionText}>Моя тренировка</Text>
              </GradientButton>
            </View>
          )}
        </ScrollView>

        <ClientPlanModal />

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
                  <TouchableOpacity onPress={() => shiftMyPlanDate(-1)} style={{padding: 8}}><Ionicons name="chevron-back" size={26} color={COLORS.rose} /></TouchableOpacity>
                  <Text style={{color: COLORS.textPrimary, fontSize: 17, fontWeight: '800'}}>
                    {myPlanViewDate === getCurrentDateString() ? 'Сегодня' : new Date(myPlanViewDate + 'T12:00:00').toLocaleDateString('ru-RU', {weekday: 'short', day: 'numeric', month: 'short'})}
                  </Text>
                  <TouchableOpacity onPress={() => shiftMyPlanDate(1)} style={{padding: 8}}><Ionicons name="chevron-forward" size={26} color={COLORS.rose} /></TouchableOpacity>
                </View>
                <ScrollView style={{width: '100%', marginTop: 6}} showsVerticalScrollIndicator={false}>
                  {(() => {
                    const isViewingToday = myPlanViewDate === getCurrentDateString();
                    const planToShow = isViewingToday ? myPlan : myDayPlan;
                    if (!planToShow || !Array.isArray(planToShow.workout_data) || !planToShow.workout_data.length) {
                      return (
                        <View style={{alignItems: 'center', marginTop: 50}}>
                          <Ionicons name="cafe-outline" size={90} color={COLORS.rose} style={{opacity: 0.8}} />
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
          {userRole === 'trainer' && (<TouchableOpacity onPress={() => { if (!requireTrainerSub()) return; openAnimatedModal(setIsCreatingGroup); }} style={{ marginRight: 14 }}><Ionicons name="add-circle" size={38} color={COLORS.rose} /></TouchableOpacity>)}
          <TouchableOpacity onPress={() => openAnimatedModal(setIsJoiningGroup)} style={{ marginRight: 14 }}><Ionicons name="enter-outline" size={34} color={COLORS.rose} /></TouchableOpacity>
          <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
        </View>
      </View>
      {groups.length === 0 ? (
        <View style={styles.emptyGroupsContainer}>
          <Ionicons name="people-circle" size={120} color={COLORS.rose} style={{opacity: 0.85, marginBottom: 10}} />
          <Text style={styles.emptyText}>Вы еще не состоите в клубах</Text>
          <View style={styles.actionButtonsRow}>
            {userRole === 'trainer' && (<GradientButton colors={GRADIENTS.rose} style={styles.centerActionBtn} onPress={() => { if (!requireTrainerSub()) return; openAnimatedModal(setIsCreatingGroup); }}><Text style={styles.buttonText}>Создать клуб</Text></GradientButton>)}
            <TouchableOpacity style={[styles.centerActionBtn, {backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginTop: 15}]} onPress={() => openAnimatedModal(setIsJoiningGroup)}><Text style={[styles.buttonText, {color: COLORS.textPrimary}]}>Вступить по коду</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {groups.map((group: Group) => (
            <TouchableOpacity key={group.id} style={clubCard} onPress={() => { smoothStateUpdate(() => setActiveGroup(group)); }}>
              <View style={clubIconWrap}><Ionicons name="people" size={28} color={COLORS.rose} /></View>
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>{group.name}</Text>
              <Ionicons name="chevron-forward" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isCreatingGroup && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsCreatingGroup)}>
          <Animated.View style={[styles.modalOverlay, { opacity: modalOpacityAnim }]}>
            <Animated.View style={[styles.modalContent, { transform: [{ scale: modalScaleAnim }] }]}>
              <Text style={styles.modalTitle}>Название клуба</Text>
              <TextInput style={styles.input} value={newGroupName} onChangeText={setNewGroupName} placeholder="Напр: Power Gym" placeholderTextColor={COLORS.textSecondary}/>
              <GradientButton colors={GRADIENTS.rose} style={styles.button} onPress={createGroup}><Text style={styles.buttonText}>Создать</Text></GradientButton>
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
              <GradientButton colors={GRADIENTS.violetIndigo} style={styles.button} onPress={joinGroup}><Text style={styles.buttonText}>Подключиться</Text></GradientButton>
              <TouchableOpacity style={{marginTop: 20}} onPress={() => closeAnimatedModal(setIsJoiningGroup)}><Text style={styles.backButtonText}>Отмена</Text></TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </View>
  );
}

// Прямоугольная карточка клуба (вместо квадрата в сетке).
const clubCard = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  backgroundColor: COLORS.card,
  borderRadius: 24,
  padding: 16,
  marginBottom: 14,
  borderWidth: 1,
  borderColor: 'rgba(251,113,133,0.25)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.22,
  shadowRadius: 14,
  elevation: 4,
};
const clubIconWrap = {
  width: 52,
  height: 52,
  borderRadius: 16,
  backgroundColor: 'rgba(251,113,133,0.15)',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  marginRight: 14,
};
