import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { Platform, Animated, Easing, LayoutAnimation, ScrollView, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthApiError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { kvGet, kvSet, kvRemove, kvGetJSON, kvSetJSON } from '../lib/storage';
import { getCurrentDateString, ymd, plural } from '../utils/date';
import { computeNutritionTargets } from '../utils/nutrition';
import { computeExerciseStats, computeWorkoutSummary } from '../utils/stats';
import { buildCompanionContext } from '../utils/companion';
import { translateAuthError, isValidEmail } from '../utils/authErrors';
import {
  parseWorkout, parseMeals, calculateLoss, sendChat, getBackendUrl, notifyUser, generateWorkoutPlan,
  fetchCompanionBrief, type CompanionPersona,
} from '../api/backend';
import {
  configureNotificationHandler, registerForPushNotificationsAsync, scheduleLocalReminder,
  cancelScheduledByPrefix, cancelScheduled, Notifications,
} from '../lib/notifications';
import { appAlert } from '../components/AppAlert';
import type {
  Session, WorkoutData, SavedAccount, Group, GroupMember, WeightLog,
  WorkoutRecord, AssignedWorkout, TrainingSession, ChatMessage, ChatSession, Macros,
  MealItem, MealLogRow, FoodItem, GeneratedWorkoutPlan, WorkoutBuilderBlock, JournalSet,
} from '../types';

// Совет компаньона на день (карточка на главном). Кэшируется в хранилище на дату.
export interface CompanionBrief { date: string; headline: string; message: string; suggestion: string }

const REST_TIMER_ID = 'rest_timer';

function useAppController() {
  const [session, setSession] = useState<Session | null>(null);
  // false, пока не проверили сохранённую сессию — чтобы при старте не мелькал экран входа.
  const [authReady, setAuthReady] = useState(false);
  // false, пока при холодном старте не загрузятся ключевые данные (показываем экран загрузки).
  const [bootReady, setBootReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  const [authMode, setAuthMode] = useState<string>('login');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userGoal, setUserGoal] = useState<string>('maintain');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [goal, setGoal] = useState<string>('');
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState<string>('');
  const [userAge, setUserAge] = useState<number>(25);
  const [userHeightWhole, setUserHeightWhole] = useState<number>(170);
  const [userHeightDec, setUserHeightDec] = useState<string>('00');
  const [userWeightWhole, setUserWeightWhole] = useState<number>(70);
  const [userWeightDec, setUserWeightDec] = useState<string>('00');
  const [targetWeightWhole, setTargetWeightWhole] = useState<number>(70);
  const [targetWeightDec, setTargetWeightDec] = useState<string>('00');
  const [userGender, setUserGender] = useState<string>('');

  const [currentWeight, setCurrentWeight] = useState<number>(0);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  // Самая первая запись веса (точка «Старт» для прогресса к цели). weightHistoryLogs для этого
  // не годится: там только выбранный на графике период (по умолчанию месяц).
  const [startWeight, setStartWeight] = useState<number | null>(null);

  const targetWeightRef = useRef<number | null>(null);
  useEffect(() => { targetWeightRef.current = targetWeight; }, [targetWeight]);

  const [weightHistoryLogs, setWeightHistoryLogs] = useState<WeightLog[]>([]);
  const [isWeightModalVisible, setIsWeightModalVisible] = useState<boolean>(false);
  const [manualWeightWhole, setManualWeightWhole] = useState<number>(70);
  const [manualWeightDec, setManualWeightDec] = useState<string>('00');
  const [chartPeriod, setChartPeriod] = useState<string>('month');

  const currentWeightRef = useRef<number>(currentWeight);
  useEffect(() => { currentWeightRef.current = currentWeight; }, [currentWeight]);

  const [dailyCalorieNorm, setDailyCalorieNorm] = useState<number>(0);
  const [maintenanceCalories, setMaintenanceCalories] = useState<number>(0); // поддержка (TDEE без коррекции на цель)

  // Код клуба из пригласительной ссылки (mysafeapp://join?code=...): вступаем, как появится сессия.
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const [dailyMacros, setDailyMacros] = useState<Macros>({ protein: 0, fat: 0, carb: 0 });
  const [consumedCalories, setConsumedCalories] = useState<number>(0);
  const [consumedMacros, setConsumedMacros] = useState<Macros>({ protein: 0, fat: 0, carb: 0 });

  const [isMealModalVisible, setIsMealModalVisible] = useState<boolean>(false);
  const [isMealPreviewLoading, setIsMealPreviewLoading] = useState<boolean>(false);
  const [assignedMealsToday, setAssignedMealsToday] = useState<MealItem[]>([]); // меню от тренера на сегодня (вид клиента)
  const [selfMealsToday, setSelfMealsToday] = useState<MealLogRow[]>([]);       // что клиент записал сам за сегодня
  const [mealParse, setMealParse] = useState<MealItem[] | null>(null); // распарсенные приёмы для предпросмотра (клиент)
  // Актуальные значения для асинхронных действий (ответ ИИ приходит через секунды — замыкание
  // к этому времени уже устарело, и запись «съел яблоко» затёрла бы только что добавленное).
  const selfMealsRef = useRef<MealLogRow[]>([]);
  const assignedMealsRef = useRef<MealItem[]>([]);
  useEffect(() => { selfMealsRef.current = selfMealsToday; }, [selfMealsToday]);
  useEffect(() => { assignedMealsRef.current = assignedMealsToday; }, [assignedMealsToday]);

  const [lastActivityTime, setLastActivityTime] = useState<number | null>(null);
  const [pendingExerciseCount, setPendingExerciseCount] = useState<number>(0);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isAccountSwitcherVisible, setIsAccountSwitcherVisible] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [isSideMenuVisible, setIsSideMenuVisible] = useState<boolean>(false);
  const [waterIntake, setWaterIntake] = useState<number>(0);
  const waterRef = useRef<number>(0);
  useEffect(() => { waterRef.current = waterIntake; }, [waterIntake]);
  const [history, setHistory] = useState<WorkoutRecord[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<boolean>(false);
  // План, предложенный ИИ прямо в обычном чате (см. workout_plan в /chat). Экран журнала
  // мгновенно консьюмит его при монтировании и превращает в блоки конструктора — тот же
  // путь, что и для плана из модалки "Сгенерировать план".
  const [pendingWorkoutPlan, setPendingWorkoutPlan] = useState<GeneratedWorkoutPlan | null>(null);
  // Незасейвленный конструктор тренировки (экран Личный Журнал) — здесь, а не в самом
  // экране, чтобы список не стирался при переключении вкладок (WorkoutScreen размонтируется).
  const [workoutBlocks, setWorkoutBlocks] = useState<WorkoutBuilderBlock[]>([]);

  // Таймер отдыха между подходами: момент окончания (ms) — в контексте, чтобы пережить
  // переключение вкладок. Плюс локальное уведомление на это время (телефон часто
  // блокируют во время отдыха).
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restDuration, setRestDuration] = useState<number>(90);

  // «Добавить аккаунт»: показываем экран входа, НЕ выходя из текущего аккаунта (выход
  // отозвал бы его сессию, и переключиться обратно без пароля было бы нельзя).
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  // ИИ-компаньон: характер (хранится на устройстве) и совет дня для главного экрана.
  const [companionPersona, setCompanionPersonaState] = useState<CompanionPersona>('friendly');
  const [companionBrief, setCompanionBrief] = useState<CompanionBrief | null>(null);
  const [isBriefLoading, setIsBriefLoading] = useState(false);
  // Вес за последние ~60 дней для контекста компаньона (weightHistoryLogs — только период графика).
  const [recentWeightLogs, setRecentWeightLogs] = useState<WeightLog[]>([]);

  // Группировка журнала по дням — тоже здесь, а не useMemo внутри WorkoutScreen: экран
  // полностью размонтируется на каждое переключение вкладки, так что локальный useMemo
  // пересчитывался бы заново при КАЖДОМ заходе на вкладку, даже если history не менялась.
  // Из-за этого переход на Журнал был заметно медленнее остальных вкладок.
  // Каждый подход помнит, из какой строки workouts (_rid) и с какой позиции (_idx) он
  // пришёл — нужно для удаления ошибочно записанных подходов из истории.
  const journalDayGroups = useMemo(() => {
    const map = new Map<string, JournalSet[]>();
    // history приходит от новых к старым — внутри дня собираем в хронологическом порядке.
    [...(history || [])].reverse().forEach((w: WorkoutRecord) => {
      const key = ymd(new Date(w.created_at));
      const sets = (Array.isArray(w.parsed_data) ? w.parsed_data : []).map((s, i) => ({ ...s, _rid: w.id, _idx: i }));
      map.set(key, [...(map.get(key) || []), ...sets]);
    });
    const keys = Array.from(map.keys()).filter(k => (map.get(k) || []).length > 0).sort();
    return { keys, map };
  }, [history]);

  // Рекорды/«прошлый раз» по упражнениям и недельная сводка — для экрана статистики,
  // подсказок в конструкторе и контекста ИИ-компаньона.
  const exerciseStats = useMemo(() => computeExerciseStats(journalDayGroups), [journalDayGroups]);
  const workoutSummary = useMemo(() => computeWorkoutSummary(journalDayGroups), [journalDayGroups]);

  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [todayWorkouts, setTodayWorkouts] = useState<AssignedWorkout[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState<boolean>(false);
  const [isJoiningGroup, setIsJoiningGroup] = useState<boolean>(false);
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [isMyWorkoutVisible, setIsMyWorkoutVisible] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [assignNote, setAssignNote] = useState<string>('');
  const [assignWorkoutDate, setAssignWorkoutDate] = useState<string>(getCurrentDateString());
  const [assignDateObj, setAssignDateObj] = useState<Date>(new Date());
  const [assignDatePickerVisible, setAssignDatePickerVisible] = useState<boolean>(false);
  const [myPlanViewDate, setMyPlanViewDate] = useState<string>(getCurrentDateString());
  const [myDayPlan, setMyDayPlan] = useState<AssignedWorkout | null>(null);
  const [memberDayPlan, setMemberDayPlan] = useState<AssignedWorkout | null>(null);
  const [clientProfile, setClientProfile] = useState<any | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<TrainingSession[]>([]);
  const [isScheduleListVisible, setIsScheduleListVisible] = useState<boolean>(false);
  const [isSchedulingVisible, setIsSchedulingVisible] = useState<boolean>(false);
  const [scheduleStep, setScheduleStep] = useState<string>('group');
  const [schedSelectedGroup, setSchedSelectedGroup] = useState<Group | null>(null);
  const [schedSelectedMember, setSchedSelectedMember] = useState<GroupMember | null>(null);
  const [schedDate, setSchedDate] = useState<string>('');
  const [schedTime, setSchedTime] = useState<string>('');
  const [datePickerVisible, setDatePickerVisible] = useState<boolean>(false);
  const [timePickerVisible, setTimePickerVisible] = useState<boolean>(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isChatSidebarVisible, setIsChatSidebarVisible] = useState<boolean>(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // Animations Setup
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  const modalScaleAnim = useRef(new Animated.Value(0.9)).current;
  const modalOpacityAnim = useRef(new Animated.Value(0)).current;

  const animateModalOpen = () => {
    Animated.parallel([
      Animated.timing(modalOpacityAnim, { toValue: 1, duration: 250, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.spring(modalScaleAnim, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true })
    ]).start();
  };

  const animateModalClose = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(modalOpacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(modalScaleAnim, { toValue: 0.9, duration: 200, useNativeDriver: true })
    ]).start(callback);
  };

  const openAnimatedModal = (setter: (val: boolean) => void) => {
    setter(true);
    animateModalOpen();
  };

  const closeAnimatedModal = (setter: (val: boolean) => void) => {
    animateModalClose(() => setter(false));
  };

  // Раньше тут был двухфазный переход: сначала гасили текущий экран (150мс), потом,
  // ПОСЛЕ полной смены экрана, проявляли новый (250мс) — итого ~400мс, где заметная часть
  // уходит на видимое затемнение старого экрана в никуда (пользователь его всё равно не
  // видит поверх нового) и ощущается как "мерцание перед открытием страницы". Меняем
  // сразу и просто быстро проявляем новый экран — без предварительного гашения старого.
  const handleTabChange = (tabName: string) => {
    if (tabName === currentTab) return;
    setCurrentTab(tabName);
    // Если состоишь ровно в одном клубе — открываем его сразу, без лишнего тапа по карточке.
    if (tabName === 'club' && !activeGroup && groups.length === 1) setActiveGroup(groups[0]);
    contentFadeAnim.setValue(0);
    // requestAnimationFrame — не запускаем анимацию в этом же тике: setCurrentTab ещё не
    // успел отрендериться/смонтироваться, и без этой отсрочки часть длительности анимации
    // "сгорает" впустую, пока экран монтируется — на глаз это выглядит как отсутствие плавности.
    requestAnimationFrame(() => {
      Animated.timing(contentFadeAnim, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
    });
  };

  const menuNavigate = (tabName: string) => {
    setIsSideMenuVisible(false);
    handleTabChange(tabName);
  };

  const smoothStateUpdate = (callback: () => void) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    callback();
  };

  // Ключ питания привязан к пользователю, иначе данные «протекают» между аккаунтами на одном устройстве.
  const getNutritionKey = (date?: string) => `nutrition_${session?.user?.id || 'guest'}_${date || getCurrentDateString()}`;

  const performMidnightUpdate = async () => {
    try {
      const today = getCurrentDateString();
      let lastDate = Platform.OS !== 'web' ? await AsyncStorage.getItem('lastSavedDate') : window.localStorage.getItem('lastSavedDate');

      // Влияние питания на вес считает только settleCalorieWeight (от поддержки, лишь за дни с
      // записанной едой). Здесь раньше был второй пересчёт — от нормы С УЧЁТОМ цели и даже при
      // пустом дне, т.е. вес списывался дважды, а без записей еды «худел» на ~0.3 кг за день.
      if (lastDate && lastDate !== today) settleCalorieWeight();

      if (lastDate !== today) {
         if (Platform.OS !== 'web') await AsyncStorage.setItem('lastSavedDate', today);
         else window.localStorage.setItem('lastSavedDate', today);
         refreshTodayNutrition(); // итоги КБЖУ, меню тренера и «я ел сегодня» — за новый день
         loadTodayWater();
         setCompanionBrief(prev => (prev && prev.date !== today ? null : prev)); // вчерашний совет устарел
      }
    } catch (e) { console.log("Midnight update error", e); }
  };

  // Раньше проверка смены дня запускалась только при уже посчитанной норме калорий и весе >0:
  // без полного профиля питание и вода так и оставались «вчерашними» до перезапуска.
  useEffect(() => {
    if (session) {
      performMidnightUpdate();
      const interval = setInterval(performMidnightUpdate, 60000);
      return () => clearInterval(interval);
    }
  }, [session]);

  // Прогрев бэкенда при запуске: Render на бесплатном тарифе засыпает после простоя и просыпается
  // 30–60 сек. Будим его фоновым запросом сразу, чтобы к моменту чата/парсинга он уже был готов.
  useEffect(() => {
    fetch(`${getBackendUrl()}/health`).catch(() => {});
  }, []);

  useEffect(() => {
    kvGetJSON<SavedAccount[]>('savedAccounts', []).then(list => setSavedAccounts(Array.isArray(list) ? list : []));
    kvGet('companionPersona').then(p => { if (p === 'friendly' || p === 'strict' || p === 'calm') setCompanionPersonaState(p); });
    supabase.auth.getSession().then(({ data: { session } }) => {
      activeUidRef.current = session?.user?.id || null;
      setSession(session);
      if (session?.user?.user_metadata?.role) setUserRole(session.user.user_metadata.role);
      // Миграция со старых версий: у активного аккаунта есть живая сессия — сразу меняем
      // сохранённый пароль на refresh-токен.
      if (session) rememberAccountSession(session);
    }).finally(() => setAuthReady(true));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      activeUidRef.current = session?.user?.id || null;
      setSession(session);
      if (session?.user?.user_metadata?.role) setUserRole(session.user.user_metadata.role);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  // Кто залогинен ПРЯМО СЕЙЧАС. Загрузки асинхронные: ответ, запрошенный ещё для прежнего
  // аккаунта, может прийти уже после переключения — такие ответы отбрасываем (isStale), иначе
  // история/вес/питание одного аккаунта «протекали» в другой.
  const activeUidRef = useRef<string | null>(null);
  const isStale = (uid?: string | null) => !uid || uid !== activeUidRef.current;

  // Грузим историю чатов один раз на пользователя (по user.id, а НЕ по объекту session —
  // иначе обновление токена меняет session и перечитывает хранилище, затирая свежий чат).
  const chatsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) { chatsLoadedRef.current = null; return; }
    let cancelled = false;
    (async () => {
      const key = `chatSessions_${uid}`;
      try {
        const saved = Platform.OS !== 'web'
          ? await AsyncStorage.getItem(key)
          : (typeof window !== 'undefined' ? window.localStorage.getItem(key) : null);
        if (!cancelled) setChatSessions(saved ? JSON.parse(saved) : []);
      } catch (e) {}
      if (!cancelled) chatsLoadedRef.current = uid; // сохранять можно только после загрузки
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || chatsLoadedRef.current !== uid) return; // не затираем хранилище до первой загрузки
    const key = `chatSessions_${uid}`;
    try {
      const val = JSON.stringify(chatSessions);
      if (Platform.OS !== 'web') AsyncStorage.setItem(key, val);
      else if (typeof window !== 'undefined') window.localStorage.setItem(key, val);
    } catch (e) {}
  }, [chatSessions, session?.user?.id]);

  // Пуш: настраиваем поведение в foreground + реагируем на тап по уведомлению (переход на вкладку).
  useEffect(() => {
    configureNotificationHandler();
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const data = (resp?.notification?.request?.content?.data || {}) as any;
      if (data?.tab) setCurrentTab(data.tab);
    });
    return () => sub.remove();
  }, []);

  // Клиенту планируем локальные напоминания о ближайших тренировках.
  useEffect(() => {
    const role = session?.user?.user_metadata?.role || userRole;
    if (!session || role === 'trainer') return;
    syncSessionReminders(upcomingSessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingSessions]);

  // Сменился пользователь (переключение/добавление аккаунта) → сначала стираем данные
  // прежнего, потом грузим нового. Раньше сброс был вручную в каждом месте смены аккаунта и
  // кое-что «протекало» (например, незаконченный конструктор тренировки переезжал в чужой аккаунт).
  const lastUidRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user?.id || null;
    if (lastUidRef.current && uid && lastUidRef.current !== uid) resetUserScopedState();
    if (uid) lastUidRef.current = uid;
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return; // нет сессии → экран входа; bootReady не нужен
    let cancelled = false;
    const loadPending = async () => {
      try {
        if (Platform.OS !== 'web') {
          const savedPending = await AsyncStorage.getItem('pendingExercises');
          if (savedPending) setPendingExerciseCount(JSON.parse(savedPending).length);
          const savedTime = await AsyncStorage.getItem('lastActivityTime');
          if (savedTime) setLastActivityTime(parseInt(savedTime, 10));
        } else {
          if (typeof window !== 'undefined') {
            const savedPending = window.localStorage.getItem('pendingExercises');
            if (savedPending) setPendingExerciseCount(JSON.parse(savedPending).length);
            const savedTime = window.localStorage.getItem('lastActivityTime');
            if (savedTime) setLastActivityTime(parseInt(savedTime, 10));
          }
        }
      } catch (e) {}
    };
    // Ждём ключевые данные (но не дольше 7с), затем снимаем экран загрузки.
    (async () => {
      const tasks = [
        loadHistory(), fetchGroups(), fetchUpcomingSessions(), fetchUserProfileData(),
        fetchWeightLog(), refreshTodayNutrition(), loadTodayWater(), fetchRecentWeights(),
        loadCachedBrief(),
      ];
      await Promise.race([
        Promise.allSettled(tasks),
        new Promise(res => setTimeout(res, 7000)),
      ]);
      loadPending();
      registerPushToken(); // не блокирует показ интерфейса
      settleCalorieWeight(); // досчитать влияние вчерашнего питания на вес
      if (!cancelled) setBootReady(true);
    })();
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => { if (activeGroup) fetchGroupDetails(); }, [activeGroup]);

  useEffect(() => { if (selectedMember) loadMemberDayPlan(); else setMemberDayPlan(null); }, [selectedMember, assignWorkoutDate]);

  useEffect(() => { if (selectedMember) fetchClientProfile(selectedMember.id); else setClientProfile(null); }, [selectedMember]);

  useEffect(() => {
    if (isWeightModalVisible && currentWeight > 0) {
      const whole = Math.floor(currentWeight);
      let decStr = (currentWeight % 1).toFixed(2).split('.')[1];
      let decNum = parseInt(decStr, 10);
      decNum = Math.round(decNum / 5) * 5;
      if (decNum === 100) decNum = 95;
      decStr = decNum < 10 ? `0${decNum}` : `${decNum}`;
      setManualWeightWhole(whole); setManualWeightDec(decStr);
      fetchWeightLog(chartPeriod);
    }
  }, [isWeightModalVisible, currentWeight]);

  useEffect(() => {
    if (isWeightModalVisible) {
      fetchWeightLog(chartPeriod);
    }
  }, [chartPeriod]);

  // Эффект ниже перезапускается при смене currentWeight — в том числе от собственного
  // setCurrentWeight, пока ещё идёт запрос. Без флага второй проход находил те же
  // pendingExercises (их удаляли только в самом конце) и списывал вес повторно.
  const pendingWeightBusyRef = useRef(false);
  useEffect(() => {
    const checkPendingWeight = async () => {
      if (!session || !session.user || currentWeight <= 0 || pendingWeightBusyRef.current) return;
      pendingWeightBusyRef.current = true;
      try {
        let timeStr = null;
        if (Platform.OS !== 'web') { timeStr = await AsyncStorage.getItem('lastActivityTime'); } else { timeStr = typeof window !== 'undefined' ? window.localStorage.getItem('lastActivityTime') : null; }

        if (!timeStr) return;
        const lastTime = parseInt(timeStr, 10);
        if (Date.now() - lastTime >= 3600000) {
          let savedPending = null;
          if (Platform.OS !== 'web') { savedPending = await AsyncStorage.getItem('pendingExercises'); } else { savedPending = typeof window !== 'undefined' ? window.localStorage.getItem('pendingExercises') : null; }
          // Сначала «забираем» подходы из хранилища, потом считаем — повторно их уже не посчитать.
          if (Platform.OS !== 'web') { await AsyncStorage.removeItem('pendingExercises'); await AsyncStorage.removeItem('lastActivityTime'); } else { if (typeof window !== 'undefined') { window.localStorage.removeItem('pendingExercises'); window.localStorage.removeItem('lastActivityTime'); } }
          setPendingExerciseCount(0); setLastActivityTime(null);

          if (savedPending) {
            const pending = JSON.parse(savedPending);
            if (pending.length > 0) {
              try {
                const data = await calculateLoss(currentWeight, pending);
                const loss = data.weight_loss_kg || 0;
                if (loss > 0) {
                  let newW = parseFloat((currentWeight - loss).toFixed(2));
                  if (newW > 0 && session.user?.id) {
                    await supabase.from('profiles').update({ weight: newW }).eq('id', session.user.id);
                    await supabase.from('weight_log').insert([{ user_id: session.user.id, weight: newW }]);
                    const newLog: WeightLog = { id: Date.now().toString(), weight: newW, created_at: new Date().toISOString() };
                    setWeightHistoryLogs(prev => [newLog, ...prev]);
                    smoothStateUpdate(() => setCurrentWeight(newW));
                    await fetchWeightLog();
                  }
                }
              } catch(e) {}
            }
          }
        }
      } catch (e) {} finally { pendingWeightBusyRef.current = false; }
    };
    const interval = setInterval(checkPendingWeight, 30000);
    checkPendingWeight(); return () => clearInterval(interval);
  }, [session, currentWeight, userGoal]);

  // ===================== ПИТАНИЕ =====================
  // Итоги дня считаются из БАЗЫ: Σ meal_log за сегодня (самозапись + еда из чата) + съеденные
  // блюда из меню тренера. Раньше итоги жили только в AsyncStorage — после переустановки или
  // на втором телефоне «съедено» обнулялось, еду из чата не видел тренер, и ошибочно
  // записанное блюдо было нельзя удалить. Локальная копия осталась как кэш: офлайн-фолбэк
  // и источник для settleCalorieWeight (вчерашние калории → вес).
  type Totals = { c: number; p: number; f: number; cb: number };
  const ZERO: Totals = { c: 0, p: 0, f: 0, cb: 0 };
  const sumMeals = (rows: { calories: number; protein: number; fat: number; carbs: number }[]): Totals =>
    rows.reduce((a, m) => ({ c: a.c + (Number(m.calories) || 0), p: a.p + (Number(m.protein) || 0), f: a.f + (Number(m.fat) || 0), cb: a.cb + (Number(m.carbs) || 0) }), ZERO);
  const addT = (a: Totals, b: Totals): Totals => ({ c: a.c + b.c, p: a.p + b.p, f: a.f + b.f, cb: a.cb + b.cb });
  const subT = (a: Totals, b: Totals): Totals => ({ c: Math.max(0, a.c - b.c), p: Math.max(0, a.p - b.p), f: Math.max(0, a.f - b.f), cb: Math.max(0, a.cb - b.cb) });

  // «Добавка» за сегодня, которой нет в базе: еда, записанная старой версией приложения до
  // обновления (только локально), и записи, которые не удалось отправить без сети.
  const extraKey = (date = getCurrentDateString()) => `nutritionExtra_${session?.user?.id || 'guest'}_${date}`;
  // Ключ кэша включает и пользователя, и дату — смена аккаунта или дня перечитывает хранилище.
  const nutritionExtraRef = useRef<{ key: string; t: Totals }>({ key: '', t: ZERO });
  const getExtra = async (): Promise<Totals> => {
    const key = extraKey();
    if (nutritionExtraRef.current.key !== key) {
      nutritionExtraRef.current = { key, t: await kvGetJSON<Totals>(key, ZERO) };
    }
    return nutritionExtraRef.current.t;
  };
  const setExtra = async (t: Totals) => {
    const key = extraKey();
    nutritionExtraRef.current = { key, t };
    await kvSetJSON(key, t);
  };

  const applyTotals = (t: Totals) => {
    const r = { c: Math.round(t.c), p: Math.round(t.p), f: Math.round(t.f), cb: Math.round(t.cb) };
    smoothStateUpdate(() => {
      setConsumedCalories(r.c);
      setConsumedMacros({ protein: r.p, fat: r.f, carb: r.cb });
    });
    kvSetJSON(getNutritionKey(), { calories: r.c, protein: r.p, fat: r.f, carbs: r.cb });
  };

  const recomputeTotals = async (assigned: MealItem[], self: MealLogRow[]) => {
    const extra = await getExtra();
    applyTotals(addT(addT(sumMeals(self), sumMeals(assigned.filter(m => m.eaten))), extra));
  };

  // Офлайн-фолбэк: последние известные итоги из кэша.
  const loadTodayNutritionData = async () => {
    const saved = await kvGetJSON<any>(getNutritionKey(), null);
    applyTotals(saved ? { c: saved.calories || 0, p: saved.protein || 0, f: saved.fat || 0, cb: saved.carbs || 0 } : ZERO);
  };

  // Питание из БД: меню от тренера на сегодня (assigned_meals) + что записано самим (meal_log).
  const refreshTodayNutrition = async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    const today = getCurrentDateString();
    const [amRes, mlRes] = await Promise.all([
      supabase.from('assigned_meals').select('meal_data').eq('client_id', uid).eq('date', today).maybeSingle(),
      supabase.from('meal_log').select('*').eq('user_id', uid).eq('date', today).order('created_at', { ascending: true }),
    ]);
    if (isStale(uid)) return;
    if (amRes.error || mlRes.error) { await loadTodayNutritionData(); return; } // нет сети — показываем кэш
    const assigned = (amRes.data?.meal_data as MealItem[]) || [];
    const self = (mlRes.data as MealLogRow[]) || [];

    // Первый запуск после обновления: в локальных итогах может быть еда из чата, которой нет
    // в базе. Переносим разницу в «добавку» на сегодня, чтобы съеденное не «пропало».
    const migratedKey = `nutritionDbSource_${uid}`;
    if (!(await kvGet(migratedKey))) {
      const local = await kvGetJSON<any>(getNutritionKey(), null);
      if (local) {
        const db = addT(sumMeals(self), sumMeals(assigned.filter(m => m.eaten)));
        await setExtra(subT({ c: local.calories || 0, p: local.protein || 0, f: local.fat || 0, cb: local.carbs || 0 }, db));
      }
      await kvSet(migratedKey, today);
    }

    setAssignedMealsToday(assigned); assignedMealsRef.current = assigned;
    setSelfMealsToday(self); selfMealsRef.current = self;
    await recomputeTotals(assigned, self);
  };
  // Старое имя — экраны зовут его при открытии.
  const loadClientNutrition = refreshTodayNutrition;

  // Запись еды в meal_log. Если не получилось (нет сети) — учитываем хотя бы локально.
  const insertMealRows = async (rows: Omit<MealLogRow, 'id' | 'user_id' | 'date'>[]): Promise<MealLogRow[]> => {
    const uid = session?.user?.id;
    if (!uid || rows.length === 0) return [];
    const date = getCurrentDateString();
    const { data, error } = await supabase.from('meal_log').insert(rows.map(r => ({ ...r, user_id: uid, date }))).select();
    if (error || !data) {
      const added = sumMeals(rows);
      await setExtra(addT(await getExtra(), added));
      const cached = await kvGetJSON<any>(getNutritionKey(), null);
      applyTotals(addT(cached ? { c: cached.calories || 0, p: cached.protein || 0, f: cached.fat || 0, cb: cached.carbs || 0 } : ZERO, added));
      return [];
    }
    const inserted = data as MealLogRow[];
    const next = [...selfMealsRef.current, ...inserted];
    smoothStateUpdate(() => setSelfMealsToday(next));
    selfMealsRef.current = next;
    await recomputeTotals(assignedMealsRef.current, next);
    return inserted;
  };

  // Удалить ошибочно записанное блюдо из «Я ел сегодня».
  const deleteSelfMeal = (id: string) => {
    const row = selfMealsRef.current.find(m => m.id === id);
    if (!row) return;
    appAlert('Удалить запись?', `${row.name || 'Блюдо'} · ${row.calories} ккал`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        const next = selfMealsRef.current.filter(m => m.id !== id);
        smoothStateUpdate(() => setSelfMealsToday(next));
        selfMealsRef.current = next;
        await recomputeTotals(assignedMealsRef.current, next);
        const { error } = await supabase.from('meal_log').delete().eq('id', id);
        if (error) { appAlert('Ошибка', 'Не удалось удалить запись. Проверьте подключение.'); refreshTodayNutrition(); }
      } },
    ]);
  };

  // Клиент отмечает блюдо из плана как съеденное: пишем eaten в assigned_meals (видит тренер)
  // и пересчитываем дневные итоги КБЖУ.
  const toggleAssignedMealEaten = async (mealId: string) => {
    if (!session?.user?.id) return;
    const target = assignedMealsRef.current.find(m => m.id === mealId);
    if (!target) return;
    const updated = assignedMealsRef.current.map(m => m.id === mealId ? { ...m, eaten: !target.eaten } : m);
    setAssignedMealsToday(updated);
    assignedMealsRef.current = updated;
    await recomputeTotals(updated, selfMealsRef.current);
    await supabase.from('assigned_meals').update({ meal_data: updated }).eq('client_id', session.user.id).eq('date', getCurrentDateString());
  };

  const fetchUserProfileData = async () => {
    if (!session?.user) return;
    const [{ data }, { data: first }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      supabase.from('weight_log').select('weight').eq('user_id', session.user.id).order('created_at', { ascending: true }).limit(1),
    ]);
    if (isStale(session.user.id)) return;
    setStartWeight(first?.[0]?.weight ?? null);
    if (data) {
      smoothStateUpdate(() => {
        setCurrentWeight(data.weight || 0);
        setUserGoal(data.goal || 'maintain');
        setTargetWeight(data.target_weight || null);
        if (data.weight && data.height && data.age && data.gender) {
          const t = computeNutritionTargets({
            weight: data.weight, height: data.height, age: data.age, gender: data.gender,
            workoutsPerWeek: data.workouts_per_week, goal: data.goal,
          });
          setMaintenanceCalories(t.maintenanceCalories);
          setDailyCalorieNorm(t.dailyCalorieNorm);
          setDailyMacros(t.macros);
        }
      });
    }
  };

  // Диплинк приглашения в клуб (mysafeapp://join?code=...) — вступаем, как появится сессия
  // (после входа, если ещё не залогинен). Работает после пересборки (схема нативная).
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const m = url.match(/[?&]code=(\d{4,8})/);
      if (url.indexOf('join') !== -1 && m) setPendingInviteCode(m[1]);
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  const getLocalWeightKey = () => `weight_logs_${session?.user?.id || 'guest'}`;

  const saveWeightLogLocally = (logs: WeightLog[]) => {
    const key = getLocalWeightKey();
    const json = JSON.stringify(logs);
    if (Platform.OS !== 'web') AsyncStorage.setItem(key, json);
    else if (typeof window !== 'undefined') window.localStorage.setItem(key, json);
  };

  const loadLocalWeightLogs = async (): Promise<WeightLog[]> => {
    const key = getLocalWeightKey();
    try {
      let saved: string | null = null;
      if (Platform.OS !== 'web') saved = await AsyncStorage.getItem(key);
      else if (typeof window !== 'undefined') saved = window.localStorage.getItem(key);
      if (saved) return JSON.parse(saved) as WeightLog[];
    } catch (e) {}
    return [];
  };

  const fetchWeightLog = async (period?: string) => {
    if (!session?.user) return;
    const p = period || chartPeriod;
    let query = supabase.from('weight_log').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });

    let limit = 100;
    if (p === 'day') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte('created_at', today.toISOString());
    } else if (p === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('created_at', weekAgo.toISOString());
    } else if (p === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query = query.gte('created_at', monthAgo.toISOString());
    } else if (p === 'year') {
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      query = query.gte('created_at', yearAgo.toISOString());
      limit = 365;
    } else {
      limit = 1000;
    }
    query = query.limit(limit);

    const { data, error } = await query;
    if (isStale(session.user.id)) return;
    if (data && data.length > 0) {
      setWeightHistoryLogs(data as WeightLog[]);
      saveWeightLogLocally(data as WeightLog[]);
    } else {
      const local = await loadLocalWeightLogs();
      if (local.length > 0) setWeightHistoryLogs(local);
    }
  };

  // Вес за ~60 дней — для контекста ИИ-компаньона (динамика за неделю/месяц).
  const fetchRecentWeights = async () => {
    if (!session?.user?.id) return;
    const since = new Date(); since.setDate(since.getDate() - 60);
    const { data } = await supabase.from('weight_log').select('id, weight, created_at')
      .eq('user_id', session.user.id).gte('created_at', since.toISOString())
      .order('created_at', { ascending: true }).limit(200);
    if (isStale(session.user.id)) return;
    if (data) setRecentWeightLogs(data as WeightLog[]);
  };

  const handleManualWeightUpdate = async () => {
    const weightNum = parseFloat(`${manualWeightWhole}.${manualWeightDec}`);
    await recordWeight(weightNum);
  };

  // Записать вес (модалка «Вес» и действие ИИ-компаньона «я вешу 82.5»).
  const recordWeight = async (weightNum: number): Promise<boolean> => {
    if (isNaN(weightNum) || weightNum <= 0) return false;
    setIsLoading(true);
    let ok = true;

    try {
      if (!session?.user?.id) throw new Error('No user session');

      const now = new Date().toISOString();
      const newLog: WeightLog = { id: Date.now().toString(), weight: weightNum, created_at: now };

      smoothStateUpdate(() => setCurrentWeight(weightNum));
      setWeightHistoryLogs(prev => {
        if (prev.length > 0 && prev[0].weight === weightNum && new Date(prev[0].created_at).getTime() > Date.now() - 3000) {
          return prev;
        }
        return [newLog, ...prev];
      });

      const updatedLogs = weightHistoryLogs.length > 0
        ? [newLog, ...weightHistoryLogs.filter(l => l.id !== newLog.id)]
        : [newLog];
      saveWeightLogLocally(updatedLogs);

      const [profileResult, weightResult] = await Promise.all([
        supabase.from('profiles').update({ weight: weightNum }).eq('id', session.user.id),
        supabase.from('weight_log').insert([{ user_id: session.user.id, weight: weightNum }])
      ]);

      const isRlsError = (err: any) => err?.code === '42501';
      const rlsBlocked = isRlsError(profileResult?.error) || isRlsError(weightResult?.error);

      if (!rlsBlocked) {
        if (profileResult.error) throw profileResult.error;
        if (weightResult.error) throw weightResult.error;
        await Promise.all([
          fetchWeightLog(),
          fetchUserProfileData(),
          fetchRecentWeights(),
        ]);
      }

    } catch (e) {
      const err = e as unknown as Record<string, any>;
      if (err?.code === '42501') {
      } else {
        ok = false;
        console.error('Weight update error:', err);
        appAlert('Ошибка', 'Не удалось сохранить вес. Проверьте подключение.');
      }
    } finally {
      setIsLoading(false);
    }
    return ok;
  };

  const registerActivityForWeightLoss = async (exercisesArray: WorkoutData[], isAdding: boolean) => {
    try {
      let saved = null;
      if (Platform.OS !== 'web') { saved = await AsyncStorage.getItem('pendingExercises'); } else { saved = typeof window !== 'undefined' ? window.localStorage.getItem('pendingExercises') : null; }
      let pending: WorkoutData[] = saved ? JSON.parse(saved) : [];
      if (isAdding) pending = [...pending, ...exercisesArray];
      else { const idsToRemove = exercisesArray.map((e: WorkoutData) => e.id); pending = pending.filter((e: WorkoutData) => !idsToRemove.includes(e.id)); }
      const now = Date.now();
      if (pending.length > 0) {
        if (Platform.OS !== 'web') { await AsyncStorage.setItem('pendingExercises', JSON.stringify(pending)); await AsyncStorage.setItem('lastActivityTime', now.toString()); } else { if (typeof window !== 'undefined') { window.localStorage.setItem('pendingExercises', JSON.stringify(pending)); window.localStorage.setItem('lastActivityTime', now.toString()); } }
        setPendingExerciseCount(pending.length); setLastActivityTime(now);
      } else {
        if (Platform.OS !== 'web') { await AsyncStorage.removeItem('pendingExercises'); await AsyncStorage.removeItem('lastActivityTime'); } else { if (typeof window !== 'undefined') { window.localStorage.removeItem('pendingExercises'); window.localStorage.removeItem('lastActivityTime'); } }
        setPendingExerciseCount(0); setLastActivityTime(null);
      }
    } catch (e) {}
  };

  // Раз в день досчитываем влияние ПИТАНИЯ на вес: (съедено вчера − поддержка) / 7700 кг.
  // Поддержка = TDEE без коррекции на цель. Двигаем вес только за дни, где еда реально записана.
  // Активность (тренировки) учитывается отдельно — checkPendingWeight через час после тренировки.
  const KCAL_PER_KG = 7700;
  const settlingRef = useRef(false); // запуск на старте и смена дня могут совпасть — не считать дважды
  const settleCalorieWeight = async () => {
    if (!session?.user?.id || settlingRef.current) return;
    settlingRef.current = true;
    try { await settleCalorieWeightOnce(session.user.id); } finally { settlingRef.current = false; }
  };
  const settleCalorieWeightOnce = async (uid: string) => {
    const today = getCurrentDateString();
    const settleKey = `weightSettle_${uid}`;
    const readKV = async (k: string) => Platform.OS !== 'web' ? await AsyncStorage.getItem(k) : (typeof window !== 'undefined' ? window.localStorage.getItem(k) : null);
    const writeKV = async (k: string, v: string) => { if (Platform.OS !== 'web') await AsyncStorage.setItem(k, v); else if (typeof window !== 'undefined') window.localStorage.setItem(k, v); };
    try {
      const lastSettled = await readKV(settleKey);
      if (!lastSettled) { await writeKV(settleKey, today); return; } // первый запуск — без пересчёта задним числом
      if (lastSettled >= today) return; // уже сегодня считали

      // вчерашняя дата (по локальному времени)
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      const yKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // профиль → текущий вес + поддержка (TDEE)
      const { data: prof } = await supabase.from('profiles').select('weight, height, age, gender, workouts_per_week').eq('id', uid).single();
      if (!prof?.weight || !prof.height || !prof.age || !prof.gender) { await writeKV(settleKey, today); return; }
      const { maintenanceCalories: maintenance } = computeNutritionTargets({
        weight: prof.weight, height: prof.height, age: prof.age, gender: prof.gender,
        workoutsPerWeek: prof.workouts_per_week,
      });

      // съедено вчера (из локального хранилища питания)
      let consumed = 0;
      const nstr = await readKV(`nutrition_${uid}_${yKey}`);
      if (nstr) { try { consumed = JSON.parse(nstr).calories || 0; } catch {} }

      if (consumed > 0) {
        let delta = (consumed - maintenance) / KCAL_PER_KG;
        delta = Math.max(-0.4, Math.min(0.4, delta)); // защита от мусора (макс ±0.4 кг/день)
        const newW = parseFloat((prof.weight + delta).toFixed(2));
        if (newW > 0 && Math.abs(delta) >= 0.01) {
          await supabase.from('profiles').update({ weight: newW }).eq('id', uid);
          await supabase.from('weight_log').insert([{ user_id: uid, weight: newW }]);
          smoothStateUpdate(() => setCurrentWeight(newW));
          await fetchWeightLog();
        }
      }
      await writeKV(settleKey, today);
    } catch (e) {}
  };

  // ===================== СОХРАНЁННЫЕ АККАУНТЫ =====================
  // Быстрое переключение без пароля: для каждого аккаунта храним refresh-токен его сессии
  // (supabase.auth.refreshSession({ refresh_token }) — штатный способ multi-account). Раньше
  // в AsyncStorage лежал пароль открытым текстом, а переключение начиналось с signOut(),
  // который отзывал сессию на сервере.
  const persistAccounts = async (accounts: SavedAccount[]) => {
    setSavedAccounts(accounts);
    await kvSetJSON('savedAccounts', accounts);
  };

  // Запомнить (или обновить) аккаунт по его живой сессии. Пароль, если остался от старой
  // версии, при этом стирается.
  const rememberAccountSession = async (sess: Session, extra?: { name?: string; role?: string }) => {
    const u = sess.user;
    if (!u?.id) return;
    const accounts = await kvGetJSON<SavedAccount[]>('savedAccounts', []);
    const prev = accounts.find(a => a.id === u.id);
    const acc: SavedAccount = {
      id: u.id,
      email: u.email || prev?.email || '',
      name: u.user_metadata?.name || extra?.name || prev?.name || (u.email || '').split('@')[0],
      role: u.user_metadata?.role || extra?.role || prev?.role || '',
      refreshToken: sess.refresh_token,
    };
    const next = prev ? accounts.map(a => (a.id === u.id ? acc : a)) : [...accounts, acc];
    await persistAccounts(next);
  };

  // Перед уходом из аккаунта (переключение/добавление) запоминаем его актуальный refresh-токен.
  // Если access-токен вот-вот истечёт, сначала обновляем сами — иначе фоновый автоапдейт мог
  // бы «перевыпустить» токен уже после снимка, и сохранённый стал бы недействительным.
  const snapshotCurrentAccount = async () => {
    try {
      let sess = (await supabase.auth.getSession()).data.session;
      if (sess?.expires_at && sess.expires_at * 1000 - Date.now() < 5 * 60 * 1000) {
        sess = (await supabase.auth.refreshSession()).data.session || sess;
      }
      if (sess) await rememberAccountSession(sess);
    } catch {}
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (session?.user?.id === account.id) { setIsAccountSwitcherVisible(false); return; }
    setIsAccountSwitcherVisible(false); setIsSideMenuVisible(false);
    if (!account.refreshToken && !account.password) { promptReLogin(account); return; }
    setIsSwitchingAccount(true);
    try {
      await snapshotCurrentAccount();
      let next: Session | null = null;
      if (account.refreshToken) {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: account.refreshToken });
        if (!error) next = data.session;
        // Сервер явно отверг токен (отозван/использован) — тогда он мёртв. Всё остальное
        // (нет сети, таймаут, 5xx) — временный сбой: токен НЕ трогаем, просим повторить.
        else if (!(isAuthApiError(error) && error.status >= 400 && error.status < 500)) throw error;
      }
      // Запись старой версии с паролем: входим им один раз и сразу меняем пароль на токен.
      // ВАЖНО: без signOut — он отозвал бы сессию текущего аккаунта.
      if (!next && account.password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
        if (!error) next = data.session;
      }
      if (!next) {
        // Токен отозван (выход на другом устройстве, смена пароля) — забываем его и просим войти.
        await persistAccounts((await kvGetJSON<SavedAccount[]>('savedAccounts', [])).map(a =>
          a.id === account.id ? { id: a.id, email: a.email, name: a.name, role: a.role } : a));
        setIsSwitchingAccount(false);
        promptReLogin(account);
        return;
      }
      await rememberAccountSession(next);
      activeUidRef.current = next.user?.id || null;
      setSession(next);
      if (next.user?.user_metadata?.role) setUserRole(next.user.user_metadata.role);
      setCurrentTab('home');
    } catch {
      appAlert('Ошибка', 'Не удалось переключить аккаунт. Проверьте подключение.');
    }
    setTimeout(() => { setIsSwitchingAccount(false); }, 300);
  };

  // Сессия сохранённого аккаунта недействительна — открываем вход с уже введённым email.
  const promptReLogin = (account: SavedAccount) => {
    appAlert('Нужно войти заново', `Сессия аккаунта ${account.email} истекла. Введите пароль ещё раз.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Войти', onPress: () => { startAddAccount(account.email); } },
    ]);
  };

  // «Добавить аккаунт»: текущий аккаунт остаётся залогиненным (его токен сохранён), поверх
  // показывается экран входа. Успешный вход просто заменит сессию; «Отмена» — вернёт назад.
  const startAddAccount = async (prefillEmail = '') => {
    setIsAccountSwitcherVisible(false); setIsSideMenuVisible(false);
    await snapshotCurrentAccount();
    smoothStateUpdate(() => {
      setAuthMode('login'); setEmail(prefillEmail); setPassword(''); setConfirmPassword(''); setName('');
      setIsAddingAccount(true);
    });
  };
  const handleAddAnotherAccount = () => { startAddAccount(); };
  const cancelAddAccount = () => {
    smoothStateUpdate(() => { setIsAddingAccount(false); setAuthMode('login'); setPassword(''); setConfirmPassword(''); });
  };

  const handleSignOut = async () => {
    const uid = session?.user?.id;
    await persistAccounts((await kvGetJSON<SavedAccount[]>('savedAccounts', [])).filter(a => a.id !== uid));
    // scope: 'local' — выходим только на этом устройстве. По умолчанию signOut глобальный и
    // разлогинивал пользователя заодно на всех его телефонах.
    await supabase.auth.signOut({ scope: 'local' });
    clearUserState();
  };

  // Данные, привязанные к пользователю: стираются при выходе и при смене аккаунта.
  const resetUserScopedState = () => {
    setGroups([]); setHistory([]); setActiveGroup(null); setGroupMembers([]); setTodayWorkouts([]); setUpcomingSessions([]);
    setAssignNote(''); setWaterIntake(0); setCurrentWeight(0); setWeightHistoryLogs([]); setRecentWeightLogs([]);
    setConsumedCalories(0); setConsumedMacros({ protein: 0, fat: 0, carb: 0 });
    setAssignedMealsToday([]); setSelfMealsToday([]); setMealParse(null);
    chatsLoadedRef.current = null; setChatSessions([]); setActiveChatId(null); setEditingMessageId(null); setIsChatSidebarVisible(false);
    setTargetWeight(null); setStartWeight(null); setWorkoutBlocks([]); setPendingWorkoutPlan(null);
    setDailyCalorieNorm(0); setMaintenanceCalories(0); setDailyMacros({ protein: 0, fat: 0, carb: 0 }); setUserGoal('maintain');
    setSelectedMember(null); setMyDayPlan(null); setMemberDayPlan(null); setClientProfile(null);
    setCompanionBrief(null);
    if (restEndsAt) { setRestEndsAt(null); cancelScheduled(REST_TIMER_ID); }
    nutritionExtraRef.current = { key: '', t: ZERO };
  };

  // Сброс всего пользовательского стейта после выхода/удаления аккаунта.
  const clearUserState = () => {
    smoothStateUpdate(() => {
      resetUserScopedState();
      setAuthMode('login'); setCurrentTab('home'); setIsSideMenuVisible(false); setIsAddingAccount(false);
      setEmail(''); setPassword(''); setConfirmPassword(''); setName('');
    });
  };

  const loadHistory = async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    const { data, error } = await supabase.from('workouts').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    if (isStale(uid)) return;
    if (!error && data) setHistory(data as WorkoutRecord[]);
  };

  // --- ИИ-план тренировки ---
  // Бэкенд сам подтягивает реальную историю журнала пользователя (вес/повторы за
  // последние тренировки) и строит план на её основе — см. _summarize_workout_history
  // в backend/main.py. Ничего не сохраняем здесь: экран журнала превращает ответ прямо
  // в блоки конструктора (тот же UI, что и при ручном добавлении упражнения), и план
  // попадает в личный журнал только когда пользователь сам отметит выполненные подходы
  // и нажмёт «Добавить» — обычным addStructuredWorkout.
  const generateAiWorkoutPlan = async (muscleGroup: string, preferences: string): Promise<GeneratedWorkoutPlan | null> => {
    if (!muscleGroup.trim()) return null;
    setIsGeneratingPlan(true);
    try {
      const res = await generateWorkoutPlan(muscleGroup, preferences, session?.user?.id, await buildAiContext());
      if (res?.status === 'limit_reached') { appAlert('Лимит', `Генерация планов: ${res.limit}/день. Лимит на сегодня исчерпан.`); return null; }
      if (!res?.plan || !Array.isArray(res.plan.exercises)) throw new Error('ИИ вернул данные в неверном формате');
      return res.plan as GeneratedWorkoutPlan;
    } catch (e: any) {
      appAlert('Ошибка', e.message || 'Не удалось сгенерировать план');
      return null;
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const fetchGroups = async () => {
    const { data: ownedGroups } = await supabase.from('groups').select('*').eq('owner_id', session?.user?.id);
    const { data: memberLinks } = await supabase.from('group_members').select('group_id').eq('user_id', session?.user?.id);
    let joinedGroups: Group[] = [];
    if (memberLinks && memberLinks.length > 0) {
      const groupIds = memberLinks.map((link: any) => link.group_id);
      const { data: jGroups } = await supabase.from('groups').select('*').in('id', groupIds);
      if (jGroups) joinedGroups = jGroups as Group[];
    }
    const allGroups = [...(ownedGroups || []), ...joinedGroups];
    const uniqueGroups = Array.from(new Map(allGroups.map((item: Group) => [item.id, item])).values());
    if (isStale(session?.user?.id)) return;
    smoothStateUpdate(() => setGroups(uniqueGroups));
  };

  const fetchUpcomingSessions = async () => {
    try {
      // Роль берём из метаданных сессии (доступны сразу), а не из стейта userRole,
      // который при перезаходе обновляется на тик позже — иначе у тренера запросится
      // фильтр по client_id и календарь оказывается пустым.
      const role = session?.user?.user_metadata?.role || userRole;
      // Только сегодня и дальше: иначе прошедшие записи копятся в «Календаре записей» бесконечно.
      let query = supabase.from('training_sessions').select('*').gte('session_date', getCurrentDateString()).order('session_date', { ascending: true }).order('session_time', { ascending: true });
      if (role === 'trainer') query = query.eq('trainer_id', session?.user?.id); else query = query.eq('client_id', session?.user?.id);
      const { data: sessions, error } = await query;
      if (isStale(session?.user?.id)) return;
      if (error || !sessions) { setUpcomingSessions([]); return; }
      const groupIds = [...new Set(sessions.map((s: any) => s.group_id))];
      const clientIds = [...new Set(sessions.map((s: any) => s.client_id))];
      const { data: grps } = await supabase.from('groups').select('id, name').in('id', groupIds);
      const { data: profs } = await supabase.from('profiles').select('id, email, name').in('id', clientIds);
      const enriched: TrainingSession[] = sessions.map((sess: any) => {
        const profile = profs?.find((p: any) => p.id === sess.client_id);
        return { ...sess, group_name: grps?.find((g: any) => g.id === sess.group_id)?.name || 'Клуб', client_name: profile?.name || profile?.email?.split('@')[0] || 'Участник' } as TrainingSession;
      });
      smoothStateUpdate(() => setUpcomingSessions(enriched));
    } catch (err) {}
  };

  // --- Пуш-уведомления ---
  // Получаем Expo push-токен и сохраняем в Supabase (одна строка на устройство).
  const registerPushToken = async () => {
    if (!session?.user?.id) return;
    const token = await registerForPushNotificationsAsync();
    if (!token) return;
    try {
      await supabase.from('push_tokens').upsert(
        { token, user_id: session.user.id, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      );
    } catch {}
  };

  // Локальные напоминания клиенту о его ближайших тренировках (за час и в момент начала).
  const syncSessionReminders = async (sessions: TrainingSession[]) => {
    await cancelScheduledByPrefix('sess_');
    for (const s of sessions) {
      const start = new Date(`${s.session_date}T${s.session_time || '00:00'}`);
      if (isNaN(start.getTime())) continue;
      const hourBefore = new Date(start.getTime() - 60 * 60 * 1000);
      const where = s.group_name ? ` (${s.group_name})` : '';
      await scheduleLocalReminder(`sess_${s.id}_1h`, 'Скоро тренировка ⏰', `Через час в ${s.session_time}${where}`, hourBefore, { tab: 'home' });
      await scheduleLocalReminder(`sess_${s.id}_now`, 'Время тренировки 💪', `Тренировка начинается${where}`, start, { tab: 'home' });
    }
  };

  const fetchGroupDetails = async () => {
    try {
      const { data: members } = await supabase.from('group_members').select('*').eq('group_id', activeGroup?.id);
      if (members && members.length > 0) {
        const userIds = members.map((m: any) => m.user_id);
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);
        setGroupMembers(Array.isArray(profiles) ? profiles as GroupMember[] : []);
      } else setGroupMembers([]);
      const { data: workouts } = await supabase.from('assigned_workouts').select('*').eq('group_id', activeGroup?.id).eq('date', getCurrentDateString());
      setTodayWorkouts(Array.isArray(workouts) ? workouts as AssignedWorkout[] : []);
    } catch (e: any) {
      console.log('fetchGroupDetails error:', e?.message);
      setGroupMembers([]); setTodayWorkouts([]);
    }
  };

  const startScheduling = () => {
    smoothStateUpdate(() => {
      setScheduleStep('group'); setSchedDate(''); setSchedTime(''); setTempDate(new Date());
    });
    openAnimatedModal(setIsSchedulingVisible);
  };
  const selectGroupForSchedule = async (group: Group) => {
    setSchedSelectedGroup(group);
    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', group.id);
    if (members && members.length > 0) {
      const ids = members.map((m: any) => m.user_id);
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids);
      smoothStateUpdate(() => setGroupMembers(profs as GroupMember[] || []));
    } else smoothStateUpdate(() => setGroupMembers([]));
    smoothStateUpdate(() => setScheduleStep('member'));
  };
  const onDateChange = (event: any, selectedDate: Date | undefined) => {
    setDatePickerVisible(false);
    if (event.type === 'set' && selectedDate) { setTempDate(selectedDate); setSchedDate(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`); }
  };
  const onTimeChange = (event: any, selectedTime: Date | undefined) => {
    setTimePickerVisible(false);
    if (event.type === 'set' && selectedTime) { setTempDate(selectedTime); setSchedTime(`${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}`); }
  };

  const onAssignDateChange = (event: any, selectedDate: Date | undefined) => {
    setAssignDatePickerVisible(false);
    if (event.type === 'set' && selectedDate) { setAssignDateObj(selectedDate); setAssignWorkoutDate(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`); }
  };

  const saveTrainingSession = async () => {
    if (!schedDate || !schedTime || !schedSelectedMember) return;
    const { error } = await supabase.from('training_sessions').insert([{ group_id: schedSelectedGroup?.id, client_id: schedSelectedMember.id, trainer_id: session?.user?.id, session_date: schedDate, session_time: schedTime }]);
    if (error) appAlert("Ошибка", error.message);
    else {
      notifyUser(schedSelectedMember.id, 'Новая запись на тренировку 📅', `${schedDate} в ${schedTime}${schedSelectedGroup?.name ? ` · ${schedSelectedGroup.name}` : ''}`, { tab: 'home' });
      closeAnimatedModal(setIsSchedulingVisible); fetchUpcomingSessions(); setSchedSelectedGroup(null); setSchedSelectedMember(null);
    }
  };
  // Отмена записи — с подтверждением: раньше один промах по иконке корзины молча удалял
  // запись и отправлял клиенту пуш об отмене.
  const deleteSession = (id: string) => {
    const sess = upcomingSessions.find((s: TrainingSession) => s.id === id);
    appAlert('Отменить запись?', sess ? `${sess.client_name || 'Клиент'} · ${sess.session_date} в ${sess.session_time}. Клиент получит уведомление.` : undefined, [
      { text: 'Нет', style: 'cancel' },
      { text: 'Отменить запись', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('training_sessions').delete().eq('id', id);
        if (error) { appAlert('Ошибка', error.message); return; }
        if (sess?.client_id) notifyUser(sess.client_id, 'Запись отменена 📅', `${sess.session_date} в ${sess.session_time} — отменена`, { tab: 'home' });
        fetchUpcomingSessions();
      } },
    ]);
  };

  const loadMyDayPlan = async (date: string) => {
    if (!session?.user?.id || !activeGroup?.id) { setMyDayPlan(null); return; }
    const { data } = await supabase.from('assigned_workouts').select('*').eq('group_id', activeGroup.id).eq('client_id', session.user.id).eq('date', date).maybeSingle();
    setMyDayPlan((data as AssignedWorkout) || null);
  };
  const shiftMyPlanDate = (delta: number) => {
    const [y, m, d] = myPlanViewDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + delta);
    const ns = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    setMyPlanViewDate(ns);
    loadMyDayPlan(ns);
  };
  const loadMemberDayPlan = async () => {
    if (!selectedMember?.id || !activeGroup?.id) { setMemberDayPlan(null); return; }
    const { data } = await supabase.from('assigned_workouts').select('*').eq('group_id', activeGroup.id).eq('client_id', selectedMember.id).eq('date', assignWorkoutDate).maybeSingle();
    setMemberDayPlan((data as AssignedWorkout) || null);
  };

  // Профиль клиента для тренера: цель, прогресс по весу (старт→сейчас→цель), вода за сегодня.
  // Старт — самая ранняя запись weight_log (нужна trainer-read политика, см. db/phase2_trainer_reads.sql);
  // если её нет, откатываемся к текущему весу из profiles.
  const fetchClientProfile = async (clientId: string) => {
    try {
      const today = getCurrentDateString();
      const [profRes, startRes, waterRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', clientId).single(),
        supabase.from('weight_log').select('weight, created_at').eq('user_id', clientId).order('created_at', { ascending: true }).limit(1),
        supabase.from('water_log').select('liters').eq('user_id', clientId).eq('date', today).maybeSingle(),
      ]);
      const prof: any = profRes.data || {};
      const startWeight = (startRes.data && startRes.data[0]?.weight) || prof.weight || 0;
      setClientProfile({ ...prof, startWeight, waterToday: waterRes.data?.liters || 0 });
    } catch (e) {
      setClientProfile(null);
    }
  };

  const assignWorkoutToMember = async () => {
    if (!assignNote) return;
    setIsLoading(true);
    try {
      const aiData = await parseWorkout(assignNote, session?.user?.id);
      if (aiData?.status === 'limit_reached') { appAlert('Лимит разбора', `Разбор тренировок: ${aiData.limit}/день. Лимит на сегодня исчерпан.`); return; }
      if (!aiData || !Array.isArray(aiData.parsed_data)) throw new Error('ИИ вернул данные в неверном формате');
      const newExercises: WorkoutData[] = aiData.parsed_data.map((item: any, index: number) => ({ ...item, id: `task_${Date.now()}_${index}`, completed: false }));
      const targetDate = assignWorkoutDate;
      const { data: existingPlan } = await supabase.from('assigned_workouts').select('*').eq('group_id', activeGroup?.id).eq('client_id', selectedMember?.id).eq('date', targetDate).maybeSingle();
      let finalWorkoutData: WorkoutData[] = [];
      if (existingPlan) { finalWorkoutData = [...(existingPlan.workout_data || []), ...newExercises]; } else { finalWorkoutData = newExercises; }
      const { error } = await supabase.from('assigned_workouts').upsert({ group_id: activeGroup?.id, client_id: selectedMember?.id, trainer_id: session?.user?.id, date: targetDate, workout_data: finalWorkoutData }, { onConflict: 'client_id, date' });
      if (error) throw error;
      if (selectedMember?.id) notifyUser(selectedMember.id, 'Новый план тренировки 🏋️', `Тренер обновил тренировку на ${targetDate === getCurrentDateString() ? 'сегодня' : targetDate}`, { tab: 'club' });
      setAssignNote(''); fetchGroupDetails(); loadMemberDayPlan(); appAlert('Успех', 'План дополнен!');
    } catch (e: any) { appAlert('Ошибка', e.message); } finally { setIsLoading(false); }
  };

  const toggleExerciseStatus = async (workoutId: string, exerciseId: string | undefined, currentStatus: boolean) => {
    const workoutToUpdate = todayWorkouts.find((w: AssignedWorkout) => w.id === workoutId);
    if (!workoutToUpdate) return;
    const isNowCompleted = !currentStatus;
    const updatedPlan = workoutToUpdate.workout_data.map((ex: WorkoutData) => ex.id === exerciseId ? { ...ex, completed: isNowCompleted } : ex);
    smoothStateUpdate(() => setTodayWorkouts((prev: AssignedWorkout[]) => prev.map((w: AssignedWorkout) => w.id === workoutId ? { ...w, workout_data: updatedPlan } : w)));
    await supabase.from('assigned_workouts').update({ workout_data: updatedPlan }).eq('id', workoutId);
    if (workoutToUpdate.client_id === session?.user?.id) {
      const exerciseData = updatedPlan.find((e: WorkoutData) => e.id === exerciseId);
      if (exerciseData) await registerActivityForWeightLoss([exerciseData], isNowCompleted);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const { data, error } = await supabase.from('groups').insert([{ name: newGroupName, code: randomCode, owner_id: session?.user?.id }]).select();
    if (error) { appAlert("Ошибка", error.message); return; }
    const created = (data as Group[] | null)?.[0];
    if (!created) { appAlert("Ошибка", "Не удалось создать клуб. Попробуйте ещё раз."); return; }
    setNewGroupName('');
    closeAnimatedModal(setIsCreatingGroup);
    await fetchGroups();
  };

  // Вступление по коду (общая логика для модалки и для пригласительной ссылки).
  const joinByInviteCode = async (rawCode: string) => {
    const code = (rawCode || '').trim();
    if (code.length < 6) return;
    // Поиск по коду и вступление — через защищённую RPC (groups закрыт RLS).
    const { data, error } = await supabase.rpc('join_group_by_code', { p_code: code });
    if (error) {
      const notFound = (error.message || '').includes('group_not_found');
      appAlert("Ошибка", notFound ? "Клуб не найден." : error.message);
      return;
    }
    const targetGroup = (Array.isArray(data) ? data[0] : data) as Group;
    if (!targetGroup) { appAlert("Ошибка", "Клуб не найден."); return; }
    const already = groups.some((g: Group) => g.id === targetGroup.id);
    await fetchGroups();
    smoothStateUpdate(() => { setActiveGroup(targetGroup); setCurrentTab('club'); }); // сразу заходим в клуб
    appAlert(already ? "Инфо" : "Успех", already ? `Вы уже в клубе «${targetGroup.name}».` : `Вы вступили в клуб «${targetGroup.name}»!`);
  };

  const joinGroup = async () => {
    if (joinCode.length < 6) return;
    const code = joinCode;
    smoothStateUpdate(() => setJoinCode(''));
    closeAnimatedModal(setIsJoiningGroup);
    await joinByInviteCode(code);
  };

  // Пригласительная ссылка: как только есть сессия и отложенный код — вступаем автоматически.
  useEffect(() => {
    if (session?.user?.id && pendingInviteCode) {
      const code = pendingInviteCode;
      setPendingInviteCode(null);
      joinByInviteCode(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pendingInviteCode]);

  // Удаление клуба стирает всех участников и назначенные планы — спрашиваем ещё раз.
  const deleteOrLeaveGroup = (group: Group) => {
    const isOwner = group.owner_id === session?.user?.id;
    appAlert(isOwner ? 'Удалить клуб?' : 'Выйти из клуба?',
      isOwner ? `«${group.name}» будет удалён вместе со списком участников и назначенными планами.` : `Вы перестанете видеть планы тренера клуба «${group.name}».`, [
      { text: 'Отмена', style: 'cancel' },
      { text: isOwner ? 'Удалить' : 'Выйти', style: 'destructive', onPress: async () => {
        const { error } = isOwner
          ? await supabase.from('groups').delete().eq('id', group.id)
          : await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', session?.user?.id);
        if (error) { appAlert('Ошибка', error.message); return; }
        smoothStateUpdate(() => { setGroups(prev => prev.filter((g: Group) => g.id !== group.id)); setActiveGroup(null); });
      } },
    ]);
  };

  // Тренер убирает подходы из назначенного плана (раньше можно было только дописывать).
  const removeAssignedExercises = async (exerciseIds: string[]) => {
    const plan = memberDayPlan;
    if (!plan || !exerciseIds.length) return;
    const remaining = (plan.workout_data || []).filter(ex => !exerciseIds.includes(ex.id || ''));
    smoothStateUpdate(() => {
      setMemberDayPlan({ ...plan, workout_data: remaining });
      setTodayWorkouts(prev => prev.map(w => (w.id === plan.id ? { ...w, workout_data: remaining } : w)));
    });
    const { error } = remaining.length
      ? await supabase.from('assigned_workouts').update({ workout_data: remaining }).eq('id', plan.id)
      : await supabase.from('assigned_workouts').delete().eq('id', plan.id);
    if (error) { appAlert('Ошибка', error.message); loadMemberDayPlan(); }
  };

  const handleDeleteAccount = () => {
    appAlert("Удаление аккаунта", "Профиль, тренировки, питание и история веса будут удалены навсегда. Продолжить?", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: async () => {
          setIsLoading(true);
          try {
            // Сначала сам аккаунт (RPC удаляет пользователя, строки уходят каскадом — см.
            // db/fix_user_delete_cascade.sql). Раньше ошибки глушились: при сбое RPC человека
            // разлогинивало, а аккаунт оставался — он думал, что данные удалены.
            const { error } = await supabase.rpc('delete_user');
            if (error) throw error;
            const uid = session?.user?.id;
            // meal_log и water_log не связаны внешним ключом с auth.users (см. db/phase0_meals_water.sql)
            // и каскадом не удаляются — без этого еда и вода удалённого человека могли оставаться в базе.
            // Токен ещё действителен, RLS разрешает удалять свои строки. Остальные таблицы —
            // подстраховка на случай, если каскад в базе не настроен (иначе это пустые операции).
            if (uid) {
              await Promise.allSettled([
                supabase.from('meal_log').delete().eq('user_id', uid),
                supabase.from('water_log').delete().eq('user_id', uid),
                supabase.from('assigned_meals').delete().eq('client_id', uid),
                supabase.from('weight_log').delete().eq('user_id', uid),
                supabase.from('workouts').delete().eq('user_id', uid),
                supabase.from('group_members').delete().eq('user_id', uid),
                supabase.from('profiles').delete().eq('id', uid),
              ]);
              await Promise.allSettled([kvRemove(`chatSessions_${uid}`), kvRemove(`companionBrief_${uid}`), kvRemove(`weight_logs_${uid}`)]);
            }
            await persistAccounts((await kvGetJSON<SavedAccount[]>('savedAccounts', [])).filter(a => a.id !== uid));
            await supabase.auth.signOut({ scope: 'local' });
            // Как при «Выйти»: иначе на экране входа оставались почта и пароль удалённого аккаунта.
            clearUserState();
          } catch (e: any) {
            appAlert('Не удалось удалить аккаунт', translateAuthError(e));
          } finally { setIsLoading(false); }
        }
      }
    ]);
  };

  const handleLogin = async () => {
    const em = email.trim().toLowerCase();
    if (!em || !password) { appAlert('Вход', 'Введите email и пароль.'); return; }
    setIsLoadingAuth(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password });
      if (error) throw error;
      if (data.session) await rememberAccountSession(data.session);
      setPassword('');
      if (isAddingAccount) {
        setIsSwitchingAccount(true);
        smoothStateUpdate(() => { setIsAddingAccount(false); setCurrentTab('home'); });
        setTimeout(() => setIsSwitchingAccount(false), 400);
      }
    } catch (error: unknown) { appAlert('Ошибка входа', translateAuthError(error)); } finally { setIsLoadingAuth(false); }
  };

  // Проверяем email/пароль ДО анкеты: раньше ошибка «пароль короче 6 символов» (ещё и
  // по-английски) приходила только в самом конце, после всех шагов регистрации.
  const handleCredentialsNext = () => {
    if (!name.trim()) { appAlert('Регистрация', 'Введите имя или никнейм.'); return; }
    if (!isValidEmail(email)) { appAlert('Регистрация', 'Проверьте email — похоже, в нём опечатка.'); return; }
    if (password.length < 6) { appAlert('Регистрация', 'Пароль должен быть не короче 6 символов.'); return; }
    if (password !== confirmPassword) { appAlert('Регистрация', 'Пароли не совпадают.'); return; }
    smoothStateUpdate(() => setAuthMode('register_goal'));
  };

  const handleGoalNext = (selectedGoal: string) => {
    setGoal(selectedGoal);
    smoothStateUpdate(() => {
      if (selectedGoal === 'maintain') setAuthMode('register_frequency'); else setAuthMode('register_target_weight');
    });
  };

  const handleFinalRegister = async () => {
    if (!userGender) { appAlert("Ошибка", "Пожалуйста, выберите пол"); return; }
    setIsLoadingAuth(true);
    try {
      const em = email.trim().toLowerCase();
      const nm = name.trim();
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: em, password, options: { data: { role: userRole, name: nm } } });
      if (authError) throw authError;
      // Supabase не выдаёт ошибку на уже занятый email (защита от перебора) — только пустой identities.
      if (authData.user && Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
        appAlert('Регистрация', 'Аккаунт с таким email уже есть. Попробуйте войти.');
        smoothStateUpdate(() => setAuthMode('login'));
        return;
      }
      // Включено подтверждение почты: сессии ещё нет, профиль сохранить нельзя (RLS).
      if (authData.user && !authData.session) {
        appAlert('Подтвердите email', `Мы отправили письмо на ${em}. Перейдите по ссылке из письма, затем войдите.`);
        smoothStateUpdate(() => { setAuthMode('login'); setPassword(''); setConfirmPassword(''); });
        return;
      }
      if (authData.user) {
        const fullHeight = parseFloat(`${userHeightWhole}.${userHeightDec}`);
        const fullWeight = parseFloat(`${userWeightWhole}.${userWeightDec}`);
        const finalTargetWeight = (goal === 'lose' || goal === 'gain') ? parseFloat(`${targetWeightWhole}.${targetWeightDec}`) : null;
        const profilePayload = { id: authData.user.id, role: userRole, email: em, name: nm, goal: goal || null, target_weight: finalTargetWeight, workouts_per_week: workoutsPerWeek || null, height: fullHeight, weight: fullWeight, age: userAge, gender: userGender };
        const { error: profileError } = await supabase.from('profiles').insert([profilePayload]);
        if (profileError) appAlert('Профиль не сохранён', `${translateAuthError(profileError)} Данные анкеты можно будет указать позже.`);
        await supabase.from('weight_log').insert([{ user_id: authData.user.id, weight: fullWeight }]);
        if (authData.session) await rememberAccountSession(authData.session, { name: nm, role: userRole || '' });
        // Норму считаем здесь же: загрузка профиля при появлении сессии стартует параллельно с
        // insert выше и находит пустой профиль — без этого новичок видел «0 / --- ккал» до перезапуска.
        const t = computeNutritionTargets({
          weight: fullWeight, height: fullHeight, age: userAge, gender: userGender,
          workoutsPerWeek: workoutsPerWeek || null, goal: goal || null,
        });
        smoothStateUpdate(() => {
          setCurrentWeight(fullWeight); setStartWeight(fullWeight); setUserGoal(goal || 'maintain'); setTargetWeight(finalTargetWeight);
          setMaintenanceCalories(t.maintenanceCalories); setDailyCalorieNorm(t.dailyCalorieNorm); setDailyMacros(t.macros);
          setPassword(''); setConfirmPassword('');
          if (isAddingAccount) { setIsAddingAccount(false); setCurrentTab('home'); }
        });
      }
    } catch (error: unknown) { appAlert('Ошибка регистрации', translateAuthError(error)); } finally { setIsLoadingAuth(false); }
  };

  // ===================== ЖУРНАЛ ТРЕНИРОВОК =====================
  // Добавить подходы в «сегодня»: дописываем в сегодняшнюю строку workouts или создаём новую.
  const appendToTodayWorkout = async (parsed: WorkoutData[], rawText: string) => {
    const uid = session?.user?.id;
    const { data: latestWorkouts } = await supabase.from('workouts').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(1);
    const last = latestWorkouts?.[0];
    if (last && new Date(last.created_at).toDateString() === new Date().toDateString()) {
      const { error } = await supabase.from('workouts').update({ raw_text: `${last.raw_text || ''}\n${rawText}`.trim(), parsed_data: [...(last.parsed_data || []), ...parsed] }).eq('id', last.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('workouts').insert([{ raw_text: rawText, parsed_data: parsed, user_id: uid }]);
      if (error) throw error;
    }
  };

  const sendToAI = async (noteText: string): Promise<boolean> => {
    if (!noteText.trim()) return false;
    setIsLoading(true);
    try {
      const data = await parseWorkout(noteText, session?.user?.id);
      if (data?.status === 'limit_reached') { appAlert('Лимит разбора', `Разбор тренировок: ${data.limit}/день. Лимит на сегодня исчерпан, завтра обновится.`); return false; }
      const newParsedData: WorkoutData[] = (data?.parsed_data || []).filter((x: any) => x && x.exercise);
      // Раньше пустой разбор всё равно сохранялся «тренировкой» без подходов и показывал «Успех».
      if (newParsedData.length === 0) {
        appAlert('Не удалось распознать', 'Напишите упражнение, вес и повторы, например: «Жим лёжа 60кг 3 по 10».');
        return false;
      }
      const withIds: WorkoutData[] = newParsedData.map((ex, i) => ({ ...ex, id: `manual_${Date.now()}_${i}` }));
      await appendToTodayWorkout(withIds, noteText.trim());
      loadHistory();
      await registerActivityForWeightLoss(withIds, true);
      appAlert('Записано 💪', `Добавлено в журнал: ${withIds.length} ${plural(withIds.length, ['подход', 'подхода', 'подходов'])}.`);
      return true;
    } catch (e: any) { appAlert('Ошибка связи', e.message); return false; } finally { setIsLoading(false); }
  };

  // Запись тренировки, собранной из списка упражнений (без ИИ — данные уже структурированы).
  const addStructuredWorkout = async (items: { exercise: string; weight: number; reps: number }[]): Promise<boolean> => {
    if (!items || items.length === 0) return false;
    setIsLoading(true);
    try {
      const parsed: WorkoutData[] = items.map((it, i) => ({ exercise: it.exercise, weight: Number(it.weight) || 0, reps: Number(it.reps) || 0, id: `manual_${Date.now()}_${i}` }));
      const rawText = parsed.map(p => `${p.exercise} ${p.weight}кг x ${p.reps}`).join('\n');
      await appendToTodayWorkout(parsed, rawText);
      loadHistory();
      await registerActivityForWeightLoss(parsed, true);
      appAlert('Тренировка записана 💪', `Добавлено в журнал: ${parsed.length} ${plural(parsed.length, ['подход', 'подхода', 'подходов'])}.`);
      return true;
    } catch (e: any) { appAlert('Ошибка', e.message); return false; } finally { setIsLoading(false); }
  };

  // Удалить подходы из истории (ошибка ввода, разбор ИИ ошибся). Раньше записи в журнале
  // нельзя было ни исправить, ни удалить — неверный подход навсегда портил рекорды и статистику.
  const deleteJournalSets = async (refs: { _rid: string; _idx: number }[]) => {
    if (!refs.length) return;
    const byRid = new Map<string, Set<number>>();
    refs.forEach(r => byRid.set(r._rid, (byRid.get(r._rid) || new Set()).add(r._idx)));
    const jobs: PromiseLike<{ error: any }>[] = [];
    const next: WorkoutRecord[] = [];
    for (const rec of history) {
      const del = byRid.get(rec.id);
      if (!del) { next.push(rec); continue; }
      const remaining = (rec.parsed_data || []).filter((_, i) => !del.has(i));
      if (remaining.length) {
        next.push({ ...rec, parsed_data: remaining });
        jobs.push(supabase.from('workouts').update({ parsed_data: remaining }).eq('id', rec.id));
      } else {
        jobs.push(supabase.from('workouts').delete().eq('id', rec.id));
      }
    }
    smoothStateUpdate(() => setHistory(next));
    const results = await Promise.all(jobs);
    if (results.some(r => r.error)) appAlert('Ошибка', 'Не удалось удалить запись. Проверьте подключение.');
    loadHistory();
  };

  // ===================== ПИТАНИЕ: самозапись =====================
  // Клиент пишет «на завтрак..., на обед..., на ужин...» — делим на приёмы, каждый на продукты с КБЖУ.
  const calcClientMeals = async (text: string, mealType?: string) => {
    if (!text.trim()) return;
    setIsMealPreviewLoading(true);
    try {
      const data = await parseMeals(text, session?.user?.id);
      if (data?.status === 'limit_reached') { appAlert('Лимит разбора', `Разбор еды: ${data.limit}/день. Лимит на сегодня исчерпан, завтра обновится.`); return; }
      if (!data || data.error || !Array.isArray(data.meals)) throw new Error('Не удалось разобрать еду. Попробуйте описать иначе.');
      const meals: MealItem[] = data.meals.map((meal: any, mi: number) => {
        const items: FoodItem[] = (meal.items || []).map((it: any) => ({ name: it.name || 'блюдо', calories: Number(it.calories) || 0, protein: Number(it.protein) || 0, fat: Number(it.fat) || 0, carbs: Number(it.carbs) || 0 }));
        const t = items.reduce((a, i) => ({ c: a.c + i.calories, p: a.p + i.protein, f: a.f + i.fat, cb: a.cb + i.carbs }), { c: 0, p: 0, f: 0, cb: 0 });
        return { id: `meal_${Date.now()}_${mi}`, meal_type: meal.meal_type || 'snack', name: items.map(i => i.name).join(', '), items, calories: t.c, protein: t.p, fat: t.f, carbs: t.cb, eaten: false };
      }).filter((m: MealItem) => (m.items || []).length > 0);
      if (meals.length === 0) throw new Error('Не нашли продуктов в тексте. Например: «200г творога и банан».');
      // Если приём один — берём выбранный в выпадающем списке; если ИИ нашёл несколько (в тексте «на завтрак…, на обед…») — уважаем его разметку.
      if (mealType && meals.length === 1) meals[0].meal_type = mealType;
      smoothStateUpdate(() => setMealParse(meals));
    } catch (e: any) {
      appAlert('Ошибка', e.message);
    } finally {
      setIsMealPreviewLoading(false);
    }
  };

  const confirmClientMeals = async () => {
    if (!mealParse || mealParse.length === 0) return;
    const rows = mealParse.map(m => ({ name: m.name, meal_type: m.meal_type, items: m.items, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs, source: 'self' }));
    closeAnimatedModal(setIsMealModalVisible);
    setMealParse(null);
    await insertMealRows(rows);
  };

  // ===================== ИИ-КОМПАНЬОН =====================
  // Снимок приложения для ИИ: всё, что компаньон «знает» о пользователе (см. utils/companion.ts).
  const buildAiContext = async (): Promise<string> => {
    const uid = session?.user?.id;
    // План от тренера на сегодня. todayWorkouts есть только у открытого клуба, поэтому спрашиваем базу.
    let trainerPlanToday: WorkoutData[] | null = null;
    if (uid) {
      try {
        const { data } = await supabase.from('assigned_workouts').select('workout_data').eq('client_id', uid).eq('date', getCurrentDateString()).maybeSingle();
        trainerPlanToday = (data?.workout_data as WorkoutData[]) || null;
      } catch {}
    }
    return buildCompanionContext({
      name: displayName, role: session?.user?.user_metadata?.role || userRole, goal: userGoal,
      currentWeight, startWeight, targetWeight,
      weightLogs: recentWeightLogs.length ? recentWeightLogs : weightHistoryLogs,
      dailyCalorieNorm, maintenanceCalories, dailyMacros, consumedCalories, consumedMacros,
      selfMeals: selfMealsRef.current, assignedMeals: assignedMealsRef.current, waterLiters: waterRef.current,
      dayGroups: journalDayGroups, exerciseStats, summary: workoutSummary,
      trainerPlanToday, upcomingSessions, builderBlocks: workoutBlocks,
    });
  };

  const setCompanionPersona = (p: CompanionPersona) => {
    setCompanionPersonaState(p);
    kvSet('companionPersona', p);
  };

  // Что ответ чата записал в дневник. Числа приводим явно: строка "330" от ИИ склеилась бы
  // с суммой ("1200" + "330" = "1200330").
  const chatNutrition = (data: any): ChatMessage['logged'] => {
    const n = (v: any) => Math.max(0, Math.round(Number(v) || 0));
    const calories = n(data?.calories);
    if (calories <= 0) return undefined;
    return { date: getCurrentDateString(), calories, protein: n(data.protein), fat: n(data.fat), carbs: n(data.carbs) };
  };

  const guessMealType = () => {
    const h = new Date().getHours();
    return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
  };

  const appendToChat = (chatId: string, msg: ChatMessage) =>
    smoothStateUpdate(() => setChatSessions(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() } : c)));

  // Один шаг диалога: шлём историю + снимок приложения, выполняем действия, которые попросил
  // компаньон (записать еду / воду / вес), и добавляем его ответ с отметками о сделанном.
  const runCompanionTurn = async (chatId: string, messages: ChatMessage[]) => {
    setIsChatLoading(true);
    const apiMessages = messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
    const lastUserText = [...messages].reverse().find(m => m.sender === 'user')?.text || '';
    try {
      const appContext = await buildAiContext();
      const data = await sendChat(apiMessages, session?.user?.id, dailyCalorieNorm, dailyMacros, appContext, companionPersona);
      if (data?.limit_reached) {
        appendToChat(chatId, { id: (Date.now() + 1).toString(), text: `Дневной лимит ИИ-чата исчерпан (${data.limit}/день). Лимит обновится завтра.`, sender: 'ai' });
        return;
      }
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: data.reply || "К сожалению я не могу вам с этим помочь", sender: 'ai', workoutPlan: data.workout_plan || undefined };

      const logged = chatNutrition(data);
      if (logged) {
        const [row] = await insertMealRows([{
          name: lastUserText.slice(0, 80) || 'Запись из чата', meal_type: guessMealType(),
          items: [{ name: lastUserText.slice(0, 80) || 'блюдо', calories: logged.calories, protein: logged.protein, fat: logged.fat, carbs: logged.carbs }],
          calories: logged.calories, protein: logged.protein, fat: logged.fat, carbs: logged.carbs, source: 'chat',
        }]);
        aiMsg.logged = row ? { ...logged, rowId: row.id } : logged;
      }
      const waterMl = Number(data.water_ml) || 0;
      if (waterMl > 0) {
        const added = await addWaterAmount(waterMl / 1000);
        if (added > 0) aiMsg.waterLogged = { date: getCurrentDateString(), liters: added };
      }
      const weightKg = Number(data.weight_kg) || 0;
      if (weightKg > 0 && (await recordWeight(weightKg))) aiMsg.weightLogged = weightKg;

      appendToChat(chatId, aiMsg);
    } catch (error) {
      appendToChat(chatId, { id: (Date.now() + 1).toString(), text: "Не удалось связаться с ИИ. Проверьте интернет и попробуйте ещё раз.", sender: 'ai' });
    } finally { setIsChatLoading(false); }
  };

  const createNewChat = () => { smoothStateUpdate(() => { setActiveChatId(null); setIsChatSidebarVisible(false); setEditingMessageId(null); }); };

  const deleteChat = (id: string) => {
    appAlert("Удаление", "Удалить этот диалог?", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => { smoothStateUpdate(() => { setChatSessions(prev => prev.filter(c => c.id !== id)); if (activeChatId === id) setActiveChatId(null); }); }}
    ]);
  };

  const startEditMessage = (msg: ChatMessage) => { smoothStateUpdate(() => { setEditingMessageId(msg.id); setEditInput(msg.text); }); };

  const saveEditMessage = async () => {
    if (!activeChatId || !editingMessageId || !editInput.trim() || isChatLoading) return;
    const chat = chatSessions.find(c => c.id === activeChatId);
    if (!chat) return;

    const msgIndex = chat.messages.findIndex(m => m.id === editingMessageId);
    if (msgIndex === -1) return;

    const updatedMessages = [...chat.messages.slice(0, msgIndex), { ...chat.messages[msgIndex], text: editInput.trim() }];
    // Ответы после правленного сообщения удаляются — откатываем то, что они записали сегодня
    // (еду и воду), иначе «я съел 200г курицы» → правка на 150г записывало курицу второй раз.
    const today = getCurrentDateString();
    const undone = chat.messages.slice(msgIndex + 1);
    const rowIds = undone.filter(m => m.logged?.date === today && m.logged.rowId).map(m => m.logged!.rowId!);
    const legacy = undone.filter(m => m.logged?.date === today && !m.logged.rowId)
      .reduce((a, m) => addT(a, { c: m.logged!.calories, p: m.logged!.protein, f: m.logged!.fat, cb: m.logged!.carbs }), ZERO);
    const water = undone.filter(m => m.waterLogged?.date === today).reduce((a, m) => a + (m.waterLogged?.liters || 0), 0);

    smoothStateUpdate(() => {
      setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: updatedMessages, updatedAt: Date.now() } : c));
      setEditingMessageId(null);
    });
    if (rowIds.length) {
      const next = selfMealsRef.current.filter(m => !rowIds.includes(m.id));
      setSelfMealsToday(next); selfMealsRef.current = next;
      await supabase.from('meal_log').delete().in('id', rowIds);
    }
    if (legacy.c > 0) await setExtra(subT(await getExtra(), legacy));
    if (rowIds.length || legacy.c > 0) await recomputeTotals(assignedMealsRef.current, selfMealsRef.current);
    if (water > 0) await addWaterAmount(-water);

    await runCompanionTurn(activeChatId, updatedMessages);
  };

  // Кнопка "Добавить в тренировку" под сообщением чата: кладём план в pendingWorkoutPlan
  // и переключаемся на вкладку журнала — там он подхватится и станет блоками конструктора.
  const sendPlanToJournal = (plan: GeneratedWorkoutPlan) => {
    setPendingWorkoutPlan(plan);
    handleTabChange('workout');
  };

  const handleSendChatMessage = async (messageText: string, opts?: { newChat?: boolean }) => {
    const text = messageText.trim();
    if (!text || isChatLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), text, sender: 'user' };

    let chatId = opts?.newChat ? null : activeChatId;
    const activeChat = chatId ? chatSessions.find(c => c.id === chatId) : undefined;
    if (!activeChat) chatId = null; // активный диалог могли удалить
    const isNewChat = !chatId;
    if (!chatId) { chatId = Date.now().toString(); setActiveChatId(chatId); }

    const generatedTitle = text.length > 25 ? text.substring(0, 25) + '...' : text;
    const newSessionContent: ChatSession = isNewChat
        ? { id: chatId, title: generatedTitle, messages: [userMsg], updatedAt: Date.now() }
        : { ...activeChat!, messages: [...activeChat!.messages, userMsg], updatedAt: Date.now(), title: activeChat!.title === 'Новый диалог' ? generatedTitle : activeChat!.title };

    smoothStateUpdate(() => setChatSessions(prev => isNewChat ? [newSessionContent, ...prev] : prev.map(c => c.id === chatId ? newSessionContent : c)));
    await runCompanionTurn(chatId, newSessionContent.messages);
  };

  // «Спросить компаньона» с любого экрана: новый диалог во вкладке чата с готовым вопросом.
  const askCompanion = (question: string) => {
    smoothStateUpdate(() => { setIsChatSidebarVisible(false); setEditingMessageId(null); });
    handleTabChange('chat');
    handleSendChatMessage(question, { newChat: true });
  };

  // Совет дня для карточки на главном: раз в день (кэш в хранилище), вручную — по кнопке.
  const briefKey = () => `companionBrief_${session?.user?.id || 'guest'}`;
  const loadCachedBrief = async () => {
    const b = await kvGetJSON<CompanionBrief | null>(briefKey(), null);
    if (b && b.date === getCurrentDateString()) setCompanionBrief(b);
  };
  const briefBusyRef = useRef(false);
  // Автозапрос — не чаще раза в день на аккаунт, даже если он не удался (нет сети, лимит):
  // иначе каждый заход на главный экран снова стучался бы в ИИ.
  const briefAutoTriedRef = useRef('');
  const refreshCompanionBrief = async (force = false) => {
    const today = getCurrentDateString();
    if (!session?.user?.id || briefBusyRef.current) return;
    if (!force && companionBrief?.date === today) return;
    const triedKey = `${session.user.id}_${today}`;
    if (!force && briefAutoTriedRef.current === triedKey) return;
    briefAutoTriedRef.current = triedKey;
    briefBusyRef.current = true;
    setIsBriefLoading(true);
    try {
      const res = await fetchCompanionBrief(await buildAiContext(), companionPersona, session.user.id);
      if (res?.status === 'success' && res.message) {
        const b: CompanionBrief = { date: today, headline: res.headline, message: res.message, suggestion: res.suggestion };
        setCompanionBrief(b);
        kvSetJSON(briefKey(), b);
      } else if (res?.status === 'limit_reached' && force) {
        appAlert('Лимит', `Дневной лимит ИИ (${res.limit}) исчерпан. Обновится завтра.`);
      }
    } catch (e: any) {
      if (force) appAlert('Компаньон недоступен', e?.message || 'Попробуйте позже.');
    } finally {
      briefBusyRef.current = false;
      setIsBriefLoading(false);
    }
  };

  // ===================== ВОДА =====================
  // Вода в БД (Фаза 5): персист в water_log, чтобы переживала перезапуск и была видна тренеру.
  const loadTodayWater = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase.from('water_log').select('liters').eq('user_id', session.user.id).eq('date', getCurrentDateString()).maybeSingle();
    if (isStale(session.user.id)) return;
    waterRef.current = data?.liters || 0;
    setWaterIntake(data?.liters || 0);
  };
  const persistWater = async (liters: number) => {
    if (!session?.user?.id) return;
    await supabase.from('water_log').upsert({ user_id: session.user.id, date: getCurrentDateString(), liters }, { onConflict: 'user_id, date' });
  };
  const WATER_MAX = 6;
  // Изменить воду на delta литров (может быть < 0). Возвращает фактическое изменение.
  const addWaterAmount = async (delta: number): Promise<number> => {
    const cur = waterRef.current;
    const next = Math.max(0, Math.min(WATER_MAX, parseFloat((cur + delta).toFixed(2))));
    if (next === cur) return 0;
    waterRef.current = next;
    smoothStateUpdate(() => setWaterIntake(next));
    await persistWater(next);
    return parseFloat((next - cur).toFixed(2));
  };
  const addWater = () => { addWaterAmount(0.2); };
  const removeWater = () => { addWaterAmount(-0.2); };
  const resetWater = () => { addWaterAmount(-waterRef.current); };

  // ===================== ТАЙМЕР ОТДЫХА =====================
  useEffect(() => { kvGet('restDuration').then(v => { const n = Number(v); if (v !== null && Number.isFinite(n)) setRestDuration(n); }); }, []);
  const scheduleRestNotification = async (endsAt: number) => {
    await cancelScheduled(REST_TIMER_ID);
    await scheduleLocalReminder(REST_TIMER_ID, 'Отдых окончен 💪', 'Пора делать следующий подход', new Date(endsAt), { tab: 'workout' });
  };
  const startRestTimer = (seconds = restDuration) => {
    if (!seconds || seconds <= 0) return;
    const endsAt = Date.now() + seconds * 1000;
    setRestEndsAt(endsAt);
    scheduleRestNotification(endsAt);
  };
  const adjustRestTimer = (deltaSec: number) => {
    if (!restEndsAt) return;
    const endsAt = Math.max(Date.now() + 1000, restEndsAt + deltaSec * 1000);
    setRestEndsAt(endsAt);
    scheduleRestNotification(endsAt);
  };
  const stopRestTimer = () => { setRestEndsAt(null); cancelScheduled(REST_TIMER_ID); };
  const changeRestDuration = (seconds: number) => { setRestDuration(seconds); kvSet('restDuration', String(seconds)); if (seconds === 0) stopRestTimer(); };

  // --- 📈 УЛУЧШЕННЫЙ ГРАФИК ВЕСА ---
  const chartDataMemo = useMemo(() => {
    const fallbackWeight = currentWeightRef.current > 0 ? currentWeightRef.current : 70;
    const defaultResult = {
      labels: ['Старт', 'Сейчас'],
      datasets: [{ data: [fallbackWeight, fallbackWeight] }],
      rawData: [fallbackWeight, fallbackWeight],
      min: fallbackWeight,
      max: fallbackWeight,
      avg: fallbackWeight,
      change: 0,
      startWeight: fallbackWeight,
      endWeight: fallbackWeight,
      daysTracked: 0,
      totalDaysTracked: 0,
      targetLineData: null as number[] | null,
      yMin: fallbackWeight - 3,
      yMax: fallbackWeight + 3,
      trend: 'stable' as 'up' | 'down' | 'stable',
    };

    if (!weightHistoryLogs || weightHistoryLogs.length === 0) return defaultResult;

    // Фильтрация по периоду
    let cutoff = new Date();
    if (chartPeriod === 'day') cutoff.setHours(0, 0, 0, 0);
    else if (chartPeriod === 'week') cutoff.setDate(cutoff.getDate() - 7);
    else if (chartPeriod === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
    else if (chartPeriod === 'year') cutoff.setFullYear(cutoff.getFullYear() - 1);
    else cutoff = new Date(0);

    const filtered = [...weightHistoryLogs]
      .filter((log: WeightLog) => new Date(log.created_at) >= cutoff)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (filtered.length === 0) return defaultResult;

    // Агрегация по дням — берём последнюю запись каждого дня
    const dayMap = new Map<string, { weight: number; created_at: string }>();
    filtered.forEach(log => {
      const d = new Date(log.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const existing = dayMap.get(key);
      if (!existing || new Date(log.created_at) > new Date(existing.created_at)) {
        dayMap.set(key, { weight: log.weight, created_at: log.created_at });
      }
    });

    const dailyData = Array.from(dayMap.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Подсчёт всех уникальных дней (за всё время)
    const allDaysSet = new Set<string>();
    weightHistoryLogs.forEach(log => {
      const d = new Date(log.created_at);
      allDaysSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });

    // Ограничение точек до 30 для читаемости
    let chartPoints = dailyData;
    if (dailyData.length > 30) {
      const step = Math.ceil(dailyData.length / 28);
      const sampled = dailyData.filter((_, i) => i === 0 || i === dailyData.length - 1 || i % step === 0);
      chartPoints = sampled;
    }

    if (chartPoints.length === 0) return defaultResult;

    const weights = chartPoints.map(d => d.weight);
    const minVal = Math.min(...weights);
    const maxVal = Math.max(...weights);
    const avgVal = weights.reduce((a, b) => a + b, 0) / weights.length;
    const startWeight = weights[0];
    const endWeight = weights[weights.length - 1];
    const changeVal = parseFloat((endWeight - startWeight).toFixed(1));

    // Определяем тренд
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (weights.length >= 3) {
      const recentAvg = weights.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = weights.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (recentAvg - olderAvg > 0.3) trend = 'up';
      else if (olderAvg - recentAvg > 0.3) trend = 'down';
    } else if (changeVal > 0.3) trend = 'up';
    else if (changeVal < -0.3) trend = 'down';

    // Расчёт границ Y-оси с отступами
    const range = maxVal - minVal;
    const padding = Math.max(range * 0.2, 1.0);
    let yMin = minVal - padding;
    let yMax = maxVal + padding;

    // Учитываем целевой вес
    const tw = targetWeightRef.current;
    if (tw && tw > 0) {
      yMin = Math.min(yMin, tw - 1.0);
      yMax = Math.max(yMax, tw + 1.0);
    }

    // Округляем до красивых чисел (по 0.5)
    yMin = Math.floor(yMin * 2) / 2;
    yMax = Math.ceil(yMax * 2) / 2;

    // Убеждаемся что минимум не <= 0
    yMin = Math.max(yMin, 1);

    // Формируем подписи
    let labels = chartPoints.map(d => {
      const date = new Date(d.created_at);
      if (chartPeriod === 'day') {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
      if (chartPeriod === 'year') {
        return date.toLocaleDateString('ru-RU', { month: 'short' });
      }
      return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
    });

    // Умное прореживание подписей — не более 6 видимых
    if (labels.length > 6) {
      const step = Math.ceil(labels.length / 5);
      labels = labels.map((l, i) =>
        i === 0 || i === labels.length - 1 || i % step === 0 ? l : ''
      );
    }

    // Данные линии целевого веса
    let targetLineData: number[] | null = null;
    if (tw && tw > 0) {
      targetLineData = new Array(weights.length).fill(tw);
    }

    // Один чистый датасет реальных значений. Раньше тут были «фантомные» датасеты
    // (целевая линия + линия границ оси) — chart-kit заливал площадь под каждым,
    // из-за чего появлялись лишние фиолетовые пятна заливки.
    const datasets: any[] = [
      {
        data: weights,
        strokeWidth: 3,
        color: (opacity = 1) => `rgba(167, 139, 250, ${opacity})`,
      },
    ];

    return {
      labels,
      datasets,
      rawData: weights,
      min: minVal,
      max: maxVal,
      avg: avgVal,
      change: changeVal,
      startWeight,
      endWeight,
      daysTracked: dailyData.length,
      totalDaysTracked: allDaysSet.size,
      targetLineData,
      yMin,
      yMax,
      trend,
    };
  }, [weightHistoryLogs, chartPeriod, currentWeight, targetWeight]);

  const displayName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Пользователь';

  return {
    // session / auth
    session, authReady, bootReady, isLoading, isLoadingAuth, isSwitchingAccount,
    authMode, setAuthMode, userRole, setUserRole, userGoal,
    name, setName, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword,
    goal, workoutsPerWeek, setWorkoutsPerWeek,
    userAge, setUserAge, userHeightWhole, setUserHeightWhole, userHeightDec, setUserHeightDec,
    userWeightWhole, setUserWeightWhole, userWeightDec, setUserWeightDec,
    targetWeightWhole, setTargetWeightWhole, targetWeightDec, setTargetWeightDec,
    userGender, setUserGender,
    handleLogin, handleCredentialsNext, handleGoalNext, handleFinalRegister,
    handleSignOut, handleSwitchAccount, handleAddAnotherAccount, handleDeleteAccount,
    savedAccounts, isAccountSwitcherVisible, setIsAccountSwitcherVisible,
    isAddingAccount, cancelAddAccount,
    displayName,

    // navigation / ui
    currentTab, setCurrentTab, isSideMenuVisible, setIsSideMenuVisible,
    handleTabChange, menuNavigate, smoothStateUpdate, openAnimatedModal, closeAnimatedModal,
    contentFadeAnim, modalOpacityAnim, modalScaleAnim,

    // weight / home
    currentWeight, targetWeight, startWeight, weightHistoryLogs,
    isWeightModalVisible, setIsWeightModalVisible,
    manualWeightWhole, setManualWeightWhole, manualWeightDec, setManualWeightDec,
    chartPeriod, setChartPeriod, chartDataMemo, handleManualWeightUpdate,
    waterIntake, addWater, removeWater, resetWater,

    // nutrition
    dailyCalorieNorm, maintenanceCalories, dailyMacros, consumedCalories, consumedMacros,
    isMealModalVisible, setIsMealModalVisible,
    isMealPreviewLoading, mealParse, setMealParse,
    calcClientMeals, confirmClientMeals,
    assignedMealsToday, selfMealsToday, toggleAssignedMealEaten, loadClientNutrition, deleteSelfMeal,

    // workout journal
    history, sendToAI, addStructuredWorkout,
    isGeneratingPlan, generateAiWorkoutPlan, pendingWorkoutPlan, setPendingWorkoutPlan, sendPlanToJournal,
    workoutBlocks, setWorkoutBlocks, journalDayGroups, deleteJournalSets,
    exerciseStats, workoutSummary,
    restEndsAt, restDuration, startRestTimer, adjustRestTimer, stopRestTimer, changeRestDuration,

    // groups / clubs
    groups, activeGroup, setActiveGroup, groupMembers, setGroupMembers, todayWorkouts, setTodayWorkouts,
    isCreatingGroup, setIsCreatingGroup, isJoiningGroup, setIsJoiningGroup,
    selectedMember, setSelectedMember, isMyWorkoutVisible, setIsMyWorkoutVisible,
    newGroupName, setNewGroupName, joinCode, setJoinCode, assignNote, setAssignNote,
    assignWorkoutDate, setAssignWorkoutDate, assignDateObj, setAssignDateObj, assignDatePickerVisible, setAssignDatePickerVisible, onAssignDateChange,
    myPlanViewDate, setMyPlanViewDate, myDayPlan, setMyDayPlan, shiftMyPlanDate, memberDayPlan,
    clientProfile,
    createGroup, joinGroup, deleteOrLeaveGroup, fetchGroupDetails,
    assignWorkoutToMember, toggleExerciseStatus, removeAssignedExercises,

    // scheduling / calendar
    upcomingSessions, isScheduleListVisible, setIsScheduleListVisible,
    isSchedulingVisible, setIsSchedulingVisible, scheduleStep, setScheduleStep,
    schedSelectedMember, setSchedSelectedMember, schedDate, schedTime,
    datePickerVisible, setDatePickerVisible, timePickerVisible, setTimePickerVisible, tempDate,
    startScheduling, selectGroupForSchedule, onDateChange, onTimeChange, saveTrainingSession, deleteSession,

    // chat
    chatSessions, activeChatId, setActiveChatId, isChatSidebarVisible, setIsChatSidebarVisible,
    editingMessageId, setEditingMessageId, editInput, setEditInput,
    isChatLoading, chatScrollRef,
    createNewChat, deleteChat, startEditMessage, saveEditMessage, handleSendChatMessage,

    // ИИ-компаньон
    companionPersona, setCompanionPersona, companionBrief, isBriefLoading, refreshCompanionBrief, askCompanion,
  };
}

type AppContextValue = ReturnType<typeof useAppController>;

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = useAppController();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
}
