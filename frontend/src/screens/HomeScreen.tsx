import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal, Animated, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LineChart } from 'react-native-chart-kit';
import { ScrollPicker } from '../components/ScrollPicker';
import { weightWholeData, decimalsData } from '../utils/pickers';
import { styles } from '../styles';
import { COLORS, screenWidth } from '../theme';
import { useApp } from '../context/AppContext';
import type { WeightLog, Group, GroupMember, TrainingSession } from '../types';

export default function HomeScreen() {
  const {
    displayName, userRole, openAnimatedModal, handleTabChange, setIsScheduleListVisible, menuNavigate,
    consumedCalories, dailyCalorieNorm, currentWeight, setIsWeightModalVisible, waterIntake, addWater, resetWater,
    isWeightModalVisible, modalOpacityAnim, modalScaleAnim, closeAnimatedModal, userGoal, targetWeight,
    weightHistoryLogs, manualWeightWhole, setManualWeightWhole, manualWeightDec, setManualWeightDec,
    handleManualWeightUpdate, isLoading, isScheduleListVisible, startScheduling, isSchedulingVisible,
    scheduleStep, groups, selectGroupForSchedule, groupMembers, schedSelectedMember, setSchedSelectedMember,
    setScheduleStep, schedDate, schedTime, setDatePickerVisible, setTimePickerVisible, datePickerVisible,
    tempDate, onDateChange, timePickerVisible, onTimeChange, saveTrainingSession, setIsSchedulingVisible,
    smoothStateUpdate, chartPeriod, setChartPeriod, chartDataMemo, upcomingSessions, deleteSession,
  } = useApp();

  const renderChartSection = () => {
    if (!isWeightModalVisible) return null;

    const rawData = chartDataMemo.rawData || [];
    const { min, max, change, daysTracked } = chartDataMemo;
    const avg = rawData.length > 0 ? chartDataMemo.avg : currentWeight;
    const tw = targetWeight;

    const monthsNom = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    const now = new Date();

    const periodHeader: { [key: string]: string } = {
      day:   `${now.getDate()} ${monthsNom[now.getMonth()]}`,
      week:  `${monthsNom[now.getMonth()]}: неделя`,
      month: `${monthsNom[now.getMonth()]}: месяц`,
      year:  `${now.getFullYear()}: год`,
      all:   'всё время',
    };
    const avgLabel: { [key: string]: string } = {
      day: '', week: 'Среднее за неделю', month: 'Среднее за месяц',
      year: 'Среднее за год', all: 'Среднее',
    };

    const changeColor = change > 0 ? COLORS.error : change < 0 ? COLORS.success : COLORS.textSecondary;
    const changeSign  = change > 0 ? '+' : '';

    let dayDelta: number | null = null;
    if (chartPeriod === 'day' && weightHistoryLogs.length > 0) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const prev = weightHistoryLogs
        .filter(l => new Date(l.created_at) < todayStart)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (prev.length > 0) dayDelta = currentWeight - prev[0].weight;
    }
    const dayDeltaColor = dayDelta === null ? COLORS.textSecondary : dayDelta > 0 ? COLORS.error : dayDelta < 0 ? COLORS.success : '#aaa';
    const dayDeltaSign  = dayDelta !== null && dayDelta > 0 ? '+' : '';

    let goalRemaining = tw && tw > 0 && currentWeight > 0 ? Math.abs(currentWeight - tw) : 0;

    const periodTabs = [
      { key: 'day',   label: 'День'   },
      { key: 'week',  label: 'Неделя' },
      { key: 'month', label: 'Месяц'  },
      { key: 'year',  label: 'Год'    },
    ];

    return (
      <View style={styles.trackerCard}>
        <View style={styles.trackerTabs}>
          {periodTabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.trackerTab, chartPeriod === tab.key && styles.trackerTabActive]}
              onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setChartPeriod(tab.key); }}
            >
              <Text style={[styles.trackerTabText, chartPeriod === tab.key && styles.trackerTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ marginBottom: 14 }}>
          <Text style={styles.trackerPeriodLabel}>{periodHeader[chartPeriod]}</Text>
          {chartPeriod !== 'day' && rawData.length > 0 && (
            <>
              <Text style={styles.trackerAvgValue}>{avg.toFixed(1)} кг</Text>
              <Text style={styles.trackerAvgSub}>{avgLabel[chartPeriod]}</Text>
            </>
          )}
        </View>

        {chartPeriod === 'day' && (
          <View style={styles.trackerDayView}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={styles.trackerCurrentWeight}>{currentWeight.toFixed(1)}</Text>
              <Text style={styles.trackerKgUnit}> кг</Text>
            </View>
            {dayDelta !== null ? (
              <View style={styles.trackerDeltaBadge}>
                <Text style={[styles.trackerDeltaText, { color: dayDeltaColor }]}>
                  {dayDeltaSign}{dayDelta.toFixed(2)} кг к вчера
                </Text>
              </View>
            ) : (
              <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 8 }}>нет данных за вчера</Text>
            )}
            {tw && tw > 0 && (
              <View style={styles.trackerDayTargetRow}>
                <View style={styles.trackerDayTargetDash} />
                <Text style={styles.trackerDayTargetText}>цель {tw.toFixed(1)} кг · осталось {goalRemaining.toFixed(1)} кг</Text>
              </View>
            )}
          </View>
        )}

        {chartPeriod !== 'day' && rawData.length > 0 && (
          <LineChart
            key={`chart-${rawData.length}-${chartPeriod}-${tw || 'no'}`}
            data={{ labels: chartDataMemo.labels, datasets: chartDataMemo.datasets }}
            width={screenWidth - 80}
            height={200}
            yAxisSuffix=""
            yAxisInterval={1}
            withOuterLines={false}
            withVerticalLines={false}
            chartConfig={{
              backgroundColor: COLORS.card,
              backgroundGradientFrom: COLORS.card,
              backgroundGradientTo: COLORS.card,
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(248, 250, 252, 0.4)`,
              style: { borderRadius: 16 },
              propsForDots: { r: '4', strokeWidth: '0', fill: COLORS.tabBar },
              propsForBackgroundLines: { strokeWidth: 1, stroke: 'rgba(255,255,255,0.05)', strokeDasharray: '0' },
              fillShadowGradientFrom: COLORS.tabBar,
              fillShadowGradientFromOpacity: 0.25,
              fillShadowGradientTo: COLORS.card,
              fillShadowGradientToOpacity: 0,
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 16, marginLeft: -12 }}
            fromZero={false}
          />
        )}

        {chartPeriod !== 'day' && rawData.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 36 }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 15 }}>Нет данных за этот период</Text>
          </View>
        )}

        {chartPeriod !== 'day' && rawData.length > 0 && (
          <View style={styles.trackerStatsRow}>
            <View style={styles.trackerStat}>
              <Text style={styles.trackerStatLabel}>МИН</Text>
              <Text style={styles.trackerStatVal}>{min.toFixed(1)}</Text>
            </View>
            <View style={[styles.trackerStat, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]}>
              <Text style={styles.trackerStatLabel}>МАКС</Text>
              <Text style={styles.trackerStatVal}>{max.toFixed(1)}</Text>
            </View>
            <View style={styles.trackerStat}>
              <Text style={styles.trackerStatLabel}>ИЗМЕНЕНИЕ</Text>
              <Text style={[styles.trackerStatVal, { color: changeColor }]}>{changeSign}{change.toFixed(1)}</Text>
            </View>
          </View>
        )}

        {tw && tw > 0 && chartPeriod !== 'day' && (
          <View style={styles.trackerTargetRow}>
            <View style={styles.trackerTargetDash} />
            <Text style={styles.trackerTargetNote}>{tw.toFixed(1)} кг — цель · осталось {goalRemaining.toFixed(1)} кг</Text>
          </View>
        )}

        {chartPeriod !== 'day' && daysTracked > 0 && (
          <Text style={styles.trackerDaysNote}>
            {daysTracked} {daysTracked === 1 ? 'день' : daysTracked < 5 ? 'дня' : 'дней'} измерений
          </Text>
        )}

      </View>
    );
  };

  const renderCalendarList = () => {
    if (upcomingSessions.length === 0) return (<View style={styles.emptyCardList}><Text style={styles.placeholderText}>На ближайшее время записей нет</Text></View>);
    const grouped: { [key: string]: TrainingSession[] } = upcomingSessions.reduce((acc: any, sess: TrainingSession) => {
      if (!acc[sess.session_date]) acc[sess.session_date] = [];
      acc[sess.session_date].push(sess); return acc;
    }, {});
    return Object.keys(grouped).sort().map((dateStr: string) => (
      <View key={dateStr} style={styles.dateGroup}>
        <View style={styles.dateHeaderRow}><Ionicons name="calendar" size={20} color={COLORS.tabBar} style={{marginRight: 10}} /><Text style={styles.dateHeaderText}>{new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}</Text></View>
        {grouped[dateStr].map((sess: TrainingSession) => (
          <View key={sess.id} style={styles.sessionCard}>
            <View style={styles.sessionTimeBadge}><Text style={styles.sessionTimeText}>{sess.session_time}</Text></View>
            <View style={styles.sessionInfo}><Text style={styles.sessionDetailsTitle}>{userRole === 'trainer' ? sess.client_name : sess.group_name}</Text></View>
            {userRole === 'trainer' && (<TouchableOpacity onPress={() => deleteSession(sess.id)} style={styles.deleteBtn}><Ionicons name="trash-outline" size={22} color={COLORS.error} /></TouchableOpacity>)}
          </View>
        ))}
      </View>
    ));
  };

  const caloriesProgress = dailyCalorieNorm > 0 ? Math.min((consumedCalories / dailyCalorieNorm) * 100, 100) : 0;

  return (
    <ScrollView contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}>
          <Text style={styles.greeting} numberOfLines={1}>Привет, {displayName}! 👋</Text>
          <Text style={styles.subGreeting}>{userRole === 'trainer' ? 'Тренер' : 'Спортсмен'}</Text>
        </View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.mainActionBtn, {backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.4)', marginBottom: 15, shadowColor: 'transparent', elevation: 0}]} onPress={() => openAnimatedModal(setIsScheduleListVisible)}>
        <Ionicons name="calendar-outline" size={24} color={COLORS.tabBar} style={{marginRight: 10}} />
        <Text style={[styles.mainActionText, {color: COLORS.textPrimary}]}>Календарь записей</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.mainActionBtn} onPress={() => menuNavigate('workout')}>
        <Ionicons name="add-circle" size={24} color="#fff" style={{marginRight: 10}} />
        <Text style={styles.mainActionText}>Свободная тренировка</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.metricCardFull} onPress={() => menuNavigate('nutrition')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Ionicons name="restaurant-outline" size={28} color={COLORS.tabBar} style={{ marginRight: 10 }} />
          <Text style={styles.metricTitle}>Питание за сегодня</Text>
        </View>
        <Text style={styles.metricValueFull}>{consumedCalories} / {dailyCalorieNorm > 0 ? dailyCalorieNorm : '---'} ккал</Text>
        <View style={[styles.progressBarBg, { width: '100%', height: 14, marginTop: 12, marginLeft: 0 }]}>
          <View style={[styles.progressBarFill, { width: `${caloriesProgress}%`, backgroundColor: caloriesProgress >= 100 ? COLORS.error : COLORS.tabBar }]} />
        </View>
      </TouchableOpacity>

      <View style={styles.metricsRow}>
        <TouchableOpacity style={styles.metricCard} onPress={() => openAnimatedModal(setIsWeightModalVisible)}>
          <Ionicons name="scale-outline" size={32} color={COLORS.tabBar} style={{marginBottom: 8}} />
          <Text style={styles.metricTitle}>Вес</Text>
          <Text style={styles.metricValue}>{currentWeight > 0 ? `${currentWeight} кг` : '---'}</Text>
          <Text style={{fontSize: 13, color: COLORS.tabBar, marginTop: 4, fontWeight: '600'}}>Изменить 📝</Text>
        </TouchableOpacity>

        <View style={styles.metricCard}>
          <Ionicons name="water-outline" size={32} color="#0EA5E9" style={{marginBottom: 8}} />
          <Text style={styles.metricTitle}>Вода</Text>
          <Text style={styles.metricValue}>{waterIntake.toFixed(1)} л</Text>
          <TouchableOpacity style={styles.miniBtn} onPress={addWater} onLongPress={resetWater}><Text style={styles.miniBtnText}>+200 мл</Text></TouchableOpacity>
        </View>
      </View>

      {isWeightModalVisible && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsWeightModalVisible)}>
          <Animated.View style={[styles.wmOverlay, { opacity: modalOpacityAnim }]}>
            <Animated.View style={{ flex: 1, transform: [{ scale: modalScaleAnim }] }}>
              <View style={styles.wmHeader}>
                <View>
                  <Text style={styles.wmTitle}>Вес</Text>
                  <Text style={styles.wmSubtitle}>
                    {userGoal === 'lose' ? 'Цель: похудение' : userGoal === 'gain' ? 'Цель: набор массы' : 'Цель: поддержание'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.wmCloseBtn} onPress={() => closeAnimatedModal(setIsWeightModalVisible)}>
                  <Ionicons name="close" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.wmScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                <View style={styles.wmHero}>
                  <Text style={styles.wmHeroLabel}>ТЕКУЩИЙ ВЕС</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
                    <Text style={styles.wmHeroNum}>{currentWeight > 0 ? currentWeight.toFixed(1) : '--'}</Text>
                    <Text style={styles.wmHeroUnit}> кг</Text>
                  </View>
                  {targetWeight && targetWeight > 0 && (
                    <View style={styles.wmGoalRow}>
                      <View style={styles.wmGoalDash} />
                      <Text style={styles.wmGoalText}>
                        Цель {targetWeight.toFixed(1)} кг · осталось {Math.abs(currentWeight - targetWeight).toFixed(1)} кг
                      </Text>
                    </View>
                  )}
                  {targetWeight && targetWeight > 0 && weightHistoryLogs.length > 0 && (() => {
                    const startW = weightHistoryLogs[weightHistoryLogs.length - 1]?.weight || currentWeight;
                    const total = Math.abs(startW - targetWeight);
                    const done  = Math.abs(startW - currentWeight);
                    const pct   = total > 0 ? Math.min(Math.round(done / total * 100), 100) : 0;
                    return (
                      <View style={{ width: '100%', marginTop: 18 }}>
                        <View style={styles.wmProgressBg}>
                          <View style={[styles.wmProgressFill, { width: `${pct}%` as any }]} />
                        </View>
                        <Text style={styles.wmProgressPct}>{pct}%</Text>
                      </View>
                    );
                  })()}
                </View>

                <View style={styles.wmInputCard}>
                  <Text style={styles.wmInputLabel}>Записать новый вес</Text>
                  <View style={styles.wmPickerRow}>
                    <ScrollPicker items={weightWholeData} selectedValue={manualWeightWhole} onValueChange={(val: string | number) => setManualWeightWhole(val as number)} width={90} textColor={COLORS.textPrimary} />
                    <Text style={styles.wmPickerDot}>.</Text>
                    <ScrollPicker items={decimalsData} selectedValue={manualWeightDec} onValueChange={(val: string | number) => setManualWeightDec(val as string)} width={90} textColor={COLORS.textPrimary} />
                  </View>
                  <TouchableOpacity style={styles.wmSaveBtn} onPress={handleManualWeightUpdate} disabled={isLoading}>
                    {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.wmSaveBtnText}>Сохранить</Text>}
                  </TouchableOpacity>
                </View>

                {renderChartSection()}

                <Text style={styles.wmSectionTitle}>История измерений</Text>
                {weightHistoryLogs.slice(0, 7).map((log: WeightLog, i: number) => {
                  const prevLog = weightHistoryLogs[i + 1];
                  let diff = 0;
                  let hasDiff = false;
                  if (prevLog) { diff = log.weight - prevLog.weight; hasDiff = true; }
                  const diffColor = diff > 0 ? COLORS.error : diff < 0 ? COLORS.success : COLORS.textSecondary;
                  const diffLabel = hasDiff ? (diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)) : null;
                  const logDate = new Date(log.created_at);
                  const timeStr = `${String(logDate.getHours()).padStart(2, '0')}:${String(logDate.getMinutes()).padStart(2, '0')}`;
                  const dateStr = logDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                  return (
                    <View key={log.id} style={styles.wmHistoryItem}>
                      <View>
                        <Text style={styles.wmHistoryDate}>{dateStr}</Text>
                        <Text style={styles.wmHistoryTime}>{timeStr}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.wmHistoryWeight}>{log.weight.toFixed(1)} <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.textSecondary }}>кг</Text></Text>
                        {diffLabel && (
                          <Text style={[styles.wmHistoryDelta, { color: diffColor }]}>{diffLabel} кг</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
                {weightHistoryLogs.length === 0 && (
                  <Text style={{ color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 20, fontSize: 14 }}>Нет записей</Text>
                )}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}

      {isScheduleListVisible && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsScheduleListVisible)}>
          <Animated.View style={[styles.modalOverlayFull, { opacity: modalOpacityAnim }]}>
            <Animated.View style={[styles.modalContentFull, { transform: [{ scale: modalScaleAnim }] }]}>
              <View style={styles.modalHeaderFull}>
                <Text style={styles.modalTitleFull}>📅 Расписание</Text>
                <TouchableOpacity onPress={() => closeAnimatedModal(setIsScheduleListVisible)}>
                  <Ionicons name="close-circle" size={36} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              {userRole === 'trainer' && (<TouchableOpacity style={[styles.button, { marginBottom: 20 }]} onPress={startScheduling}><Text style={styles.buttonText}>+ Запланировать</Text></TouchableOpacity>)}
              <ScrollView style={{width: '100%', marginTop: 5, paddingBottom: 50}} showsVerticalScrollIndicator={false}>{renderCalendarList()}</ScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}

      {isSchedulingVisible && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsSchedulingVisible)}>
          <Animated.View style={[styles.modalOverlay, { opacity: modalOpacityAnim }]}>
            <Animated.View style={[styles.modalContent, { transform: [{ scale: modalScaleAnim }] }]}>
              <Text style={styles.modalTitle}>Новая запись</Text>
              {scheduleStep === 'group' && ( <View style={{width: '100%'}}><Text style={styles.label}>1. Выберите клуб:</Text>{groups.map((g: Group) => (<TouchableOpacity key={g.id} style={styles.selectItem} onPress={() => selectGroupForSchedule(g)}><Text style={styles.selectItemText}>{g.name}</Text></TouchableOpacity>))}</View> )}
              {scheduleStep === 'member' && ( <View style={{width: '100%'}}><Text style={styles.label}>2. Кто тренируется?</Text>{groupMembers.map((m: GroupMember) => (<TouchableOpacity key={m.id} style={[styles.selectItem, schedSelectedMember?.id === m.id && {borderColor: COLORS.tabBar, borderWidth: 2}]} onPress={() => { smoothStateUpdate(() => { setSchedSelectedMember(m); setScheduleStep('final'); }); }}><Text style={styles.selectItemText}>{m.name || m.email}</Text></TouchableOpacity>))}</View> )}
              {scheduleStep === 'final' && ( <View style={{width: '100%'}}><Text style={styles.label}>3. Укажите дату и время:</Text><TouchableOpacity style={styles.pickerButton} onPress={() => setDatePickerVisible(true)}><Text style={styles.pickerButtonText}>{schedDate ? schedDate : 'Выбрать дату'}</Text></TouchableOpacity><TouchableOpacity style={styles.pickerButton} onPress={() => setTimePickerVisible(true)}><Text style={styles.pickerButtonText}>{schedTime ? schedTime : 'Выбрать время'}</Text></TouchableOpacity>{datePickerVisible && ( <DateTimePicker value={tempDate} mode="date" display="default" onChange={onDateChange} /> )}{timePickerVisible && ( <DateTimePicker value={tempDate} mode="time" is24Hour={true} display="default" onChange={onTimeChange} /> )}<TouchableOpacity style={[styles.button, {marginTop: 15}]} onPress={saveTrainingSession}><Text style={styles.buttonText}>Сохранить</Text></TouchableOpacity></View> )}
              <TouchableOpacity style={styles.backButton} onPress={() => { smoothStateUpdate(() => { setIsSchedulingVisible(false); setScheduleStep('group'); }); }}><Text style={styles.backButtonText}>Отмена</Text></TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </ScrollView>
  );
}
