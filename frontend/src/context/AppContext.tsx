import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { Platform, Alert, Animated, Easing, LayoutAnimation, ScrollView, Linking, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getCurrentDateString } from '../utils/date';
import { tgCheckoutUrl } from '../config/billing';
import { parseWorkout, parseMeals, calculateLoss, sendChat, getBackendUrl, notifyUser } from '../api/backend';
import { configureNotificationHandler, registerForPushNotificationsAsync, scheduleLocalReminder, cancelAllScheduled, Notifications } from '../lib/notifications';
import type {
  Session, WorkoutData, SavedAccount, Group, GroupMember, WeightLog,
  WorkoutRecord, AssignedWorkout, TrainingSession, ChatMessage, ChatSession, Macros, MealPreview,
  MealItem, MealLogRow, FoodItem,
} from '../types';

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

  // --- Подписки ---
  const [trainerUntil, setTrainerUntil] = useState<string | null>(null); // доступ к роли тренера до этой даты
  const [aiPlan, setAiPlan] = useState<string>('free');
  const [aiUntil, setAiUntil] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<null | 'trainer' | 'ai'>(null);
  // Тариф тренера, выбранный на экране регистрации до создания аккаунта: оплату
  // открываем, как только появится сессия (нужен userId, чтобы бот знал кого активировать).
  const [pendingTrainerPlan, setPendingTrainerPlan] = useState<string | null>(null);
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

  const [lastActivityTime, setLastActivityTime] = useState<number | null>(null);
  const [pendingExerciseCount, setPendingExerciseCount] = useState<number>(0);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isAccountSwitcherVisible, setIsAccountSwitcherVisible] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [isSideMenuVisible, setIsSideMenuVisible] = useState<boolean>(false);
  const [waterIntake, setWaterIntake] = useState<number>(0);
  const [history, setHistory] = useState<WorkoutRecord[]>([]);

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

  const handleTabChange = (tabName: string) => {
    if (tabName === currentTab) return;
    Animated.timing(contentFadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setCurrentTab(tabName);
      // Если состоишь ровно в одном клубе — открываем его сразу, без лишнего тапа по карточке.
      if (tabName === 'club' && !activeGroup && groups.length === 1) setActiveGroup(groups[0]);
      Animated.timing(contentFadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
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

      if (lastDate && lastDate !== today) {
        let savedNutr = Platform.OS !== 'web' ? await AsyncStorage.getItem(getNutritionKey(lastDate)) : window.localStorage.getItem(getNutritionKey(lastDate));
        let yesterdayCals = savedNutr ? (JSON.parse(savedNutr).calories || 0) : 0;

        if (dailyCalorieNorm > 0 && currentWeight > 0) {
          const diff = yesterdayCals - dailyCalorieNorm;
          const weightChange = diff / 7000.0;
          let newWeight = parseFloat((currentWeight + weightChange).toFixed(2));

          if (newWeight > 0 && session?.user?.id) {
            await supabase.from('profiles').update({ weight: newWeight }).eq('id', session.user.id);
            await supabase.from('weight_log').insert([{ user_id: session.user.id, weight: newWeight }]);
            const newLog: WeightLog = { id: Date.now().toString(), weight: newWeight, created_at: new Date().toISOString() };
            setWeightHistoryLogs(prev => [newLog, ...prev]);
            smoothStateUpdate(() => setCurrentWeight(newWeight));
            await fetchWeightLog();
          }
        }
      }

      if (lastDate !== today) {
         if (Platform.OS !== 'web') await AsyncStorage.setItem('lastSavedDate', today);
         else window.localStorage.setItem('lastSavedDate', today);
         loadTodayNutritionData();
         loadTodayWater();
      }
    } catch (e) { console.log("Midnight update error", e); }
  };

  useEffect(() => {
    if (dailyCalorieNorm > 0 && currentWeight > 0 && session) {
      performMidnightUpdate();
      const interval = setInterval(performMidnightUpdate, 60000);
      return () => clearInterval(interval);
    }
  }, [dailyCalorieNorm, currentWeight, session]);

  // Прогрев бэкенда при запуске: Render на бесплатном тарифе засыпает после простоя и просыпается
  // 30–60 сек. Будим его фоновым запросом сразу, чтобы к моменту чата/парсинга он уже был готов.
  useEffect(() => {
    fetch(`${getBackendUrl()}/health`).catch(() => {});
  }, []);

  useEffect(() => {
    const loadSavedAccounts = async () => {
      try {
        if (Platform.OS !== 'web') {
          const saved = await AsyncStorage.getItem('savedAccounts');
          if (saved) setSavedAccounts(JSON.parse(saved));
        } else {
          if (typeof window !== 'undefined') {
            const saved = window.localStorage.getItem('savedAccounts');
            if (saved) setSavedAccounts(JSON.parse(saved));
          }
        }
      } catch (e) {}
    };
    loadSavedAccounts();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.user_metadata?.role) setUserRole(session.user.user_metadata.role);
    }).finally(() => setAuthReady(true));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.user_metadata?.role) setUserRole(session.user.user_metadata.role);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

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
        fetchWeightLog(), loadTodayNutritionData(), loadClientNutrition(), loadTodayWater(),
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

  useEffect(() => {
    const checkPendingWeight = async () => {
      if (!session || !session.user || currentWeight <= 0) return;
      try {
        let timeStr = null;
        if (Platform.OS !== 'web') { timeStr = await AsyncStorage.getItem('lastActivityTime'); } else { timeStr = typeof window !== 'undefined' ? window.localStorage.getItem('lastActivityTime') : null; }

        if (!timeStr) return;
        const lastTime = parseInt(timeStr, 10);
        if (Date.now() - lastTime >= 3600000) {
          let savedPending = null;
          if (Platform.OS !== 'web') { savedPending = await AsyncStorage.getItem('pendingExercises'); } else { savedPending = typeof window !== 'undefined' ? window.localStorage.getItem('pendingExercises') : null; }

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
          if (Platform.OS !== 'web') { await AsyncStorage.removeItem('pendingExercises'); await AsyncStorage.removeItem('lastActivityTime'); } else { if (typeof window !== 'undefined') { window.localStorage.removeItem('pendingExercises'); window.localStorage.removeItem('lastActivityTime'); } }
          setPendingExerciseCount(0); setLastActivityTime(null);
        }
      } catch (e) {}
    };
    const interval = setInterval(checkPendingWeight, 30000);
    checkPendingWeight(); return () => clearInterval(interval);
  }, [session, currentWeight, userGoal]);

  const loadTodayNutritionData = async () => {
    try {
      const key = getNutritionKey();
      let saved = Platform.OS !== 'web' ? await AsyncStorage.getItem(key) : typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        smoothStateUpdate(() => {
          setConsumedCalories(parsed.calories || 0);
          setConsumedMacros({ protein: parsed.protein || 0, fat: parsed.fat || 0, carb: parsed.carbs || 0 });
        });
      } else {
        smoothStateUpdate(() => {
          setConsumedCalories(0);
          setConsumedMacros({ protein: 0, fat: 0, carb: 0 });
        });
      }
    } catch (e) {}
  };

  const saveNutritionDataLocally = async (cals: number, p: number, f: number, c: number) => {
    smoothStateUpdate(() => {
      setConsumedCalories(cals);
      setConsumedMacros({ protein: p, fat: f, carb: c });
    });
    const key = getNutritionKey();
    const val = JSON.stringify({ calories: cals, protein: p, fat: f, carbs: c });
    if (Platform.OS !== 'web') await AsyncStorage.setItem(key, val);
    else if (typeof window !== 'undefined') window.localStorage.setItem(key, val);
  };

  // Питание клиента из БД: меню от тренера на сегодня (assigned_meals) + что он записал сам (meal_log).
  const loadClientNutrition = async () => {
    if (!session?.user?.id) return;
    const today = getCurrentDateString();
    const { data: am } = await supabase.from('assigned_meals').select('meal_data').eq('client_id', session.user.id).eq('date', today).maybeSingle();
    setAssignedMealsToday((am?.meal_data as MealItem[]) || []);
    const { data: ml } = await supabase.from('meal_log').select('*').eq('user_id', session.user.id).eq('date', today).order('created_at', { ascending: true });
    setSelfMealsToday((ml as MealLogRow[]) || []);
  };

  // Клиент отмечает блюдо из плана как съеденное: пишем eaten в assigned_meals (видит тренер)
  // и двигаем дневные итоги КБЖУ на величину блюда.
  const toggleAssignedMealEaten = async (mealId: string) => {
    if (!session?.user?.id) return;
    const target = assignedMealsToday.find(m => m.id === mealId);
    if (!target) return;
    const nowEaten = !target.eaten;
    const updated = assignedMealsToday.map(m => m.id === mealId ? { ...m, eaten: nowEaten } : m);
    setAssignedMealsToday(updated);
    const sign = nowEaten ? 1 : -1;
    saveNutritionDataLocally(
      Math.max(0, consumedCalories + sign * target.calories),
      Math.max(0, consumedMacros.protein + sign * target.protein),
      Math.max(0, consumedMacros.fat + sign * target.fat),
      Math.max(0, consumedMacros.carb + sign * target.carbs)
    );
    await supabase.from('assigned_meals').update({ meal_data: updated }).eq('client_id', session.user.id).eq('date', getCurrentDateString());
  };

  const fetchUserProfileData = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (data) {
      smoothStateUpdate(() => {
        setCurrentWeight(data.weight || 0);
        setUserGoal(data.goal || 'maintain');
        setTargetWeight(data.target_weight || null);
        setTrainerUntil(data.trainer_until || null);
        setAiPlan(data.ai_plan || 'free');
        setAiUntil(data.ai_until || null);
        if (data.weight && data.height && data.age && data.gender) {
          let bmr = data.gender === 'male' ? (10 * data.weight) + (6.25 * data.height) - (5 * data.age) + 5 : (10 * data.weight) + (6.25 * data.height) - (5 * data.age) - 161;
          let mult = 1.2;
          if (data.workouts_per_week === '1-2') mult = 1.375;
          else if (data.workouts_per_week === '3-4') mult = 1.55;
          else if (data.workouts_per_week === '5+') mult = 1.725;
          let tdee = bmr * mult;
          setMaintenanceCalories(Math.round(tdee)); // поддержка веса (до коррекции на цель)
          if (data.goal === 'lose') tdee -= 500;
          else if (data.goal === 'gain') tdee += 500;

          const cals = Math.round(tdee);
          setDailyCalorieNorm(cals);
          setDailyMacros({
            protein: Math.round((cals * 0.3) / 4),
            fat: Math.round((cals * 0.3) / 9),
            carb: Math.round((cals * 0.4) / 4)
          });
        }
      });
    }
  };

  // --- Подписки: производные флаги + действия ---
  const trainerSubActive = !!trainerUntil && new Date(trainerUntil).getTime() > Date.now();
  const aiUnlimited = aiPlan === 'unlim' && !!aiUntil && new Date(aiUntil).getTime() > Date.now();
  // Любой платный ИИ-план (p50/p150/unlim) ещё активен.
  const aiSubActive = aiPlan !== 'free' && !!aiUntil && new Date(aiUntil).getTime() > Date.now();

  // Гейт тренерских функций: true если можно, иначе показывает paywall и возвращает false.
  const requireTrainerSub = (): boolean => {
    if (trainerSubActive) return true;
    setPaywall('trainer');
    return false;
  };
  // Открыть оплату в Telegram-боте (он по start-параметру активирует подписку в Supabase).
  const openCheckout = (kind: 'trainer' | 'ai', planId: string) => {
    // Запоминаем, что начали оплату: когда пользователь вернётся в приложение из Telegram,
    // подписку проверим автоматически — без ручного «Я оплатил».
    pendingCheckoutRef.current = { kind, at: Date.now() };
    Linking.openURL(tgCheckoutUrl(kind, planId, session?.user?.id))
      .catch(() => Alert.alert('Telegram', 'Не удалось открыть Telegram. Установлен ли он?'));
  };
  const refreshSubscription = async () => { await fetchUserProfileData(); };

  // Авто-проверка подписки после оплаты в Telegram.
  // Refs читаем внутри таймеров/слушателей, чтобы не ловить устаревшие значения из замыкания.
  const pendingCheckoutRef = useRef<{ kind: 'trainer' | 'ai'; at: number } | null>(null);
  const trainerActiveRef = useRef(false);
  const aiActiveRef = useRef(false);
  const refreshRef = useRef(refreshSubscription);
  useEffect(() => { trainerActiveRef.current = trainerSubActive; }, [trainerSubActive]);
  useEffect(() => { aiActiveRef.current = aiSubActive; }, [aiSubActive]);
  useEffect(() => { refreshRef.current = refreshSubscription; });

  // Несколько раз перечитываем профиль, пока подписка нужного типа не станет активной
  // (запись бота в Supabase может прийти не мгновенно).
  const pollSubscriptionActivation = (kind: 'trainer' | 'ai') => {
    const isActive = () => (kind === 'trainer' ? trainerActiveRef.current : aiActiveRef.current);
    if (isActive()) { pendingCheckoutRef.current = null; return; }
    let tries = 0;
    const tick = async () => {
      await refreshRef.current();
      tries++;
      if (isActive()) { pendingCheckoutRef.current = null; return; }
      if (tries < 5) setTimeout(tick, 2500);
      // иначе оставляем флаг: при следующем возврате (в пределах окна) попробуем ещё.
    };
    tick();
  };

  // 1) Возврат в приложение после оплаты — авто-проверка без ручного «Я оплатил».
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const pending = pendingCheckoutRef.current;
      if (!pending) return;
      // Окно ожидания оплаты — 30 минут; позже считаем, что пользователь передумал.
      if (Date.now() - pending.at > 30 * 60 * 1000) { pendingCheckoutRef.current = null; return; }
      pollSubscriptionActivation(pending.kind);
    });
    return () => sub.remove();
  }, []);

  // 2) Диплинки приложения (mysafeapp://...) — работают после пересборки (схема нативная):
  //    paid?kind=...  — возврат из Telegram-бота → проверяем подписку;
  //    join?code=...  — приглашение в клуб → вступаем (после входа, если ещё не залогинен).
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (url.indexOf('paid') !== -1) { pollSubscriptionActivation(/kind=ai/.test(url) ? 'ai' : 'trainer'); return; }
      const m = url.match(/[?&]code=(\d{4,8})/);
      if (url.indexOf('join') !== -1 && m) setPendingInviteCode(m[1]);
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  // Тренер выбрал тариф при регистрации → после создания аккаунта (сессия готова)
  // открываем оплату выбранного тарифа в Telegram.
  useEffect(() => {
    if (session?.user?.id && pendingTrainerPlan) {
      const plan = pendingTrainerPlan;
      setPendingTrainerPlan(null);
      openCheckout('trainer', plan);
    }
  }, [session, pendingTrainerPlan]);

  // Как только подписка стала активной — автоматически закрываем paywall и сообщаем об успехе.
  useEffect(() => {
    if (paywall === 'trainer' && trainerSubActive) {
      setPaywall(null);
      pendingCheckoutRef.current = null;
      Alert.alert('Готово', 'Подписка тренера активирована.');
    } else if (paywall === 'ai' && aiSubActive) {
      setPaywall(null);
      pendingCheckoutRef.current = null;
      Alert.alert('Готово', 'Подписка на ИИ активирована.');
    }
  }, [paywall, trainerSubActive, aiSubActive]);

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
    if (data && data.length > 0) {
      setWeightHistoryLogs(data as WeightLog[]);
      saveWeightLogLocally(data as WeightLog[]);
    } else {
      const local = await loadLocalWeightLogs();
      if (local.length > 0) setWeightHistoryLogs(local);
    }
  };

  const handleManualWeightUpdate = async () => {
    const weightNum = parseFloat(`${manualWeightWhole}.${manualWeightDec}`);
    if (isNaN(weightNum) || weightNum <= 0) return;
    setIsLoading(true);

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
          fetchUserProfileData()
        ]);
      }

    } catch (e) {
      const err = e as unknown as Record<string, any>;
      if (err?.code === '42501') {
      } else {
        console.error('Weight update error:', err);
        Alert.alert('Ошибка', 'Не удалось сохранить вес. Проверьте подключение.');
      }
    } finally {
      setIsLoading(false);
    }
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
  const settleCalorieWeight = async () => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
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
      const bmr = prof.gender === 'male'
        ? 10 * prof.weight + 6.25 * prof.height - 5 * prof.age + 5
        : 10 * prof.weight + 6.25 * prof.height - 5 * prof.age - 161;
      let mult = 1.2;
      if (prof.workouts_per_week === '1-2') mult = 1.375;
      else if (prof.workouts_per_week === '3-4') mult = 1.55;
      else if (prof.workouts_per_week === '5+') mult = 1.725;
      const maintenance = bmr * mult;

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

  const saveAccountToLocal = async (userObj: any, pass: string) => {
    try {
      let savedStr = null;
      if (Platform.OS !== 'web') { savedStr = await AsyncStorage.getItem('savedAccounts'); } else { savedStr = typeof window !== 'undefined' ? window.localStorage.getItem('savedAccounts') : null; }
      let accounts: SavedAccount[] = savedStr ? JSON.parse(savedStr) : [];
      const existingIndex = accounts.findIndex((a: SavedAccount) => a.id === userObj.id);
      const accData: SavedAccount = { id: userObj.id, email: userObj.email, name: userObj.user_metadata?.name || name || userObj.email.split('@')[0], role: userObj.user_metadata?.role || userRole || '', password: pass };
      if (existingIndex >= 0) accounts[existingIndex] = accData; else accounts.push(accData);
      setSavedAccounts(accounts);
      if (Platform.OS !== 'web') { await AsyncStorage.setItem('savedAccounts', JSON.stringify(accounts)); } else { if (typeof window !== 'undefined') window.localStorage.setItem('savedAccounts', JSON.stringify(accounts)); }
    } catch (e) {}
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (session?.user?.id === account.id) { setIsAccountSwitcherVisible(false); return; }
    setIsAccountSwitcherVisible(false); setIsSideMenuVisible(false); setIsSwitchingAccount(true);
    setAssignNote(''); setWaterIntake(0); setCurrentWeight(0); setWeightHistoryLogs([]); setConsumedCalories(0);
    setConsumedMacros({ protein: 0, fat: 0, carb: 0 }); chatsLoadedRef.current = null; setChatSessions([]); setActiveChatId(null); setEditingMessageId(null); setIsChatSidebarVisible(false);
    setTargetWeight(null);
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
    if (error) {
      Alert.alert("Ошибка", "Пароль был изменен. Войдите заново.");
      const updated = savedAccounts.filter((a: SavedAccount) => a.id !== account.id);
      setSavedAccounts(updated);
      if (Platform.OS !== 'web') { await AsyncStorage.setItem('savedAccounts', JSON.stringify(updated)); } else { if (typeof window !== 'undefined') window.localStorage.setItem('savedAccounts', JSON.stringify(updated)); }
      setIsSwitchingAccount(false);
    } else if (data?.session) {
      setSession(data.session);
      if (data.session.user?.user_metadata?.role) setUserRole(data.session.user.user_metadata.role);
      setTimeout(() => { setIsSwitchingAccount(false); }, 300);
    }
  };

  const handleAddAnotherAccount = async () => {
    setIsAccountSwitcherVisible(false); setIsSideMenuVisible(false); await supabase.auth.signOut();
    setGroups([]); setHistory([]); setActiveGroup(null); setGroupMembers([]); setTodayWorkouts([]); setUpcomingSessions([]);
    smoothStateUpdate(() => {
      setAssignNote(''); setAuthMode('login'); setCurrentTab('home'); setEmail(''); setPassword(''); setConfirmPassword(''); setName('');
      setWaterIntake(0); setCurrentWeight(0); setWeightHistoryLogs([]); setConsumedCalories(0);
      setConsumedMacros({ protein: 0, fat: 0, carb: 0 }); chatsLoadedRef.current = null; setChatSessions([]); setActiveChatId(null); setEditingMessageId(null); setIsChatSidebarVisible(false);
      setTargetWeight(null);
    });
  };

  const handleSignOut = async () => {
    const updated = savedAccounts.filter((a: SavedAccount) => a.id !== session?.user?.id);
    setSavedAccounts(updated);
    if (Platform.OS !== 'web') { await AsyncStorage.setItem('savedAccounts', JSON.stringify(updated)); } else { if (typeof window !== 'undefined') window.localStorage.setItem('savedAccounts', JSON.stringify(updated)); }
    await supabase.auth.signOut();
    smoothStateUpdate(() => {
      setGroups([]); setHistory([]); setActiveGroup(null); setGroupMembers([]); setTodayWorkouts([]); setUpcomingSessions([]);
      setAssignNote(''); setAuthMode('login'); setCurrentTab('home'); setIsSideMenuVisible(false); setEmail(''); setPassword(''); setConfirmPassword(''); setName('');
      setWaterIntake(0); setCurrentWeight(0); setWeightHistoryLogs([]); setConsumedCalories(0);
      setConsumedMacros({ protein: 0, fat: 0, carb: 0 }); chatsLoadedRef.current = null; setChatSessions([]); setActiveChatId(null); setEditingMessageId(null); setIsChatSidebarVisible(false);
      setTargetWeight(null);
    });
  };

  const loadHistory = async () => {
    const { data, error } = await supabase.from('workouts').select('*').eq('user_id', session?.user?.id).order('created_at', { ascending: false });
    if (!error && data) setHistory(data as WorkoutRecord[]);
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
    smoothStateUpdate(() => setGroups(uniqueGroups));
  };

  const fetchUpcomingSessions = async () => {
    try {
      // Роль берём из метаданных сессии (доступны сразу), а не из стейта userRole,
      // который при перезаходе обновляется на тик позже — иначе у тренера запросится
      // фильтр по client_id и календарь оказывается пустым.
      const role = session?.user?.user_metadata?.role || userRole;
      let query = supabase.from('training_sessions').select('*').order('session_date', { ascending: true }).order('session_time', { ascending: true });
      if (role === 'trainer') query = query.eq('trainer_id', session?.user?.id); else query = query.eq('client_id', session?.user?.id);
      const { data: sessions, error } = await query;
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
    await cancelAllScheduled();
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
    if (!requireTrainerSub()) return;
    if (!schedDate || !schedTime || !schedSelectedMember) return;
    const { error } = await supabase.from('training_sessions').insert([{ group_id: schedSelectedGroup?.id, client_id: schedSelectedMember.id, trainer_id: session?.user?.id, session_date: schedDate, session_time: schedTime }]);
    if (error) Alert.alert("Ошибка", error.message);
    else {
      notifyUser(schedSelectedMember.id, 'Новая запись на тренировку 📅', `${schedDate} в ${schedTime}${schedSelectedGroup?.name ? ` · ${schedSelectedGroup.name}` : ''}`, { tab: 'home' });
      closeAnimatedModal(setIsSchedulingVisible); fetchUpcomingSessions(); setSchedSelectedGroup(null); setSchedSelectedMember(null);
    }
  };
  const deleteSession = async (id: string) => {
    const sess = upcomingSessions.find((s: TrainingSession) => s.id === id);
    const { error } = await supabase.from('training_sessions').delete().eq('id', id);
    if (!error) {
      if (sess?.client_id) notifyUser(sess.client_id, 'Запись отменена 📅', `${sess.session_date} в ${sess.session_time} — отменена`, { tab: 'home' });
      fetchUpcomingSessions();
    }
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
    if (!requireTrainerSub()) return;
    if (!assignNote) return;
    setIsLoading(true);
    try {
      const aiData = await parseWorkout(assignNote, session?.user?.id);
      if (aiData?.status === 'limit_reached') { Alert.alert('Лимит разбора', `Разбор тренировок: ${aiData.limit}/день. Лимит на сегодня исчерпан.`); return; }
      if (!aiData || !Array.isArray(aiData.parsed_data)) throw new Error('ИИ вернул данные в неверном формате');
      const newExercises: WorkoutData[] = aiData.parsed_data.map((item: any, index: number) => ({ ...item, id: `task_${Date.now()}_${index}`, completed: false }));
      const targetDate = assignWorkoutDate;
      const { data: existingPlan } = await supabase.from('assigned_workouts').select('*').eq('group_id', activeGroup?.id).eq('client_id', selectedMember?.id).eq('date', targetDate).maybeSingle();
      let finalWorkoutData: WorkoutData[] = [];
      if (existingPlan) { finalWorkoutData = [...(existingPlan.workout_data || []), ...newExercises]; } else { finalWorkoutData = newExercises; }
      const { error } = await supabase.from('assigned_workouts').upsert({ group_id: activeGroup?.id, client_id: selectedMember?.id, trainer_id: session?.user?.id, date: targetDate, workout_data: finalWorkoutData }, { onConflict: 'client_id, date' });
      if (error) throw error;
      if (selectedMember?.id) notifyUser(selectedMember.id, 'Новый план тренировки 🏋️', `Тренер обновил тренировку на ${targetDate === getCurrentDateString() ? 'сегодня' : targetDate}`, { tab: 'club' });
      setAssignNote(''); fetchGroupDetails(); loadMemberDayPlan(); Alert.alert('Успех', 'План дополнен!');
    } catch (e: any) { Alert.alert('Ошибка', e.message); } finally { setIsLoading(false); }
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
    if (!requireTrainerSub()) return;
    if (!newGroupName.trim()) return;
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const { data, error } = await supabase.from('groups').insert([{ name: newGroupName, code: randomCode, owner_id: session?.user?.id }]).select();
    if (error) { Alert.alert("Ошибка", error.message); return; }
    const created = (data as Group[] | null)?.[0];
    if (!created) { Alert.alert("Ошибка", "Не удалось создать клуб. Попробуйте ещё раз."); return; }
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
      Alert.alert("Ошибка", notFound ? "Клуб не найден." : error.message);
      return;
    }
    const targetGroup = (Array.isArray(data) ? data[0] : data) as Group;
    if (!targetGroup) { Alert.alert("Ошибка", "Клуб не найден."); return; }
    const already = groups.some((g: Group) => g.id === targetGroup.id);
    await fetchGroups();
    smoothStateUpdate(() => { setActiveGroup(targetGroup); setCurrentTab('club'); }); // сразу заходим в клуб
    Alert.alert(already ? "Инфо" : "Успех", already ? `Вы уже в клубе «${targetGroup.name}».` : `Вы вступили в клуб «${targetGroup.name}»!`);
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

  const deleteOrLeaveGroup = async (group: Group) => {
    if (group.owner_id === session?.user?.id) {
      await supabase.from('groups').delete().eq('id', group.id); smoothStateUpdate(() => { setGroups(groups.filter((g: Group) => g.id !== group.id)); setActiveGroup(null); });
    } else {
      await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', session?.user?.id); smoothStateUpdate(() => { setGroups(groups.filter((g: Group) => g.id !== group.id)); setActiveGroup(null); });
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert("Удаление", "Удалить аккаунт навсегда?", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: async () => {
          setIsLoading(true);
          try {
            await supabase.from('profiles').delete().eq('id', session?.user?.id);
            await supabase.rpc('delete_user');
            const updated = savedAccounts.filter((a: SavedAccount) => a.id !== session?.user?.id);
            setSavedAccounts(updated);
            if (Platform.OS !== 'web') { await AsyncStorage.setItem('savedAccounts', JSON.stringify(updated)); } else { if (typeof window !== 'undefined') window.localStorage.setItem('savedAccounts', JSON.stringify(updated)); }
            await supabase.auth.signOut();
            smoothStateUpdate(() => { setAuthMode('login'); setCurrentTab('home'); setIsSideMenuVisible(false); });
          } catch (e) {} finally { setIsLoading(false); }
        }
      }
    ]);
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setIsLoadingAuth(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) await saveAccountToLocal(data.user, password);
    } catch (error: unknown) { Alert.alert('Ошибка авторизации', (error as any)?.message || 'Unknown error'); } finally { setIsLoadingAuth(false); }
  };

  const handleCredentialsNext = () => {
    if (!name || !email || !password || !confirmPassword) return;
    if (password !== confirmPassword) { Alert.alert("Ошибка", "Пароли не совпадают"); return; }
    smoothStateUpdate(() => setAuthMode('register_goal'));
  };

  const handleGoalNext = (selectedGoal: string) => {
    setGoal(selectedGoal);
    smoothStateUpdate(() => {
      if (selectedGoal === 'maintain') setAuthMode('register_frequency'); else setAuthMode('register_target_weight');
    });
  };

  const handleFinalRegister = async () => {
    if (!userGender) { Alert.alert("Ошибка", "Пожалуйста, выберите пол"); return; }
    setIsLoadingAuth(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { role: userRole, name: name } } });
      if (authError) throw authError;
      if (authData.user) {
        const fullHeight = parseFloat(`${userHeightWhole}.${userHeightDec}`);
        const fullWeight = parseFloat(`${userWeightWhole}.${userWeightDec}`);
        const finalTargetWeight = (goal === 'lose' || goal === 'gain') ? parseFloat(`${targetWeightWhole}.${targetWeightDec}`) : null;
        const profilePayload = { id: authData.user.id, role: userRole, email: email, name: name, goal: goal || null, target_weight: finalTargetWeight, workouts_per_week: workoutsPerWeek || null, height: fullHeight, weight: fullWeight, age: userAge, gender: userGender };
        await supabase.from('profiles').insert([profilePayload]);
        await supabase.from('weight_log').insert([{ user_id: authData.user.id, weight: fullWeight }]);
        await saveAccountToLocal(authData.user, password);
        smoothStateUpdate(() => { setCurrentWeight(fullWeight); setUserGoal(goal || 'maintain'); setTargetWeight(finalTargetWeight); });
      }
    } catch (error: unknown) { Alert.alert('Ошибка регистрации', (error as any)?.message || 'Unknown error'); } finally { setIsLoadingAuth(false); }
  };

  const sendToAI = async (noteText: string): Promise<boolean> => {
    if (!noteText) return false;
    setIsLoading(true);
    try {
      const data = await parseWorkout(noteText, session?.user?.id);
      if (data?.status === 'limit_reached') { Alert.alert('Лимит разбора', `Разбор тренировок: ${data.limit}/день. Лимит на сегодня исчерпан, завтра обновится.`); return false; }
      const newParsedData = data.parsed_data || [];

      const { data: latestWorkouts } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session?.user?.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestWorkouts && latestWorkouts.length > 0) {
        const lastWorkout = latestWorkouts[0];
        const isToday = new Date(lastWorkout.created_at).toDateString() === new Date().toDateString();

        if (isToday) {
          const combinedRawText = lastWorkout.raw_text + '\n' + noteText;
          const combinedParsedData = [...(lastWorkout.parsed_data || []), ...newParsedData];
          await supabase.from('workouts').update({ raw_text: combinedRawText, parsed_data: combinedParsedData }).eq('id', lastWorkout.id);
        } else {
          await supabase.from('workouts').insert([{ raw_text: noteText, parsed_data: newParsedData, user_id: session?.user?.id }]);
        }
      } else {
        await supabase.from('workouts').insert([{ raw_text: noteText, parsed_data: newParsedData, user_id: session?.user?.id }]);
      }

      loadHistory();
      if (newParsedData.length > 0) {
        const exercisesWithIds: WorkoutData[] = newParsedData.map((ex: any, i: number) => ({ ...ex, id: `manual_${Date.now()}_${i}` }));
        await registerActivityForWeightLoss(exercisesWithIds, true);
      }
      Alert.alert('Успех', 'Тренировка записана!');
      return true;
    } catch (e: any) { Alert.alert('Ошибка связи', e.message); return false; } finally { setIsLoading(false); }
  };

  // Запись тренировки, собранной из списка упражнений (без ИИ — данные уже структурированы).
  const addStructuredWorkout = async (items: { exercise: string; weight: number; reps: number }[]): Promise<boolean> => {
    if (!items || items.length === 0) return false;
    setIsLoading(true);
    try {
      const parsed: WorkoutData[] = items.map((it, i) => ({ exercise: it.exercise, weight: Number(it.weight) || 0, reps: Number(it.reps) || 0, id: `manual_${Date.now()}_${i}` }));
      const rawText = parsed.map(p => `${p.exercise} ${p.weight}кг x ${p.reps}`).join('\n');
      const { data: latestWorkouts } = await supabase.from('workouts').select('*').eq('user_id', session?.user?.id).order('created_at', { ascending: false }).limit(1);
      if (latestWorkouts && latestWorkouts.length > 0 && new Date(latestWorkouts[0].created_at).toDateString() === new Date().toDateString()) {
        const last = latestWorkouts[0];
        await supabase.from('workouts').update({ raw_text: `${last.raw_text}\n${rawText}`, parsed_data: [...(last.parsed_data || []), ...parsed] }).eq('id', last.id);
      } else {
        await supabase.from('workouts').insert([{ raw_text: rawText, parsed_data: parsed, user_id: session?.user?.id }]);
      }
      loadHistory();
      await registerActivityForWeightLoss(parsed, true);
      Alert.alert('Успех', 'Тренировка записана!');
      return true;
    } catch (e: any) { Alert.alert('Ошибка', e.message); return false; } finally { setIsLoading(false); }
  };

  // Клиент пишет «на завтрак..., на обед..., на ужин...» — делим на приёмы, каждый на продукты с КБЖУ.
  const calcClientMeals = async (text: string, mealType?: string) => {
    if (!text.trim()) return;
    setIsMealPreviewLoading(true);
    try {
      const data = await parseMeals(text, session?.user?.id);
      if (data?.status === 'limit_reached') { Alert.alert('Лимит разбора', `Разбор еды: ${data.limit}/день. Лимит на сегодня исчерпан, завтра обновится.`); return; }
      if (!data || data.error || !Array.isArray(data.meals)) throw new Error(data?.error || 'ИИ вернул данные в неверном формате');
      const meals: MealItem[] = data.meals.map((meal: any, mi: number) => {
        const items: FoodItem[] = (meal.items || []).map((it: any) => ({ name: it.name || 'блюдо', calories: it.calories || 0, protein: it.protein || 0, fat: it.fat || 0, carbs: it.carbs || 0 }));
        const t = items.reduce((a, i) => ({ c: a.c + i.calories, p: a.p + i.protein, f: a.f + i.fat, cb: a.cb + i.carbs }), { c: 0, p: 0, f: 0, cb: 0 });
        return { id: `meal_${Date.now()}_${mi}`, meal_type: meal.meal_type || 'snack', name: items.map(i => i.name).join(', '), items, calories: t.c, protein: t.p, fat: t.f, carbs: t.cb, eaten: false };
      });
      // Если приём один — берём выбранный в выпадающем списке; если ИИ нашёл несколько (в тексте «на завтрак…, на обед…») — уважаем его разметку.
      if (mealType && meals.length === 1) meals[0].meal_type = mealType;
      smoothStateUpdate(() => setMealParse(meals));
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setIsMealPreviewLoading(false);
    }
  };

  const confirmClientMeals = () => {
    if (!mealParse || mealParse.length === 0) return;
    const grand = mealParse.reduce((a, m) => ({ c: a.c + m.calories, p: a.p + m.protein, f: a.f + m.fat, cb: a.cb + m.carbs }), { c: 0, p: 0, f: 0, cb: 0 });
    saveNutritionDataLocally(consumedCalories + grand.c, consumedMacros.protein + grand.p, consumedMacros.fat + grand.f, consumedMacros.carb + grand.cb);
    if (session?.user?.id) {
      const uid = session.user.id;
      const today = getCurrentDateString();
      const rows = mealParse.map(m => ({ user_id: uid, date: today, name: m.name, meal_type: m.meal_type, items: m.items, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs, source: 'self' }));
      supabase.from('meal_log').insert(rows).then(() => loadClientNutrition());
    }
    closeAnimatedModal(setIsMealModalVisible);
    setMealParse(null);
  };

  const createNewChat = () => { smoothStateUpdate(() => { setActiveChatId(null); setIsChatSidebarVisible(false); }); };

  const deleteChat = (id: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm("Удалить этот диалог?");
      if (confirmed) { smoothStateUpdate(() => { setChatSessions(prev => prev.filter(c => c.id !== id)); if (activeChatId === id) setActiveChatId(null); }); }
    } else {
      Alert.alert("Удаление", "Удалить этот диалог?", [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: () => { smoothStateUpdate(() => { setChatSessions(prev => prev.filter(c => c.id !== id)); if (activeChatId === id) setActiveChatId(null); }); }}
      ]);
    }
  };

  const startEditMessage = (msg: ChatMessage) => { smoothStateUpdate(() => { setEditingMessageId(msg.id); setEditInput(msg.text); }); };

  const saveEditMessage = async () => {
    if (!activeChatId || !editingMessageId || !editInput.trim()) return;
    const chat = chatSessions.find(c => c.id === activeChatId);
    if (!chat) return;

    const msgIndex = chat.messages.findIndex(m => m.id === editingMessageId);
    if (msgIndex === -1) return;

    const updatedMessages = [...chat.messages.slice(0, msgIndex), { ...chat.messages[msgIndex], text: editInput.trim() }];
    smoothStateUpdate(() => {
      setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: updatedMessages, updatedAt: Date.now() } : c));
      setEditingMessageId(null);
    });
    setIsChatLoading(true);

    const apiMessages = updatedMessages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

    try {
      const data = await sendChat(apiMessages, session?.user?.id);
      if (data?.limit_reached) {
        const lm: ChatMessage = { id: (Date.now() + 1).toString(), text: `Дневной лимит ИИ-чата исчерпан (${data.limit}/день). Оформи подписку, чтобы продолжить.`, sender: 'ai' };
        smoothStateUpdate(() => setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, lm], updatedAt: Date.now() } : c)));
        setPaywall('ai');
        return;
      }

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: data.reply || "К сожалению я не могу вам с этим помочь", sender: 'ai' };
      smoothStateUpdate(() => {
        setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() } : c));
      });

      if (data.calories && data.calories > 0) {
        saveNutritionDataLocally( consumedCalories + data.calories, consumedMacros.protein + (data.protein || 0), consumedMacros.fat + (data.fat || 0), consumedMacros.carb + (data.carbs || 0) );
      }
    } catch (error) {
      const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: "Не удалось связаться с ИИ. Проверьте интернет и попробуйте ещё раз.", sender: 'ai' };
      smoothStateUpdate(() => setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, errorMsg], updatedAt: Date.now() } : c)));
    } finally { setIsChatLoading(false); }
  };

  const handleSendChatMessage = async (messageText: string) => {
    if (!messageText.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), text: messageText.trim(), sender: 'user' };

    let chatId = activeChatId;
    let isNewChat = false;

    if (!chatId) { chatId = Date.now().toString(); isNewChat = true; setActiveChatId(chatId); }

    const activeChat = chatSessions.find(c => c.id === chatId);
    const generatedTitle = userMsg.text.length > 25 ? userMsg.text.substring(0, 25) + '...' : userMsg.text;

    const newSessionContent: ChatSession = isNewChat
        ? { id: chatId, title: generatedTitle, messages: [userMsg], updatedAt: Date.now() }
        : { ...activeChat!, messages: [...activeChat!.messages, userMsg], updatedAt: Date.now(), title: activeChat!.title === 'Новый диалог' ? generatedTitle : activeChat!.title };

    smoothStateUpdate(() => setChatSessions(prev => isNewChat ? [newSessionContent, ...prev] : prev.map(c => c.id === chatId ? newSessionContent : c)));
    setIsChatLoading(true);

    const apiMessages = newSessionContent.messages.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text }));

    try {
      const data = await sendChat(apiMessages, session?.user?.id);
      if (data?.limit_reached) {
        const lm: ChatMessage = { id: (Date.now() + 1).toString(), text: `Дневной лимит ИИ-чата исчерпан (${data.limit}/день). Оформи подписку, чтобы продолжить.`, sender: 'ai' };
        smoothStateUpdate(() => setChatSessions(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, lm], updatedAt: Date.now() } : c)));
        setPaywall('ai');
        return;
      }

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: data.reply || "К сожалению я не могу вам с этим помочь", sender: 'ai' };
      smoothStateUpdate(() => setChatSessions(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() } : c)));

      if (data.calories && data.calories > 0) {
        saveNutritionDataLocally( consumedCalories + data.calories, consumedMacros.protein + (data.protein || 0), consumedMacros.fat + (data.fat || 0), consumedMacros.carb + (data.carbs || 0) );
      }
    } catch (error) {
      const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: "Не удалось связаться с ИИ. Проверьте интернет и попробуйте ещё раз.", sender: 'ai' };
      smoothStateUpdate(() => setChatSessions(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, errorMsg], updatedAt: Date.now() } : c)));
    } finally { setIsChatLoading(false); }
  };

  // Вода в БД (Фаза 5): персист в water_log, чтобы переживала перезапуск и была видна тренеру.
  const loadTodayWater = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase.from('water_log').select('liters').eq('user_id', session.user.id).eq('date', getCurrentDateString()).maybeSingle();
    setWaterIntake(data?.liters || 0);
  };
  const persistWater = async (liters: number) => {
    if (!session?.user?.id) return;
    await supabase.from('water_log').upsert({ user_id: session.user.id, date: getCurrentDateString(), liters }, { onConflict: 'user_id, date' });
  };
  const addWater = () => {
    if (waterIntake >= 5.0) return;
    const next = Math.min(5.0, parseFloat((waterIntake + 0.2).toFixed(1)));
    smoothStateUpdate(() => setWaterIntake(next));
    persistWater(next);
  };
  const resetWater = () => {
    smoothStateUpdate(() => setWaterIntake(0));
    persistWater(0);
  };

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
    displayName,

    // navigation / ui
    currentTab, setCurrentTab, isSideMenuVisible, setIsSideMenuVisible,
    handleTabChange, menuNavigate, smoothStateUpdate, openAnimatedModal, closeAnimatedModal,
    contentFadeAnim, modalOpacityAnim, modalScaleAnim,

    // weight / home
    currentWeight, targetWeight, weightHistoryLogs,
    isWeightModalVisible, setIsWeightModalVisible,
    manualWeightWhole, setManualWeightWhole, manualWeightDec, setManualWeightDec,
    chartPeriod, setChartPeriod, chartDataMemo, handleManualWeightUpdate,
    waterIntake, addWater, resetWater,

    // nutrition
    dailyCalorieNorm, maintenanceCalories, dailyMacros, consumedCalories, consumedMacros,
    // подписки
    paywall, setPaywall, trainerSubActive, aiUnlimited, requireTrainerSub, openCheckout, refreshSubscription,
    setPendingTrainerPlan,
    isMealModalVisible, setIsMealModalVisible,
    isMealPreviewLoading, mealParse, setMealParse,
    calcClientMeals, confirmClientMeals,
    assignedMealsToday, selfMealsToday, toggleAssignedMealEaten, loadClientNutrition,

    // workout journal
    history, sendToAI, addStructuredWorkout,

    // groups / clubs
    groups, activeGroup, setActiveGroup, groupMembers, setGroupMembers, todayWorkouts, setTodayWorkouts,
    isCreatingGroup, setIsCreatingGroup, isJoiningGroup, setIsJoiningGroup,
    selectedMember, setSelectedMember, isMyWorkoutVisible, setIsMyWorkoutVisible,
    newGroupName, setNewGroupName, joinCode, setJoinCode, assignNote, setAssignNote,
    assignWorkoutDate, setAssignWorkoutDate, assignDateObj, setAssignDateObj, assignDatePickerVisible, setAssignDatePickerVisible, onAssignDateChange,
    myPlanViewDate, setMyPlanViewDate, myDayPlan, setMyDayPlan, shiftMyPlanDate, memberDayPlan,
    clientProfile,
    createGroup, joinGroup, deleteOrLeaveGroup, fetchGroupDetails,
    assignWorkoutToMember, toggleExerciseStatus,

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
