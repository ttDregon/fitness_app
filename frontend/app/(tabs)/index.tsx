import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  StyleSheet, Text, View, TextInput, 
  TouchableOpacity, ActivityIndicator, ScrollView, Alert, StatusBar, Modal, Platform, Dimensions, LogBox, NativeSyntheticEvent, NativeScrollEvent
} from 'react-native';
import { createClient, Session as SupabaseSession } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LineChart } from 'react-native-chart-kit';
import Constants from 'expo-constants';

type Session = SupabaseSession;

interface WorkoutData { exercise: string; weight: number; reps: number; id?: string; completed?: boolean; }
interface GroupedWorkout { exercise: string; sets: WorkoutData[]; }
interface ScrollPickerItem { label: string; value: string | number; }
interface SavedAccount { id: string; email: string; name: string; role: string; password: string; }
interface Group { id: string; name: string; code: string; owner_id: string; }
interface GroupMember { id: string; email: string; name?: string; }
interface WeightLog { id: string; weight: number; created_at: string; }
interface WorkoutRecord { id: string; raw_text: string; parsed_data: WorkoutData[]; user_id: string; created_at: string; }
interface AssignedWorkout { id: string; group_id: string; client_id: string; trainer_id: string; date: string; workout_data: WorkoutData[]; }
interface TrainingSession { id: string; group_id: string; client_id: string; trainer_id: string; session_date: string; session_time: string; group_name?: string; client_name?: string; }
interface ChatMessage { id: string; text: string; sender: 'user' | 'ai'; }
interface ChatSession { id: string; title: string; messages: ChatMessage[]; updatedAt: number; }
interface Macros { protein: number; fat: number; carb: number; }

LogBox.ignoreLogs([
  'VirtualizedLists should never be nested',
  'props.pointerEvents is deprecated'
]);

// --- НАСТРОЙКИ SUPABASE ---
const supabaseUrl = 'https://izhkutjiuimsepzlohsl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6aGt1dGppdWltc2VwemxvaHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODI3NzksImV4cCI6MjA5MjE1ODc3OX0.ZR0HPdjhkrTeEeJ1F0cmqLgNV1AsxJb6pssIQtrlGeg'; 

const customWebStorage = {
  getItem: (key: string) => { if (typeof window !== 'undefined') return window.localStorage.getItem(key); return null; },
  setItem: (key: string, value: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); },
  removeItem: (key: string) => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
};

const authStorage = Platform.OS === 'web' ? customWebStorage : AsyncStorage;
const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: authStorage as any, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
const screenWidth = Dimensions.get("window").width;

const COLORS = {
  bg: '#F3F4F6', tabBar: '#6366F1', card: '#FFFFFF', textPrimary: '#111827', textSecondary: '#6B7280', border: '#E5E7EB', success: '#10B981', error: '#EF4444',
  chatSidebarBg: '#1F2937', chatSidebarHover: '#374151', chatSidebarText: '#F3F4F6',
  protein: '#3B82F6', fat: '#F59E0B', carb: '#DC2626'
};

const groupWorkoutData = (data: WorkoutData[]): GroupedWorkout[] => {
  if (!Array.isArray(data)) return [];
  const grouped: GroupedWorkout[] = [];
  data.forEach((item: WorkoutData) => {
    let existing = grouped.find(g => g.exercise === item.exercise);
    if (!existing) { existing = { exercise: item.exercise, sets: [] }; grouped.push(existing); }
    existing.sets.push(item);
  });
  return grouped;
};

const ITEM_HEIGHT = 40;
interface ScrollPickerProps { items: ScrollPickerItem[]; selectedValue: string | number; onValueChange: (value: string | number) => void; width?: number; textColor?: string; lineColor?: string; }

const ScrollPicker = ({ items, selectedValue, onValueChange, width = 100, textColor, lineColor }: ScrollPickerProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = items.findIndex((i: ScrollPickerItem) => i.value === selectedValue);
    if (idx >= 0 && idx !== selectedIndex) {
      setSelectedIndex(idx);
      setTimeout(() => { scrollViewRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false }); }, 100);
    }
  }, [selectedValue, items]);

  const paddedItems = [{ label: '', value: 'pad1' }, ...items, { label: '', value: 'pad2' }];
  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    if (items[index]) { setSelectedIndex(index); onValueChange(items[index].value); }
  };

  return (
    <View style={{ height: ITEM_HEIGHT * 3, width, overflow: 'hidden', alignItems: 'center' }}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled={true}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{ paddingBottom: 0 }}
      >
        {paddedItems.map((item, index) => {
          const isSelected = index === selectedIndex + 1;
          return (
            <View key={index} style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: isSelected ? 22 : 16, color: isSelected ? (textColor || COLORS.textPrimary) : '#666', fontWeight: isSelected ? 'bold' : 'normal' }}>{item.label}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ position: 'absolute', top: ITEM_HEIGHT, height: ITEM_HEIGHT, width: '100%', borderTopWidth: 1, borderBottomWidth: 1, borderColor: lineColor || COLORS.tabBar, zIndex: -1, pointerEvents: 'none' }} />
    </View>
  );
};

const generateArray = (start: number, end: number, step: number = 1): ScrollPickerItem[] => { const arr: ScrollPickerItem[] = []; for (let i = start; i <= end; i += step) arr.push({ label: i.toString(), value: i }); return arr; };
const generateDecimals = (): ScrollPickerItem[] => { const arr: ScrollPickerItem[] = []; for (let i = 0; i <= 95; i += 5) { let str = i < 10 ? `0${i}` : `${i}`; arr.push({ label: `.${str}`, value: str }); } return arr; };
const ageData = generateArray(10, 100); const heightWholeData = generateArray(100, 250); const weightWholeData = generateArray(30, 200); const decimalsData = generateDecimals();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
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
  const [dailyMacros, setDailyMacros] = useState<Macros>({ protein: 0, fat: 0, carb: 0 });
  const [consumedCalories, setConsumedCalories] = useState<number>(0);
  const [consumedMacros, setConsumedMacros] = useState<Macros>({ protein: 0, fat: 0, carb: 0 });
  
  const [isMealModalVisible, setIsMealModalVisible] = useState<boolean>(false);
  const [mealInput, setMealInput] = useState<string>('');
  const [isMealPreviewLoading, setIsMealPreviewLoading] = useState<boolean>(false);
  const [mealPreview, setMealPreview] = useState<{name: string, calories: number, protein: number, fat: number, carbs: number} | null>(null);

  const [lastActivityTime, setLastActivityTime] = useState<number | null>(null);
  const [pendingExerciseCount, setPendingExerciseCount] = useState<number>(0);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isAccountSwitcherVisible, setIsAccountSwitcherVisible] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<string>('home'); 
  const [isSideMenuVisible, setIsSideMenuVisible] = useState<boolean>(false); 
  const [waterIntake, setWaterIntake] = useState<number>(0); 
  const [note, setNote] = useState<string>('');
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
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const getBackendUrl = () => {
    // ⚠️ ЗАМЕНИТЕ на ваш URL с Render
    const RENDER_BACKEND_URL = 'https://fitness-app-backend-xxxx.onrender.com'; // Замените xxxx на ваш ID
    
    // Если RENDER_BACKEND_URL установлен, используйте его
    if (RENDER_BACKEND_URL && RENDER_BACKEND_URL.includes('onrender.com')) {
      return RENDER_BACKEND_URL;
    }
    
    // Для локальной разработки
    if (typeof window !== 'undefined') {
      return `http://${window.location.hostname}:8000`;
    }
    const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
    if (hostUri) {
      return `http://${hostUri.split(':')[0]}:8000`;
    }
    return 'http://127.0.0.1:8000';
  };
  const BACKEND_URL = getBackendUrl();

  const getCurrentDateString = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const performMidnightUpdate = async () => {
    try {
      const today = getCurrentDateString();
      let lastDate = Platform.OS !== 'web' ? await AsyncStorage.getItem('lastSavedDate') : window.localStorage.getItem('lastSavedDate');

      if (lastDate && lastDate !== today) {
        let savedNutr = Platform.OS !== 'web' ? await AsyncStorage.getItem(`nutrition_${lastDate}`) : window.localStorage.getItem(`nutrition_${lastDate}`);
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
            setCurrentWeight(newWeight);
            await fetchWeightLog();
          }
        }
      }
      
      if (lastDate !== today) {
         if (Platform.OS !== 'web') await AsyncStorage.setItem('lastSavedDate', today);
         else window.localStorage.setItem('lastSavedDate', today);
         loadTodayNutritionData();
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
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.user_metadata?.role) setUserRole(session.user.user_metadata.role);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadChatSessions = async () => {
      if (!session?.user?.id) return;
      const key = `chatSessions_${session.user.id}`;
      try {
        let saved = Platform.OS !== 'web' ? await AsyncStorage.getItem(key) : typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        if (saved) setChatSessions(JSON.parse(saved));
        else setChatSessions([]);
      } catch (e) {}
    };
    if (session) loadChatSessions();
  }, [session]);

  useEffect(() => {
    const saveChatSessions = async () => {
      if (!session?.user?.id) return;
      const key = `chatSessions_${session.user.id}`;
      try {
        const val = JSON.stringify(chatSessions);
        if (Platform.OS !== 'web') await AsyncStorage.setItem(key, val);
        else if (typeof window !== 'undefined') window.localStorage.setItem(key, val);
      } catch (e) {}
    };
    if (session) saveChatSessions();
  }, [chatSessions, session]);

  useEffect(() => {
    if (session) {
      loadHistory(); fetchGroups(); fetchUpcomingSessions(); fetchUserProfileData(); fetchWeightLog(); loadTodayNutritionData();
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
      loadPending();
    }
  }, [session]);

  useEffect(() => { if (activeGroup) fetchGroupDetails(); }, [activeGroup]);

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
                const payload = { weight: currentWeight, exercises: pending };
                const res = await fetch(`${BACKEND_URL}/calculate_loss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (res.ok) {
                  const data = await res.json();
                  const loss = data.weight_loss_kg || 0; 
                  if (loss > 0) {
                    let newW = parseFloat((currentWeight - loss).toFixed(2));
                    if (newW > 0 && session.user?.id) {
                      await supabase.from('profiles').update({ weight: newW }).eq('id', session.user.id);
                      await supabase.from('weight_log').insert([{ user_id: session.user.id, weight: newW }]);
                      const newLog: WeightLog = { id: Date.now().toString(), weight: newW, created_at: new Date().toISOString() };
                      setWeightHistoryLogs(prev => [newLog, ...prev]);
                      setCurrentWeight(newW);
                      await fetchWeightLog();
                    }
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
      const key = `nutrition_${getCurrentDateString()}`;
      let saved = Platform.OS !== 'web' ? await AsyncStorage.getItem(key) : typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        setConsumedCalories(parsed.calories || 0);
        setConsumedMacros({ protein: parsed.protein || 0, fat: parsed.fat || 0, carb: parsed.carbs || 0 });
      } else {
        setConsumedCalories(0);
        setConsumedMacros({ protein: 0, fat: 0, carb: 0 });
      }
    } catch (e) {}
  };

  const saveNutritionDataLocally = async (cals: number, p: number, f: number, c: number) => {
    setConsumedCalories(cals);
    setConsumedMacros({ protein: p, fat: f, carb: c });
    const key = `nutrition_${getCurrentDateString()}`;
    const val = JSON.stringify({ calories: cals, protein: p, fat: f, carbs: c });
    if (Platform.OS !== 'web') await AsyncStorage.setItem(key, val);
    else if (typeof window !== 'undefined') window.localStorage.setItem(key, val);
  };

  const fetchUserProfileData = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (data) { 
      setCurrentWeight(data.weight || 0); 
      setUserGoal(data.goal || 'maintain'); 
      setTargetWeight(data.target_weight || null);
      if (data.weight && data.height && data.age && data.gender) {
        let bmr = data.gender === 'male' ? (10 * data.weight) + (6.25 * data.height) - (5 * data.age) + 5 : (10 * data.weight) + (6.25 * data.height) - (5 * data.age) - 161;
        let mult = 1.2;
        if (data.workouts_per_week === '1-2') mult = 1.375;
        else if (data.workouts_per_week === '3-4') mult = 1.55;
        else if (data.workouts_per_week === '5+') mult = 1.725;
        let tdee = bmr * mult;
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
    }
  };

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

      setCurrentWeight(weightNum);
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
    setNote(''); setAssignNote(''); setWaterIntake(0); setCurrentWeight(0); setWeightHistoryLogs([]); setConsumedCalories(0);
    setConsumedMacros({ protein: 0, fat: 0, carb: 0 }); setChatSessions([]); setActiveChatId(null); setEditingMessageId(null); setIsChatSidebarVisible(false);
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
    setNote(''); setAssignNote(''); setAuthMode('login'); setCurrentTab('home'); setEmail(''); setPassword(''); setConfirmPassword(''); setName('');
    setWaterIntake(0); setCurrentWeight(0); setWeightHistoryLogs([]); setConsumedCalories(0);
    setConsumedMacros({ protein: 0, fat: 0, carb: 0 }); setChatSessions([]); setActiveChatId(null); setEditingMessageId(null); setIsChatSidebarVisible(false);
    setTargetWeight(null);
  };

  const handleSignOut = async () => {
    const updated = savedAccounts.filter((a: SavedAccount) => a.id !== session?.user?.id);
    setSavedAccounts(updated); 
    if (Platform.OS !== 'web') { await AsyncStorage.setItem('savedAccounts', JSON.stringify(updated)); } else { if (typeof window !== 'undefined') window.localStorage.setItem('savedAccounts', JSON.stringify(updated)); }
    await supabase.auth.signOut();
    setGroups([]); setHistory([]); setActiveGroup(null); setGroupMembers([]); setTodayWorkouts([]); setUpcomingSessions([]);
    setNote(''); setAssignNote(''); setAuthMode('login'); setCurrentTab('home'); setIsSideMenuVisible(false); setEmail(''); setPassword(''); setConfirmPassword(''); setName('');
    setWaterIntake(0); setCurrentWeight(0); setWeightHistoryLogs([]); setConsumedCalories(0);
    setConsumedMacros({ protein: 0, fat: 0, carb: 0 }); setChatSessions([]); setActiveChatId(null); setEditingMessageId(null); setIsChatSidebarVisible(false);
    setTargetWeight(null);
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
    setGroups(uniqueGroups);
  };

  const fetchUpcomingSessions = async () => {
    try {
      let query = supabase.from('training_sessions').select('*').order('session_date', { ascending: true }).order('session_time', { ascending: true });
      if (userRole === 'trainer') query = query.eq('trainer_id', session?.user?.id); else query = query.eq('client_id', session?.user?.id);
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
      setUpcomingSessions(enriched);
    } catch (err) {}
  };

  const fetchGroupDetails = async () => {
    const { data: members } = await supabase.from('group_members').select('*').eq('group_id', activeGroup?.id);
    if (members && members.length > 0) {
      const userIds = members.map((m: any) => m.user_id);
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);
      setGroupMembers(profiles as GroupMember[] || []);
    } else setGroupMembers([]);
    const { data: workouts } = await supabase.from('assigned_workouts').select('*').eq('group_id', activeGroup?.id).eq('date', getCurrentDateString());
    setTodayWorkouts(workouts as AssignedWorkout[] || []);
  };

  const startScheduling = () => { setScheduleStep('group'); setSchedDate(''); setSchedTime(''); setTempDate(new Date()); setIsSchedulingVisible(true); };
  const selectGroupForSchedule = async (group: Group) => {
    setSchedSelectedGroup(group);
    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', group.id);
    if (members && members.length > 0) {
      const ids = members.map((m: any) => m.user_id);
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids);
      setGroupMembers(profs as GroupMember[] || []);
    } else setGroupMembers([]);
    setScheduleStep('member');
  };
  const onDateChange = (event: any, selectedDate: Date | undefined) => {
    setDatePickerVisible(false);
    if (event.type === 'set' && selectedDate) { setTempDate(selectedDate); setSchedDate(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`); }
  };
  const onTimeChange = (event: any, selectedTime: Date | undefined) => {
    setTimePickerVisible(false); 
    if (event.type === 'set' && selectedTime) { setTempDate(selectedTime); setSchedTime(`${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}`); }
  };

  const saveTrainingSession = async () => {
    if (!schedDate || !schedTime || !schedSelectedMember) return;
    const { error } = await supabase.from('training_sessions').insert([{ group_id: schedSelectedGroup?.id, client_id: schedSelectedMember.id, trainer_id: session?.user?.id, session_date: schedDate, session_time: schedTime }]);
    if (error) Alert.alert("Ошибка", error.message); else { setIsSchedulingVisible(false); fetchUpcomingSessions(); setSchedSelectedGroup(null); setSchedSelectedMember(null); }
  };
  const deleteSession = async (id: string) => { const { error } = await supabase.from('training_sessions').delete().eq('id', id); if (!error) fetchUpcomingSessions(); };

  const assignWorkoutToMember = async () => {
    if (!assignNote) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: assignNote }) });
      if (!response.ok) throw new Error('Бэкенд сервер не отвечает');
      const aiData = await response.json();
      const newExercises: WorkoutData[] = aiData.parsed_data.map((item: any, index: number) => ({ ...item, id: `task_${Date.now()}_${index}`, completed: false }));
      const targetDate = getCurrentDateString();
      const { data: existingPlan } = await supabase.from('assigned_workouts').select('*').eq('group_id', activeGroup?.id).eq('client_id', selectedMember?.id).eq('date', targetDate).single();
      let finalWorkoutData: WorkoutData[] = [];
      if (existingPlan) { finalWorkoutData = [...existingPlan.workout_data, ...newExercises]; } else { finalWorkoutData = newExercises; }
      const { error } = await supabase.from('assigned_workouts').upsert({ group_id: activeGroup?.id, client_id: selectedMember?.id, trainer_id: session?.user?.id, date: targetDate, workout_data: finalWorkoutData }, { onConflict: 'client_id, date' });
      if (error) throw error;
      setAssignNote(''); fetchGroupDetails(); Alert.alert('Успех', 'План дополнен!');
    } catch (e: any) { Alert.alert('Ошибка', e.message); } finally { setIsLoading(false); }
  };

  const toggleExerciseStatus = async (workoutId: string, exerciseId: string | undefined, currentStatus: boolean) => {
    const workoutToUpdate = todayWorkouts.find((w: AssignedWorkout) => w.id === workoutId);
    if (!workoutToUpdate) return;
    const isNowCompleted = !currentStatus;
    const updatedPlan = workoutToUpdate.workout_data.map((ex: WorkoutData) => ex.id === exerciseId ? { ...ex, completed: isNowCompleted } : ex);
    setTodayWorkouts((prev: AssignedWorkout[]) => prev.map((w: AssignedWorkout) => w.id === workoutId ? { ...w, workout_data: updatedPlan } : w));
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
    if (error) Alert.alert("Ошибка", error.message); else { setGroups([...groups, (data as any[])[0]]); setNewGroupName(''); setIsCreatingGroup(false); }
  };

  const joinGroup = async () => {
    if (joinCode.length < 6) return;
    const { data: foundGroups } = await supabase.from('groups').select('*').eq('code', joinCode);
    if (!foundGroups || foundGroups.length === 0) { Alert.alert("Ошибка", "Клуб не найден."); return; }
    const targetGroup = foundGroups[0] as Group;
    const { error: joinError } = await supabase.from('group_members').insert([{ group_id: targetGroup.id, user_id: session?.user?.id }]);
    if (!joinError) { setGroups([...groups, targetGroup]); setJoinCode(''); setIsJoiningGroup(false); Alert.alert("Успех", "Вы вступили в клуб!"); }
  };

  const deleteOrLeaveGroup = async (group: Group) => {
    if (group.owner_id === session?.user?.id) {
      await supabase.from('groups').delete().eq('id', group.id); setGroups(groups.filter((g: Group) => g.id !== group.id)); setActiveGroup(null);
    } else {
      await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', session?.user?.id); setGroups(groups.filter((g: Group) => g.id !== group.id)); setActiveGroup(null);
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
            await supabase.auth.signOut(); setAuthMode('login'); setCurrentTab('home'); setIsSideMenuVisible(false);
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
    setAuthMode('register_goal'); 
  };

  const handleGoalNext = (selectedGoal: string) => {
    setGoal(selectedGoal);
    if (selectedGoal === 'maintain') setAuthMode('register_frequency'); else setAuthMode('register_target_weight');
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
        setCurrentWeight(fullWeight); setUserGoal(goal || 'maintain'); setTargetWeight(finalTargetWeight);
      }
    } catch (error: unknown) { Alert.alert('Ошибка регистрации', (error as any)?.message || 'Unknown error'); } finally { setIsLoadingAuth(false); }
  };

  const sendToAI = async () => {
    if (!note) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: note }) });
      if (!response.ok) throw new Error('Бэкенд сервер не отвечает');
      const data = await response.json();
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
          const combinedRawText = lastWorkout.raw_text + '\n' + note;
          const combinedParsedData = [...(lastWorkout.parsed_data || []), ...newParsedData];
          await supabase.from('workouts').update({ raw_text: combinedRawText, parsed_data: combinedParsedData }).eq('id', lastWorkout.id);
        } else {
          await supabase.from('workouts').insert([{ raw_text: note, parsed_data: newParsedData, user_id: session?.user?.id }]);
        }
      } else {
        await supabase.from('workouts').insert([{ raw_text: note, parsed_data: newParsedData, user_id: session?.user?.id }]);
      }

      setNote(''); 
      loadHistory(); 
      if (newParsedData.length > 0) {
        const exercisesWithIds: WorkoutData[] = newParsedData.map((ex: any, i: number) => ({ ...ex, id: `manual_${Date.now()}_${i}` }));
        await registerActivityForWeightLoss(exercisesWithIds, true);
      }
      Alert.alert('Успех', 'Тренировка записана!');
    } catch (e: any) { Alert.alert('Ошибка связи', e.message); } finally { setIsLoading(false); }
  };

  const handleCalculateMealPreview = async () => {
    if (!mealInput.trim()) return;
    setIsMealPreviewLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/parse_meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: mealInput })
      });
      if (!response.ok) throw new Error('Сервер не отвечает');
      const data = await response.json();
      setMealPreview(data);
    } catch (e) {} finally { setIsMealPreviewLoading(false); }
  };

  const confirmAddMeal = () => {
    if (!mealPreview) return;
    saveNutritionDataLocally(
      consumedCalories + mealPreview.calories,
      consumedMacros.protein + mealPreview.protein,
      consumedMacros.fat + mealPreview.fat,
      consumedMacros.carb + mealPreview.carbs
    );
    setIsMealModalVisible(false);
    setMealInput('');
    setMealPreview(null);
  };

  const createNewChat = () => { setActiveChatId(null); setIsChatSidebarVisible(false); };

  const deleteChat = (id: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm("Удалить этот диалог?");
      if (confirmed) { setChatSessions(prev => prev.filter(c => c.id !== id)); if (activeChatId === id) setActiveChatId(null); }
    } else {
      Alert.alert("Удаление", "Удалить этот диалог?", [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: () => { setChatSessions(prev => prev.filter(c => c.id !== id)); if (activeChatId === id) setActiveChatId(null); }}
      ]);
    }
  };

  const startEditMessage = (msg: ChatMessage) => { setEditingMessageId(msg.id); setEditInput(msg.text); };

  const saveEditMessage = async () => {
    if (!activeChatId || !editingMessageId || !editInput.trim()) return;
    const chat = chatSessions.find(c => c.id === activeChatId);
    if (!chat) return;

    const msgIndex = chat.messages.findIndex(m => m.id === editingMessageId);
    if (msgIndex === -1) return;

    const updatedMessages = [...chat.messages.slice(0, msgIndex), { ...chat.messages[msgIndex], text: editInput.trim() }];
    setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: updatedMessages, updatedAt: Date.now() } : c));
    setEditingMessageId(null);
    setIsChatLoading(true);

    const apiMessages = updatedMessages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
    
    try {
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, user_id: session?.user?.id })
      });
      if (!response.ok) throw new Error('Бэкенд не отвечает');
      const data = await response.json();
      
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: data.reply || "К сожалению я не могу вам с этим помочь", sender: 'ai' };
      setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() } : c));

      if (data.calories && data.calories > 0) {
        saveNutritionDataLocally( consumedCalories + data.calories, consumedMacros.protein + (data.protein || 0), consumedMacros.fat + (data.fat || 0), consumedMacros.carb + (data.carbs || 0) );
      }
    } catch (error) {
      const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: "К сожалению я не могу вам с этим помочь", sender: 'ai' };
      setChatSessions(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, errorMsg], updatedAt: Date.now() } : c));
    } finally { setIsChatLoading(false); }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), text: chatInput.trim(), sender: 'user' };
    
    let chatId = activeChatId;
    let isNewChat = false;
    
    if (!chatId) { chatId = Date.now().toString(); isNewChat = true; setActiveChatId(chatId); }

    const activeChat = chatSessions.find(c => c.id === chatId);
    const generatedTitle = userMsg.text.length > 25 ? userMsg.text.substring(0, 25) + '...' : userMsg.text;

    const newSessionContent: ChatSession = isNewChat 
        ? { id: chatId, title: generatedTitle, messages: [userMsg], updatedAt: Date.now() }
        : { ...activeChat!, messages: [...activeChat!.messages, userMsg], updatedAt: Date.now(), title: activeChat!.title === 'Новый диалог' ? generatedTitle : activeChat!.title };
    
    setChatSessions(prev => isNewChat ? [newSessionContent, ...prev] : prev.map(c => c.id === chatId ? newSessionContent : c));
    setChatInput('');
    setIsChatLoading(true);

    const apiMessages = newSessionContent.messages.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text }));

    try {
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, user_id: session?.user?.id })
      });
      
      if (!response.ok) throw new Error('Бэкенд не отвечает');
      const data = await response.json();
      
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: data.reply || "К сожалению я не могу вам с этим помочь", sender: 'ai' };
      setChatSessions(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() } : c));

      if (data.calories && data.calories > 0) {
        saveNutritionDataLocally( consumedCalories + data.calories, consumedMacros.protein + (data.protein || 0), consumedMacros.fat + (data.fat || 0), consumedMacros.carb + (data.carbs || 0) );
      }
    } catch (error) {
      const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: "К сожалению я не могу вам с этим помочь", sender: 'ai' };
      setChatSessions(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, errorMsg], updatedAt: Date.now() } : c));
    } finally { setIsChatLoading(false); }
  };

  const addWater = () => { if (waterIntake < 5.0) setWaterIntake(prev => prev + 0.2); };
  const menuNavigate = (tabName: string) => { setCurrentTab(tabName); setIsSideMenuVisible(false); };

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

    // Фантомный датасет для корректных границ Y-оси
    const phantomData = weights.map((_, i) => i === 0 ? yMin : yMax);

    const datasets: any[] = [
      {
        data: weights,
        strokeWidth: 2.5,
        color: (opacity = 1) => `rgba(66, 212, 166, ${opacity})`,
      },
    ];

    // Линия целевого веса
    if (targetLineData) {
      datasets.push({
        data: targetLineData,
        strokeWidth: 1.5,
        color: () => 'rgba(255, 179, 71, 0.8)',
        withDots: false,
      });
    }

    // Фантомный датасет для Y-границ
    datasets.push({
      data: phantomData,
      strokeWidth: 0,
      color: () => 'rgba(0, 0, 0, 0)',
      withDots: false,
    });

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

    const changeColor = change > 0 ? '#ff6b6b' : change < 0 ? '#42d4a6' : '#888';
    const changeSign  = change > 0 ? '+' : '';

    // Для «День»: дельта к предыдущей записи
    let dayDelta: number | null = null;
    if (chartPeriod === 'day' && weightHistoryLogs.length > 0) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const prev = weightHistoryLogs
        .filter(l => new Date(l.created_at) < todayStart)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (prev.length > 0) dayDelta = currentWeight - prev[0].weight;
    }
    const dayDeltaColor = dayDelta === null ? '#888' : dayDelta > 0 ? '#ff6b6b' : dayDelta < 0 ? '#42d4a6' : '#aaa';
    const dayDeltaSign  = dayDelta !== null && dayDelta > 0 ? '+' : '';

    // Прогресс к цели (для строки под графиком)
    let goalRemaining = tw && tw > 0 && currentWeight > 0 ? Math.abs(currentWeight - tw) : 0;

    const periodTabs = [
      { key: 'day',   label: 'День'   },
      { key: 'week',  label: 'Неделя' },
      { key: 'month', label: 'Месяц'  },
      { key: 'year',  label: 'Год'    },
    ];

    return (
      <View style={styles.trackerCard}>

        {/* ── Переключатель периода ── */}
        <View style={styles.trackerTabs}>
          {periodTabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.trackerTab, chartPeriod === tab.key && styles.trackerTabActive]}
              onPress={() => setChartPeriod(tab.key)}
            >
              <Text style={[styles.trackerTabText, chartPeriod === tab.key && styles.trackerTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Заголовок ── */}
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.trackerPeriodLabel}>{periodHeader[chartPeriod]}</Text>
          {chartPeriod !== 'day' && rawData.length > 0 && (
            <>
              <Text style={styles.trackerAvgValue}>{avg.toFixed(1)} кг</Text>
              <Text style={styles.trackerAvgSub}>{avgLabel[chartPeriod]}</Text>
            </>
          )}
        </View>

        {/* ── День: большое число ── */}
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
              <Text style={{ color: '#555', fontSize: 13, marginTop: 8 }}>нет данных за вчера</Text>
            )}
            {tw && tw > 0 && (
              <View style={styles.trackerDayTargetRow}>
                <View style={styles.trackerDayTargetDash} />
                <Text style={styles.trackerDayTargetText}>цель {tw.toFixed(1)} кг · осталось {goalRemaining.toFixed(1)} кг</Text>
              </View>
            )}
          </View>
        )}

        {/* ── График ── */}
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
              backgroundColor: '#1C1C1E',
              backgroundGradientFrom: '#1C1C1E',
              backgroundGradientTo: '#1C1C1E',
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(66, 212, 166, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(255,255,255,0.38)`,
              style: { borderRadius: 12 },
              propsForDots: { r: '5', strokeWidth: '0', fill: '#42d4a6' },
              propsForBackgroundLines: { strokeWidth: 1, stroke: 'rgba(255,255,255,0.07)', strokeDasharray: '0' },
              fillShadowGradientFrom: '#42d4a6',
              fillShadowGradientFromOpacity: 0.18,
              fillShadowGradientTo: '#1C1C1E',
              fillShadowGradientToOpacity: 0,
            }}
            bezier
            style={{ marginVertical: 4, borderRadius: 12, marginLeft: -12 }}
            fromZero={false}
          />
        )}

        {chartPeriod !== 'day' && rawData.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 36 }}>
            <Text style={{ color: '#444', fontSize: 15 }}>Нет данных за этот период</Text>
          </View>
        )}

        {/* ── Мин / Макс / Изменение ── */}
        {chartPeriod !== 'day' && rawData.length > 0 && (
          <View style={styles.trackerStatsRow}>
            <View style={styles.trackerStat}>
              <Text style={styles.trackerStatLabel}>МИН</Text>
              <Text style={styles.trackerStatVal}>{min.toFixed(1)}</Text>
            </View>
            <View style={[styles.trackerStat, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#2C2C2C' }]}>
              <Text style={styles.trackerStatLabel}>МАКС</Text>
              <Text style={styles.trackerStatVal}>{max.toFixed(1)}</Text>
            </View>
            <View style={styles.trackerStat}>
              <Text style={styles.trackerStatLabel}>ИЗМЕНЕНИЕ</Text>
              <Text style={[styles.trackerStatVal, { color: changeColor }]}>{changeSign}{change.toFixed(1)}</Text>
            </View>
          </View>
        )}

        {/* ── Цель (пунктир + метка) ── */}
        {tw && tw > 0 && chartPeriod !== 'day' && (
          <View style={styles.trackerTargetRow}>
            <View style={styles.trackerTargetDash} />
            <Text style={styles.trackerTargetNote}>{tw.toFixed(1)} кг — цель · осталось {goalRemaining.toFixed(1)} кг</Text>
          </View>
        )}

        {/* ── Дней измерений ── */}
        {chartPeriod !== 'day' && daysTracked > 0 && (
          <Text style={styles.trackerDaysNote}>
            {daysTracked} {daysTracked === 1 ? 'день' : daysTracked < 5 ? 'дня' : 'дней'} измерений
          </Text>
        )}

      </View>
    );
  };
  
  if (isSwitchingAccount) {
    return (
      <View style={[styles.containerApp, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.tabBar} />
      </View>
    );
  }

  const displayName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Пользователь';

  if (!session) {
    if (authMode === 'login') {
      return (
        <View style={styles.authContainer}>
          <Text style={styles.title}>FitnessApp</Text>
          <Text style={styles.subtitle}>Вход в систему</Text>
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Пароль" placeholderTextColor={COLORS.textSecondary} secureTextEntry value={password} onChangeText={setPassword} />
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoadingAuth}>
            {isLoadingAuth ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode('role_select')} style={{marginTop: 25}}>
            <Text style={styles.linkText}>Нет аккаунта? Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (authMode === 'role_select') {
      return (
        <View style={styles.authContainer}>
          <Text style={styles.title}>Новый аккаунт</Text>
          <Text style={styles.subtitle}>Выберите свою роль</Text>
          <TouchableOpacity style={styles.choiceButton} onPress={() => { setUserRole('client'); setAuthMode('register_credentials'); }}><Text style={styles.buttonText}>Я Клиент</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.choiceButton, {backgroundColor: '#000'}]} onPress={() => { setUserRole('trainer'); setAuthMode('register_credentials'); }}><Text style={styles.buttonText}>Я Тренер</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode('login')} style={styles.backButton}><Text style={styles.backButtonText}>← Вернуться ко входу</Text></TouchableOpacity>
        </View>
      );
    }
    if (authMode === 'register_credentials') {
      const passwordsMatch = password === confirmPassword || confirmPassword === '';
      return (
        <View style={styles.authContainer}>
          <Text style={styles.title}>Регистрация</Text>
          <TextInput style={styles.input} placeholder="Ваше Имя / Никнейм" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Пароль" secureTextEntry value={password} onChangeText={setPassword} />
          <TextInput style={[styles.input, !passwordsMatch && styles.inputError]} placeholder="Подтвердите пароль" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
          <TouchableOpacity style={[styles.button, {marginTop: 10}]} onPress={handleCredentialsNext} disabled={isLoadingAuth || !passwordsMatch}>
            {isLoadingAuth ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Далее →</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode('role_select')} style={styles.backButton}><Text style={styles.backButtonText}>← К выбору роли</Text></TouchableOpacity>
        </View>
      );
    }
    if (authMode === 'register_goal') {
      return (
        <View style={styles.authContainer}>
          <Text style={styles.title}>Какая у вас цель?</Text>
          <TouchableOpacity style={styles.wizardOptionBtn} onPress={() => handleGoalNext('lose')}><Text style={styles.wizardOptionText}>🔥 Похудеть</Text></TouchableOpacity>
          <TouchableOpacity style={styles.wizardOptionBtn} onPress={() => handleGoalNext('gain')}><Text style={styles.wizardOptionText}>💪 Набрать массу</Text></TouchableOpacity>
          <TouchableOpacity style={styles.wizardOptionBtn} onPress={() => handleGoalNext('maintain')}><Text style={styles.wizardOptionText}>⚖️ Поддерживать вес</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode('register_credentials')} style={styles.backButton}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
        </View>
      );
    }
    if (authMode === 'register_target_weight') {
      return (
        <View style={styles.authContainer}>
          <Text style={styles.title}>Цель в цифрах</Text>
          <Text style={[styles.label, {textAlign: 'center', width: '100%', marginBottom: 15}]}>Укажите желаемый вес (кг):</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15 }}>
            <ScrollPicker items={weightWholeData} selectedValue={targetWeightWhole} onValueChange={(val: string | number) => setTargetWeightWhole(val as number)} width={80} />
            <Text style={{fontSize: 30, fontWeight: 'bold', marginHorizontal: 5, color: COLORS.textPrimary}}>.</Text>
            <ScrollPicker items={decimalsData} selectedValue={targetWeightDec} onValueChange={(val: string | number) => setTargetWeightDec(val as string)} width={80} />
          </View>
          <TouchableOpacity style={[styles.button, {marginTop: 10}]} onPress={() => setAuthMode('register_frequency')}><Text style={styles.buttonText}>Далее →</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode('register_goal')} style={styles.backButton}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
        </View>
      );
    }
    if (authMode === 'register_frequency') {
      return (
        <View style={styles.authContainer}>
          <Text style={styles.title}>Частота тренировок</Text>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20}}>
            <TouchableOpacity style={[styles.wizardSquareBtn, workoutsPerWeek === '1-2' && styles.wizardSquareBtnActive]} onPress={() => setWorkoutsPerWeek('1-2')}><Text style={styles.wizardSquareText}>1-2</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.wizardSquareBtn, workoutsPerWeek === '3-4' && styles.wizardSquareBtnActive]} onPress={() => setWorkoutsPerWeek('3-4')}><Text style={styles.wizardSquareText}>3-4</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.wizardSquareBtn, workoutsPerWeek === '5+' && styles.wizardSquareBtnActive]} onPress={() => setWorkoutsPerWeek('5+')}><Text style={styles.wizardSquareText}>5+</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.button, {marginTop: 10}]} onPress={() => setAuthMode('register_metrics')} disabled={!workoutsPerWeek}><Text style={styles.buttonText}>Далее →</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode(goal === 'maintain' ? 'register_goal' : 'register_target_weight')} style={styles.backButton}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
        </View>
      );
    }
    if (authMode === 'register_metrics') {
      return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: COLORS.bg }}>
          <Text style={styles.title}>О вас</Text>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, marginTop: 10}}>
            <TouchableOpacity style={[styles.wizardGenderBtn, userGender === 'male' && styles.wizardGenderBtnActive]} onPress={() => setUserGender('male')}><Text style={styles.wizardGenderText}>Мужчина</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.wizardGenderBtn, userGender === 'female' && styles.wizardGenderBtnActive]} onPress={() => setUserGender('female')}><Text style={styles.wizardGenderText}>Женщина</Text></TouchableOpacity>
          </View>
          <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15 }}>
            <Text style={styles.label}>Возраст (лет)</Text>
            <View style={{alignItems: 'center'}}><ScrollPicker items={ageData} selectedValue={userAge} onValueChange={(val: string | number) => setUserAge(val as number)} width={120} /></View>
          </View>
          <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15 }}>
            <Text style={styles.label}>Рост (см)</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <ScrollPicker items={heightWholeData} selectedValue={userHeightWhole} onValueChange={(val: string | number) => setUserHeightWhole(val as number)} width={80} />
              <Text style={{fontSize: 30, fontWeight: 'bold', marginHorizontal: 5, color: COLORS.textPrimary}}>.</Text>
              <ScrollPicker items={decimalsData} selectedValue={userHeightDec} onValueChange={(val: string | number) => setUserHeightDec(val as string)} width={80} />
            </View>
          </View>
          <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15 }}>
            <Text style={styles.label}>Вес (кг)</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <ScrollPicker items={weightWholeData} selectedValue={userWeightWhole} onValueChange={(val: string | number) => setUserWeightWhole(val as number)} width={80} />
              <Text style={{fontSize: 30, fontWeight: 'bold', marginHorizontal: 5, color: COLORS.textPrimary}}>.</Text>
              <ScrollPicker items={decimalsData} selectedValue={userWeightDec} onValueChange={(val: string | number) => setUserWeightDec(val as string)} width={80} />
            </View>
          </View>
          <TouchableOpacity style={[styles.button, {marginTop: 10}]} onPress={handleFinalRegister} disabled={isLoadingAuth || !userGender}>
            {isLoadingAuth ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Завершить регистрацию</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode('register_frequency')} style={[styles.backButton, {marginBottom: 30}]}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
        </ScrollView>
      );
    }
  }

  const renderCalendarList = () => {
    if (upcomingSessions.length === 0) return (<View style={styles.emptyCardList}><Text style={styles.placeholderText}>На ближайшее время записей нет</Text></View>);
    const grouped: { [key: string]: TrainingSession[] } = upcomingSessions.reduce((acc: any, sess: TrainingSession) => {
      if (!acc[sess.session_date]) acc[sess.session_date] = [];
      acc[sess.session_date].push(sess); return acc;
    }, {});
    return Object.keys(grouped).sort().map((dateStr: string) => (
      <View key={dateStr} style={styles.dateGroup}>
        <View style={styles.dateHeaderRow}><Ionicons name="calendar" size={20} color={COLORS.textPrimary} style={{marginRight: 8}} /><Text style={styles.dateHeaderText}>{new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}</Text></View>
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

  const renderHome = () => {
    const caloriesProgress = dailyCalorieNorm > 0 ? Math.min((consumedCalories / dailyCalorieNorm) * 100, 100) : 0;

    return (
      <ScrollView contentContainerStyle={styles.mainContent}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 15 }}>
            <Text style={styles.greeting} numberOfLines={1}>Привет, {displayName}! 👋</Text>
            <Text style={styles.subGreeting}>{userRole === 'trainer' ? 'Тренер' : 'Спортсмен'}</Text>
          </View>
          <TouchableOpacity onPress={() => setIsSideMenuVisible(true)} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={38} color={COLORS.textPrimary} /></TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.mainActionBtn, {backgroundColor: '#000', marginBottom: 15}]} onPress={() => setIsScheduleListVisible(true)}>
          <Ionicons name="calendar-outline" size={24} color="#fff" style={{marginRight: 10}} />
          <Text style={styles.mainActionText}>Календарь записей</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.mainActionBtn} onPress={() => setCurrentTab('workout')}>
          <Ionicons name="add-circle" size={24} color="#fff" style={{marginRight: 10}} />
          <Text style={styles.mainActionText}>Свободная тренировка</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.metricCardFull} onPress={() => setCurrentTab('nutrition')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name="restaurant-outline" size={28} color={COLORS.tabBar} style={{ marginRight: 10 }} />
            <Text style={styles.metricTitle}>Питание за сегодня</Text>
          </View>
          <Text style={styles.metricValueFull}>{consumedCalories} / {dailyCalorieNorm > 0 ? dailyCalorieNorm : '---'} ккал</Text>
          <View style={[styles.progressBarBg, { width: '100%', height: 12, marginTop: 10, marginLeft: 0 }]}>
            <View style={[styles.progressBarFill, { width: `${caloriesProgress}%`, backgroundColor: caloriesProgress >= 100 ? COLORS.error : COLORS.tabBar }]} />
          </View>
        </TouchableOpacity>

        <View style={styles.metricsRow}>
          <TouchableOpacity style={styles.metricCard} onPress={() => setIsWeightModalVisible(true)}>
            <Ionicons name="scale-outline" size={28} color={COLORS.tabBar} />
            <Text style={styles.metricTitle}>Вес</Text>
            <Text style={styles.metricValue}>{currentWeight > 0 ? `${currentWeight} кг` : '---'}</Text>
            <Text style={{fontSize: 12, color: COLORS.textSecondary, marginTop: 2}}>Изменить 📝</Text>
          </TouchableOpacity>

          <View style={styles.metricCard}>
            <Ionicons name="water-outline" size={28} color={COLORS.tabBar} />
            <Text style={styles.metricTitle}>Вода</Text>
            <Text style={styles.metricValue}>{waterIntake.toFixed(1)} л</Text>
            <TouchableOpacity style={styles.miniBtn} onPress={addWater}><Text style={styles.miniBtnText}>+200 мл</Text></TouchableOpacity>
          </View>
        </View>

        <Modal visible={isWeightModalVisible} transparent animationType="slide">
          <View style={styles.wmOverlay}>

            {/* ── Header ── */}
            <View style={styles.wmHeader}>
              <View>
                <Text style={styles.wmTitle}>Вес</Text>
                <Text style={styles.wmSubtitle}>
                  {userGoal === 'lose' ? 'Цель: похудение' : userGoal === 'gain' ? 'Цель: набор массы' : 'Цель: поддержание'}
                </Text>
              </View>
              <TouchableOpacity style={styles.wmCloseBtn} onPress={() => setIsWeightModalVisible(false)}>
                <Ionicons name="close" size={18} color="#8B9EC0" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.wmScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

              {/* ── Hero: текущий вес ── */}
              <View style={styles.wmHero}>
                <Text style={styles.wmHeroLabel}>ТЕКУЩИЙ ВЕС</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
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
                {/* Progress bar to goal */}
                {targetWeight && targetWeight > 0 && weightHistoryLogs.length > 0 && (() => {
                  const startW = weightHistoryLogs[weightHistoryLogs.length - 1]?.weight || currentWeight;
                  const total = Math.abs(startW - targetWeight);
                  const done  = Math.abs(startW - currentWeight);
                  const pct   = total > 0 ? Math.min(Math.round(done / total * 100), 100) : 0;
                  return (
                    <View style={{ width: '100%', marginTop: 14 }}>
                      <View style={styles.wmProgressBg}>
                        <View style={[styles.wmProgressFill, { width: `${pct}%` as any }]} />
                      </View>
                      <Text style={styles.wmProgressPct}>{pct}%</Text>
                    </View>
                  );
                })()}
              </View>

              {/* ── Ввод веса ── */}
              <View style={styles.wmInputCard}>
                <Text style={styles.wmInputLabel}>Записать новый вес</Text>
                <View style={styles.wmPickerRow}>
                  <ScrollPicker items={weightWholeData} selectedValue={manualWeightWhole} onValueChange={(val: string | number) => setManualWeightWhole(val as number)} width={90} textColor="#F0F6FF" lineColor="#22D3EE" />
                  <Text style={styles.wmPickerDot}>.</Text>
                  <ScrollPicker items={decimalsData} selectedValue={manualWeightDec} onValueChange={(val: string | number) => setManualWeightDec(val as string)} width={90} textColor="#F0F6FF" lineColor="#22D3EE" />
                </View>
                <TouchableOpacity style={styles.wmSaveBtn} onPress={handleManualWeightUpdate} disabled={isLoading}>
                  {isLoading ? <ActivityIndicator color="#080D18" /> : <Text style={styles.wmSaveBtnText}>Сохранить</Text>}
                </TouchableOpacity>
              </View>

              {/* ── График ── */}
              {renderChartSection()}

              {/* ── История ── */}
              <Text style={styles.wmSectionTitle}>История измерений</Text>
              {weightHistoryLogs.slice(0, 7).map((log: WeightLog, i: number) => {
                const prevLog = weightHistoryLogs[i + 1];
                let diff = 0;
                let hasDiff = false;
                if (prevLog) { diff = log.weight - prevLog.weight; hasDiff = true; }
                const diffColor = diff > 0 ? '#FB7185' : diff < 0 ? '#34D399' : '#4A5D7A';
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
                      <Text style={styles.wmHistoryWeight}>{log.weight.toFixed(1)} <Text style={{ fontSize: 13, fontWeight: '500', color: '#8B9EC0' }}>кг</Text></Text>
                      {diffLabel && (
                        <Text style={[styles.wmHistoryDelta, { color: diffColor }]}>{diffLabel} кг</Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {weightHistoryLogs.length === 0 && (
                <Text style={{ color: '#4A5D7A', textAlign: 'center', paddingVertical: 20, fontSize: 14 }}>Нет записей</Text>
              )}

            </ScrollView>
          </View>
        </Modal>

        <Modal visible={isScheduleListVisible} transparent animationType="slide">
          <View style={styles.modalOverlayFull}>
            <View style={styles.modalContentFull}>
              <View style={styles.modalHeaderFull}>
                <Text style={styles.modalTitleFull}>📅 Расписание</Text>
                <TouchableOpacity onPress={() => setIsScheduleListVisible(false)}><Ionicons name="close-circle" size={32} color={COLORS.textSecondary} /></TouchableOpacity>
              </View>
              {userRole === 'trainer' && (<TouchableOpacity style={[styles.button, { marginBottom: 15 }]} onPress={startScheduling}><Text style={styles.buttonText}>+ Запланировать</Text></TouchableOpacity>)}
              <ScrollView style={{width: '100%', marginTop: 10, paddingBottom: 50}}>{renderCalendarList()}</ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={isSchedulingVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Новая запись</Text>
              {scheduleStep === 'group' && ( <View style={{width: '100%'}}><Text style={styles.label}>1. Выберите клуб:</Text>{groups.map((g: Group) => (<TouchableOpacity key={g.id} style={styles.selectItem} onPress={() => selectGroupForSchedule(g)}><Text style={styles.selectItemText}>{g.name}</Text></TouchableOpacity>))}</View> )}
              {scheduleStep === 'member' && ( <View style={{width: '100%'}}><Text style={styles.label}>2. Кто тренируется?</Text>{groupMembers.map((m: GroupMember) => (<TouchableOpacity key={m.id} style={[styles.selectItem, schedSelectedMember?.id === m.id && {borderColor: COLORS.tabBar, borderWidth: 2}]} onPress={() => {setSchedSelectedMember(m); setScheduleStep('final');}}><Text style={styles.selectItemText}>{m.name || m.email}</Text></TouchableOpacity>))}</View> )}
              {scheduleStep === 'final' && ( <View style={{width: '100%'}}><Text style={styles.label}>3. Укажите дату и время:</Text><TouchableOpacity style={styles.pickerButton} onPress={() => setDatePickerVisible(true)}><Text style={styles.pickerButtonText}>{schedDate ? schedDate : 'Выбрать дату'}</Text></TouchableOpacity><TouchableOpacity style={styles.pickerButton} onPress={() => setTimePickerVisible(true)}><Text style={styles.pickerButtonText}>{schedTime ? schedTime : 'Выбрать время'}</Text></TouchableOpacity>{datePickerVisible && ( <DateTimePicker value={tempDate} mode="date" display="default" onChange={onDateChange} /> )}{timePickerVisible && ( <DateTimePicker value={tempDate} mode="time" is24Hour={true} display="default" onChange={onTimeChange} /> )}<TouchableOpacity style={[styles.button, {marginTop: 10}]} onPress={saveTrainingSession}><Text style={styles.buttonText}>Сохранить</Text></TouchableOpacity></View> )}
              <TouchableOpacity style={styles.backButton} onPress={() => {setIsSchedulingVisible(false); setScheduleStep('group');}}><Text style={styles.backButtonText}>Отмена</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  };

  const calculateProgress = (memberId: string) => {
    const w = todayWorkouts.find((plan: AssignedWorkout) => plan.client_id === memberId);
    if (!w || !w.workout_data || w.workout_data.length === 0) return 0;
    const completed = w.workout_data.filter((ex: WorkoutData) => ex.completed).length;
    return (completed / w.workout_data.length) * 100;
  };

  const renderClanTab = () => {
    if (activeGroup) {
      const isOwner = session?.user && activeGroup.owner_id === session.user.id;
      const myPlan = todayWorkouts.find((w: AssignedWorkout) => session?.user && w.client_id === session.user.id);
      
      return (
        <View style={styles.groupDetailContainer}>
          <View style={styles.groupHeader}>
            <TouchableOpacity onPress={() => { setActiveGroup(null); setGroupMembers([]); setTodayWorkouts([]); }}><Ionicons name="arrow-back" size={30} color={COLORS.textPrimary} /></TouchableOpacity>
            <Text style={styles.groupHeaderTitle} numberOfLines={1}>{activeGroup.name}</Text>
            <TouchableOpacity onPress={() => {Alert.alert(isOwner ? "Настройки" : "Клуб", `Код доступа: ${activeGroup.code}`, [{ text: isOwner ? "Удалить клуб" : "Выйти из клуба", style: "destructive", onPress: () => deleteOrLeaveGroup(activeGroup) }, { text: "Закрыть", style: "cancel" }]);}}><Ionicons name="settings-sharp" size={28} color={COLORS.textPrimary} /></TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}}>
            {userRole === 'trainer' && (
              <View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}><Text style={styles.historyTitle}>Участники ({groupMembers.length})</Text><TouchableOpacity onPress={fetchGroupDetails}><Ionicons name="refresh" size={24} color={COLORS.tabBar} /></TouchableOpacity></View>
                {groupMembers.map((member: GroupMember) => {
                  if (session?.user && member.id === session.user.id) return null; 
                  const progress = calculateProgress(member.id);
                  return (
                    <TouchableOpacity key={member.id} style={styles.memberCard} onPress={() => setSelectedMember(member)}>
                      <View style={{flex: 1}}><Text style={styles.memberName}>{member.name || member.email}</Text><Text style={styles.memberRole}>Прогресс: {Math.round(progress)}%</Text></View>
                      <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: progress === 100 ? COLORS.success : COLORS.tabBar }]} /></View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {userRole === 'client' && (
              <View style={{marginTop: 20}}><TouchableOpacity style={styles.mainActionBtn} onPress={() => setIsMyWorkoutVisible(true)}><Ionicons name="fitness-outline" size={24} color="#fff" style={{marginRight: 10}} /><Text style={styles.mainActionText}>Моя тренировка на сегодня</Text></TouchableOpacity><Text style={styles.placeholderText}>Код клуба: {activeGroup.code}</Text></View>
            )}
          </ScrollView>

          <Modal visible={!!selectedMember} transparent animationType="slide">
            <View style={styles.modalOverlayFull}>
              <View style={styles.modalContentFull}>
                <View style={styles.modalHeaderFull}>
                  <Text style={styles.modalTitleFull}>План: {selectedMember?.name || selectedMember?.email?.split('@')[0]}</Text>
                  <TouchableOpacity onPress={() => setSelectedMember(null)}><Ionicons name="close-circle" size={32} color={COLORS.textSecondary} /></TouchableOpacity>
                </View>
                <ScrollView style={{width: '100%', marginTop: 10}}>
                  <Text style={styles.label}>Новая тренировка (ИИ):</Text>
                  <TextInput style={styles.inputArea} multiline placeholder="Присед 100кг 3 по 10..." placeholderTextColor={COLORS.textSecondary} value={assignNote} onChangeText={setAssignNote} />
                  <TouchableOpacity style={[styles.button, {marginBottom: 25}]} onPress={assignWorkoutToMember} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Добавить/Назначить</Text>}</TouchableOpacity>
                  <Text style={styles.historyTitle}>Выполнение сегодня:</Text>
                  {(() => {
                    const plan = todayWorkouts.find((w: AssignedWorkout) => w.client_id === selectedMember?.id);
                    if (!plan || !plan.workout_data.length) return <Text style={styles.placeholderText}>План не назначен</Text>;
                    const groupedData = groupWorkoutData(plan.workout_data);
                    return groupedData.map((group: GroupedWorkout, gIdx: number) => (
                      <View key={gIdx} style={{marginBottom: 15}}>
                        <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
                        {group.sets.map((ex: WorkoutData, idx: number) => ( <View key={idx} style={[styles.setRow, {paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', paddingLeft: 10}]}><Text style={[styles.exerciseSetText, ex.completed && {textDecorationLine: 'line-through', color: COLORS.textSecondary}]}>Подход {idx + 1}: {ex.weight}кг x {ex.reps}</Text><Ionicons name={ex.completed ? "checkmark-circle" : "ellipse-outline"} size={28} color={ex.completed ? COLORS.success : COLORS.textSecondary} /></View> ))}
                      </View>
                    ));
                  })()}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <Modal visible={isMyWorkoutVisible} transparent animationType="slide">
            <View style={styles.modalOverlayFull}>
              <View style={styles.modalContentFull}>
                <View style={styles.modalHeaderFull}>
                  <Text style={styles.modalTitleFull}>План на сегодня</Text>
                  <TouchableOpacity onPress={() => setIsMyWorkoutVisible(false)}><Ionicons name="close-circle" size={32} color={COLORS.textSecondary} /></TouchableOpacity>
                </View>
                <ScrollView style={{width: '100%', marginTop: 10}}>
                  {!myPlan || !myPlan.workout_data.length ? (
                     <View style={{alignItems: 'center', marginTop: 50}}><Ionicons name="cafe-outline" size={80} color={COLORS.tabBar} /><Text style={styles.emptyText}>Тренер еще не назначил план. Отдыхаем!</Text></View>
                  ) : (
                    groupWorkoutData(myPlan.workout_data).map((group: GroupedWorkout, gIdx: number) => (
                      <View key={gIdx} style={{marginBottom: 20}}>
                        <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
                        {group.sets.map((ex: WorkoutData, idx: number) => (
                          <TouchableOpacity key={ex.id} style={styles.clientExerciseCard} onPress={() => toggleExerciseStatus(myPlan.id, ex.id, ex.completed || false)}>
                            <View style={{flex: 1}}><Text style={[styles.exerciseSetText, ex.completed && {textDecorationLine: 'line-through', color: COLORS.textSecondary}]}>Подход {idx + 1}</Text><Text style={styles.setDetails}>{ex.weight}кг × {ex.reps}</Text></View>
                            <Ionicons name={ex.completed ? "checkbox" : "square-outline"} size={36} color={ex.completed ? COLORS.success : COLORS.tabBar} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      );
    }

    return (
      <View style={styles.mainContent}>
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Клубы</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {userRole === 'trainer' && (<TouchableOpacity onPress={() => setIsCreatingGroup(true)} style={{ marginRight: 15 }}><Ionicons name="add-circle" size={35} color={COLORS.tabBar} /></TouchableOpacity>)}
            <TouchableOpacity onPress={() => setIsSideMenuVisible(true)} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={38} color={COLORS.textPrimary} /></TouchableOpacity>
          </View>
        </View>
        {groups.length === 0 ? (
          <View style={styles.emptyGroupsContainer}>
            <Ionicons name="people-circle-outline" size={100} color={COLORS.tabBar} />
            <Text style={styles.emptyText}>Вы еще не состоите в клубах</Text>
            <View style={styles.actionButtonsRow}>
              {userRole === 'trainer' && (<TouchableOpacity style={styles.centerActionBtn} onPress={() => setIsCreatingGroup(true)}><Text style={styles.buttonText}>Создать клуб</Text></TouchableOpacity>)}
              <TouchableOpacity style={[styles.centerActionBtn, {backgroundColor: '#000', marginTop: 10}]} onPress={() => setIsJoiningGroup(true)}><Text style={styles.buttonText}>Вступить по коду</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.groupsGrid}>
            {groups.map((group: Group) => (
              <TouchableOpacity key={group.id} style={styles.groupSquare} onPress={() => setActiveGroup(group)}><Ionicons name="people" size={40} color={COLORS.tabBar} /><Text style={styles.groupSquareText} numberOfLines={1}>{group.name}</Text></TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.groupSquare, {backgroundColor: 'rgba(0,0,0,0.05)', borderStyle: 'dashed', borderWidth: 2, borderColor: COLORS.tabBar}]} onPress={() => setIsJoiningGroup(true)}><Ionicons name="enter-outline" size={40} color={COLORS.tabBar} /><Text style={styles.groupSquareText}>Вступить</Text></TouchableOpacity>
          </ScrollView>
        )}
        <Modal visible={isCreatingGroup} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Название клуба</Text>
              <TextInput style={styles.input} value={newGroupName} onChangeText={setNewGroupName} placeholder="Напр: Power Gym" placeholderTextColor={COLORS.textSecondary}/>
              <TouchableOpacity style={styles.button} onPress={createGroup}><Text style={styles.buttonText}>Создать</Text></TouchableOpacity>
              <TouchableOpacity style={{marginTop: 15}} onPress={() => setIsCreatingGroup(false)}><Text style={styles.backButtonText}>Отмена</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
        <Modal visible={isJoiningGroup} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Код доступа</Text>
              <TextInput style={styles.input} value={joinCode} onChangeText={setJoinCode} keyboardType="numeric" maxLength={6} placeholder="6 цифр" placeholderTextColor={COLORS.textSecondary}/>
              <TouchableOpacity style={[styles.button, {backgroundColor: '#000'}]} onPress={joinGroup}><Text style={styles.buttonText}>Подключиться</Text></TouchableOpacity>
              <TouchableOpacity style={{marginTop: 15}} onPress={() => setIsJoiningGroup(false)}><Text style={styles.backButtonText}>Отмена</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderWorkout = () => (
    <ScrollView contentContainerStyle={styles.mainContent}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Личный Журнал</Text></View>
        <TouchableOpacity onPress={() => setIsSideMenuVisible(true)} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={38} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>
      <View style={styles.inputSection}>
        <TextInput style={styles.inputArea} multiline placeholder="Жим 100кг 5 по 5..." placeholderTextColor={COLORS.textSecondary} value={note} onChangeText={setNote} />
        <TouchableOpacity style={styles.button} onPress={sendToAI} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить с помощью ИИ</Text>}</TouchableOpacity>
      </View>
      <Text style={styles.historyTitle}>Последние записи</Text>
      {history.map((workout: WorkoutRecord) => {
        const groupedData = groupWorkoutData(workout.parsed_data || []);
        return (
          <View key={workout.id} style={styles.historyCard}>
            <Text style={styles.dateText}>{new Date(workout.created_at).toLocaleString('ru-RU')}</Text>
            {groupedData.map((group: GroupedWorkout, gIdx: number) => (
              <View key={gIdx} style={{marginTop: 10}}>
                <Text style={styles.groupExerciseTitle}>{group.exercise}</Text>
                {group.sets.map((item: WorkoutData, index: number) => (
                  <View key={index} style={[styles.setRow, {paddingLeft: 10}]}><Text style={styles.exerciseSetText}>Подход {index + 1}</Text><Text style={styles.setDetails}>{item.weight}кг × {item.reps}</Text></View>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );

  const renderNutrition = () => {
    const caloriesProgress = dailyCalorieNorm > 0 ? Math.min((consumedCalories / dailyCalorieNorm) * 100, 100) : 0;
    const pProgress = dailyMacros.protein > 0 ? Math.min((consumedMacros.protein / dailyMacros.protein) * 100, 100) : 0;
    const fProgress = dailyMacros.fat > 0 ? Math.min((consumedMacros.fat / dailyMacros.fat) * 100, 100) : 0;
    const cProgress = dailyMacros.carb > 0 ? Math.min((consumedMacros.carb / dailyMacros.carb) * 100, 100) : 0;

    return (
      <View style={styles.mainContent}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Питание</Text></View>
          <TouchableOpacity onPress={() => setIsSideMenuVisible(true)} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={38} color={COLORS.textPrimary} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
          <View style={styles.metricCardFull}>
            <Text style={styles.metricTitle}>Съедено за сегодня</Text>
            <Text style={styles.metricValueFull}>{consumedCalories} / {dailyCalorieNorm > 0 ? dailyCalorieNorm : '--'} ккал</Text>
            <View style={[styles.progressBarBg, { width: '100%', height: 18, marginTop: 10, borderRadius: 10 }]}>
              <View style={[styles.progressBarFill, { width: `${caloriesProgress}%`, backgroundColor: caloriesProgress >= 100 ? COLORS.error : COLORS.tabBar, borderRadius: 10 }]} />
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

          <TouchableOpacity style={[styles.mainActionBtn, {marginTop: 15}]} onPress={() => setIsMealModalVisible(true)}>
            <Ionicons name="add-circle" size={24} color="#fff" style={{marginRight: 10}} />
            <Text style={styles.mainActionText}>Добавить блюдо</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={isMealModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlayFull}>
             <View style={styles.modalContentFull}>
                <View style={styles.modalHeaderFull}>
                   <Text style={styles.modalTitleFull}>Запись блюда</Text>
                   <TouchableOpacity onPress={() => { setIsMealModalVisible(false); setMealPreview(null); setMealInput(''); }}>
                      <Ionicons name="close-circle" size={32} color={COLORS.textSecondary} />
                   </TouchableOpacity>
                </View>

                <ScrollView style={{width: '100%', marginTop: 10}}>
                   <Text style={styles.label}>Что вы съели?</Text>
                   <TextInput style={styles.inputArea} placeholder="Например: 200г вареной курицы и гречка" placeholderTextColor={COLORS.textSecondary} value={mealInput} onChangeText={setMealInput} multiline />

                   <TouchableOpacity style={[styles.button, {backgroundColor: '#000', marginBottom: 25}]} onPress={handleCalculateMealPreview} disabled={isMealPreviewLoading}>
                      {isMealPreviewLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Рассчитать КБЖУ</Text>}
                   </TouchableOpacity>

                   {mealPreview && (
                      <View style={styles.previewContainer}>
                         <Text style={styles.previewTitle}>{mealPreview.name}</Text>
                         <Text style={styles.previewCals}>{mealPreview.calories} ккал</Text>
                         
                         <View style={styles.previewMacrosRow}>
                            <View style={styles.previewMacro}><Text style={{color: COLORS.protein, fontWeight:'bold'}}>Белки</Text><Text>{mealPreview.protein} г</Text></View>
                            <View style={styles.previewMacro}><Text style={{color: COLORS.fat, fontWeight:'bold'}}>Жиры</Text><Text>{mealPreview.fat} г</Text></View>
                            <View style={styles.previewMacro}><Text style={{color: COLORS.carb, fontWeight:'bold'}}>Углеводы</Text><Text>{mealPreview.carbs} г</Text></View>
                         </View>

                         <TouchableOpacity style={[styles.button, {marginTop: 20}]} onPress={confirmAddMeal}>
                            <Text style={styles.buttonText}>Добавить</Text>
                         </TouchableOpacity>
                      </View>
                   )}
                </ScrollView>
             </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderChatSidebar = () => (
    <Modal visible={isChatSidebarVisible} transparent animationType="fade">
      <View style={styles.chatSidebarOverlay}>
         <View style={styles.chatSidebarContent}>
            <TouchableOpacity style={styles.newChatBtnSidebar} onPress={createNewChat}>
               <Ionicons name="add" size={24} color="#fff" />
               <Text style={styles.newChatBtnTextSidebar}>Новый чат</Text>
            </TouchableOpacity>
            
            <Text style={styles.sidebarSectionTitle}>Чаты</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {chatSessions.sort((a,b) => b.updatedAt - a.updatedAt).map(chat => (
                 <View key={chat.id} style={[styles.chatSidebarItem, activeChatId === chat.id && styles.chatSidebarItemActive]}>
                    <TouchableOpacity style={{flex: 1, flexDirection: 'row', alignItems: 'center'}} onPress={() => { setActiveChatId(chat.id); setIsChatSidebarVisible(false); }}>
                       <Ionicons name="chatbubble-outline" size={20} color={COLORS.chatSidebarText} style={{marginRight: 10}} />
                       <Text style={styles.chatSidebarItemText} numberOfLines={1}>{chat.title}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteChat(chat.id)} style={{padding: 5}}>
                       <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    </TouchableOpacity>
                 </View>
              ))}
              {chatSessions.length === 0 && <Text style={{color: '#666', marginTop: 10, fontSize: 14}}>Нет диалогов</Text>}
            </ScrollView>
         </View>
         <TouchableOpacity style={styles.chatSidebarCloseArea} onPress={() => setIsChatSidebarVisible(false)} />
      </View>
    </Modal>
  );

  const renderChat = () => {
    const activeChat = chatSessions.find(c => c.id === activeChatId);
    const currentMessages = activeChat ? activeChat.messages : [];

    return (
      <View style={styles.mainContent}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsChatSidebarVisible(true)} style={{padding: 5, marginRight: 15}}>
             <Ionicons name="menu" size={32} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginRight: 15 }}>
             <Text style={styles.pageTitle} numberOfLines={1}>{activeChatId ? activeChat?.title : 'Новый чат'}</Text>
          </View>
          <TouchableOpacity onPress={() => setIsSideMenuVisible(true)} style={styles.profileBtn}>
             <Ionicons name="person-circle-outline" size={38} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {renderChatSidebar()}

        {!activeChatId && currentMessages.length === 0 ? (
          <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20}}>
             <Text style={{fontSize: 28, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 10, textAlign: 'center'}}>
                Привет, {displayName}!
             </Text>
             <Text style={{fontSize: 22, color: COLORS.textSecondary, textAlign: 'center'}}>
                Что делаем дальше?
             </Text>
          </View>
        ) : (
          <ScrollView style={styles.chatContainer} contentContainerStyle={{ paddingBottom: 20 }} ref={chatScrollRef} onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false}>
            {currentMessages.map(msg => (
              editingMessageId === msg.id ? (
                <View key={msg.id} style={styles.editMessageContainer}>
                  <TextInput style={styles.editMessageInput} value={editInput} onChangeText={setEditInput} multiline />
                  <View style={styles.editMessageActions}>
                    <TouchableOpacity onPress={() => setEditingMessageId(null)} style={{padding: 5}}><Text style={{color: COLORS.error, marginRight: 20, fontSize: 16}}>Отмена</Text></TouchableOpacity>
                    <TouchableOpacity onPress={saveEditMessage} style={{padding: 5}}><Text style={{color: COLORS.tabBar, fontWeight: 'bold', fontSize: 16}}>Сохранить и отправить</Text></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View key={msg.id} style={[styles.chatBubble, msg.sender === 'user' ? styles.chatBubbleUser : styles.chatBubbleAI]}>
                  <Text style={[styles.chatText, msg.sender === 'user' ? styles.chatTextUser : styles.chatTextAI]}>{msg.text}</Text>
                  {msg.sender === 'user' && (
                    <TouchableOpacity onPress={() => startEditMessage(msg)} style={styles.editIconBtn}>
                      <Ionicons name="pencil" size={14} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              )
            ))}
            {isChatLoading && ( <View style={[styles.chatBubble, styles.chatBubbleAI, { width: 60, alignItems: 'center' }]}><ActivityIndicator size="small" color={COLORS.tabBar} /></View> )}
          </ScrollView>
        )}

        <View style={styles.chatInputRow}>
          <TextInput style={styles.chatInput} placeholder="Запитайте AI..." placeholderTextColor={COLORS.textSecondary} value={chatInput} onChangeText={setChatInput} multiline />
          <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendChatMessage} disabled={isChatLoading}><Ionicons name="send" size={24} color="#fff" /></TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStats = () => (
    <View style={styles.mainContent}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Статистика</Text></View>
        <TouchableOpacity onPress={() => setIsSideMenuVisible(true)} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={38} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>
      <View style={styles.centerView}>
        <Ionicons name="stats-chart" size={80} color={COLORS.tabBar} />
        <Text style={styles.placeholderText}>В разработке</Text>
      </View>
    </View>
  );

  const renderSettings = () => (
    <View style={styles.mainContent}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setCurrentTab('home')}><Ionicons name="arrow-back" size={30} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={[styles.pageTitle, {flex: 1, textAlign: 'center', marginRight: 30}]}>Настройки</Text>
      </View>
      <View style={styles.settingsContainer}>
        <Ionicons name="construct-outline" size={80} color={COLORS.textSecondary} style={{marginBottom: 20}} />
        <Text style={styles.settingsTitle}>Управление профилем</Text>
        <Text style={styles.settingsDesc}>Здесь будут дополнительные настройки. Пока доступна только опция удаления аккаунта.</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAccount}><Ionicons name="warning-outline" size={24} color="#fff" style={{marginRight: 10}}/><Text style={styles.dangerButtonText}>Удалить аккаунт</Text></TouchableOpacity>
      </View>
    </View>
  );

  const renderContent = () => {
    switch(currentTab) {
      case 'home': return renderHome();
      case 'workout': return renderWorkout();
      case 'club': return renderClanTab();
      case 'settings': return renderSettings();
      case 'chat': return renderChat();
      case 'stats': return renderStats();
      case 'nutrition': return renderNutrition();
      default: return renderHome();
    }
  };

  return (
    <View style={styles.containerApp}>
      <View style={styles.contentArea}>{renderContent()}</View>
      
      <Modal visible={isSideMenuVisible} transparent animationType="fade">
        <View style={styles.sideMenuOverlay}>
          <TouchableOpacity style={styles.sideMenuCloseArea} onPress={() => setIsSideMenuVisible(false)} />
          <View style={styles.sideMenuContent}>
            <View style={styles.sideMenuHeader}><Ionicons name="person-circle" size={80} color={COLORS.tabBar} /><Text style={styles.sideMenuName} numberOfLines={1}>{displayName}</Text><Text style={styles.sideMenuRole}>{userRole === 'trainer' ? 'Фитнес-тренер' : 'Спортсмен'}</Text></View>
            <ScrollView style={styles.sideMenuNav}>
              <TouchableOpacity style={styles.sideMenuLink} onPress={() => menuNavigate('home')}><Ionicons name={currentTab === 'home' ? "home" : "home-outline"} size={26} color={COLORS.textPrimary} /><Text style={[styles.sideMenuLinkText, currentTab === 'home' && {fontWeight: 'bold'}]}>Главная</Text></TouchableOpacity>
              <TouchableOpacity style={styles.sideMenuLink} onPress={() => menuNavigate('workout')}><Ionicons name={currentTab === 'workout' ? "barbell" : "barbell-outline"} size={26} color={COLORS.textPrimary} /><Text style={[styles.sideMenuLinkText, currentTab === 'workout' && {fontWeight: 'bold'}]}>Журнал</Text></TouchableOpacity>
              <TouchableOpacity style={styles.sideMenuLink} onPress={() => menuNavigate('club')}><Ionicons name={currentTab === 'club' ? "people" : "people-outline"} size={26} color={COLORS.textPrimary} /><Text style={[styles.sideMenuLinkText, currentTab === 'club' && {fontWeight: 'bold'}]}>Клубы</Text></TouchableOpacity>
              <TouchableOpacity style={styles.sideMenuLink} onPress={() => { setIsSideMenuVisible(false); setIsScheduleListVisible(true); }}><Ionicons name="calendar-outline" size={26} color={COLORS.textPrimary} /><Text style={styles.sideMenuLinkText}>Календарь</Text></TouchableOpacity>
              <TouchableOpacity style={styles.sideMenuLink} onPress={() => menuNavigate('chat')}><Ionicons name={currentTab === 'chat' ? "chatbubble" : "chatbubble-outline"} size={26} color={COLORS.textPrimary} /><Text style={[styles.sideMenuLinkText, currentTab === 'chat' && {fontWeight: 'bold'}]}>Чат с ИИ</Text></TouchableOpacity>
              <TouchableOpacity style={styles.sideMenuLink} onPress={() => menuNavigate('stats')}><Ionicons name={currentTab === 'stats' ? "stats-chart" : "stats-chart-outline"} size={26} color={COLORS.textPrimary} /><Text style={[styles.sideMenuLinkText, currentTab === 'stats' && {fontWeight: 'bold'}]}>Статистика</Text></TouchableOpacity>
              <View style={styles.sideMenuFooter}>
                <TouchableOpacity onPress={() => menuNavigate('settings')} style={styles.sideMenuBtn}><Ionicons name="settings-outline" size={26} color={COLORS.textPrimary} /><Text style={styles.sideMenuBtnText}>Настройки</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setIsAccountSwitcherVisible(true)} style={[styles.sideMenuBtn, {marginTop: 15}]}><Ionicons name="swap-horizontal-outline" size={26} color={COLORS.textPrimary} /><Text style={styles.sideMenuBtnText}>Сменить аккаунт</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleSignOut} style={[styles.sideMenuBtn, {marginTop: 15}]}><Ionicons name="log-out-outline" size={26} color={COLORS.error} /><Text style={[styles.sideMenuBtnText, {color: COLORS.error}]}>Выйти</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isAccountSwitcherVisible} transparent animationType="fade">
        <View style={styles.accountSwitcherOverlay}>
          <View style={styles.accountSwitcherContent}>
            <View style={styles.accountSwitcherHeader}><Text style={styles.accountSwitcherTitle}>Выберите аккаунт</Text><TouchableOpacity onPress={() => setIsAccountSwitcherVisible(false)}><Ionicons name="close-circle" size={32} color={COLORS.textSecondary} /></TouchableOpacity></View>
            <ScrollView style={{maxHeight: 300}}>
              {savedAccounts.map((acc: SavedAccount) => {
                const isActive = session?.user?.id === acc.id;
                return ( <TouchableOpacity key={acc.id} style={[styles.accountItem, isActive && styles.accountItemActive]} onPress={() => handleSwitchAccount(acc)}><Ionicons name="person-circle" size={45} color={isActive ? COLORS.tabBar : COLORS.textSecondary} /><View style={{flex: 1, marginLeft: 15}}><Text style={styles.accName}>{acc.name}</Text><Text style={styles.accEmail}>{acc.email}</Text></View>{isActive && <Ionicons name="checkmark" size={24} color={COLORS.tabBar} />}</TouchableOpacity> )
              })}
              <TouchableOpacity style={styles.addAccountBtn} onPress={handleAddAnotherAccount}><Ionicons name="person-add-outline" size={24} color={COLORS.textPrimary} /><Text style={styles.addAccountText}>Добавить аккаунт</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={[styles.tabBar, { paddingBottom: Platform.OS === 'ios' ? 35 : 15, paddingTop: 15 }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('chat')}><Ionicons name={currentTab === 'chat' ? "chatbubble" : "chatbubble-outline"} size={28} color={currentTab === 'chat' ? '#000' : 'rgba(0,0,0,0.3)'} /></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('workout')}><Ionicons name={currentTab === 'workout' ? "barbell" : "barbell-outline"} size={30} color={currentTab === 'workout' ? '#000' : 'rgba(0,0,0,0.3)'} /></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('home')}><Ionicons name={currentTab === 'home' ? "home" : "home-outline"} size={30} color={currentTab === 'home' ? '#000' : 'rgba(0,0,0,0.3)'} /></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('club')}><Ionicons name={currentTab === 'club' ? "people" : "people-outline"} size={30} color={currentTab === 'club' ? '#000' : 'rgba(0,0,0,0.3)'} /></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('stats')}><Ionicons name={currentTab === 'stats' ? "stats-chart" : "stats-chart-outline"} size={28} color={currentTab === 'stats' ? '#000' : 'rgba(0,0,0,0.3)'} /></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authContainer: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: COLORS.bg },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', color: COLORS.textPrimary, marginBottom: 5 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 30 },
  choiceButton: { backgroundColor: COLORS.tabBar, padding: 25, borderRadius: 20, marginBottom: 15 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  subText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginTop: 4 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 15, color: COLORS.textPrimary, width: '100%' },
  inputError: { borderWidth: 2, borderColor: COLORS.error },
  errorText: { color: COLORS.error, fontSize: 14, marginBottom: 15, alignSelf: 'flex-start', marginTop: -10, marginLeft: 5 },
  button: { backgroundColor: COLORS.tabBar, padding: 18, borderRadius: 12, alignItems: 'center', width: '100%' },
  backButton: { marginTop: 25, alignSelf: 'center', padding: 10 },
  backButtonText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '500' },
  linkText: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 16, fontWeight: 'bold' },
  wizardOptionBtn: { backgroundColor: '#fff', padding: 20, borderRadius: 15, marginBottom: 15, alignItems: 'center', elevation: 2 },
  wizardOptionText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary },
  wizardSquareBtn: { backgroundColor: '#fff', width: '30%', aspectRatio: 1, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  wizardSquareBtnActive: { backgroundColor: COLORS.tabBar },
  wizardSquareText: { fontSize: 24, fontWeight: 'bold', color: COLORS.textPrimary },
  wizardGenderBtn: { backgroundColor: '#fff', width: '48%', padding: 15, borderRadius: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  wizardGenderBtnActive: { backgroundColor: COLORS.tabBar },
  wizardGenderText: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary, marginLeft: 10 },
  containerApp: { flex: 1, backgroundColor: COLORS.bg },
  contentArea: { flex: 1 },
  mainContent: { flexGrow: 1, padding: 20, paddingTop: 60, paddingBottom: 100 },
  centerView: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  greeting: { fontSize: 28, fontWeight: 'bold', color: COLORS.textPrimary },
  subGreeting: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, fontWeight: '500' },
  profileBtn: { padding: 5 },
  pageTitle: { fontSize: 26, fontWeight: 'bold', color: COLORS.textPrimary },
  mainActionBtn: { backgroundColor: COLORS.tabBar, padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 25 },
  mainActionText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  metricCardFull: { width: '100%', backgroundColor: '#fff', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 20 },
  metricValueFull: { fontSize: 28, fontWeight: 'bold', color: COLORS.textPrimary, marginVertical: 5 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  metricCard: { width: '48%', backgroundColor: '#fff', padding: 20, borderRadius: 20, alignItems: 'center' },
  metricTitle: { fontSize: 14, color: COLORS.textSecondary },
  metricValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, marginVertical: 5 },
  miniBtn: { marginTop: 5, backgroundColor: COLORS.bg, padding: 8, borderRadius: 8, paddingHorizontal: 15 },
  miniBtnText: { fontSize: 12, fontWeight: 'bold' },
  inputSection: { marginBottom: 30 },
  inputArea: { backgroundColor: '#fff', borderRadius: 15, padding: 15, fontSize: 16, height: 100, textAlignVertical: 'top', marginBottom: 15 },
  
  chartCardDark: { backgroundColor: '#1E1E1E', padding: 15, borderRadius: 20, alignItems: 'center', width: '100%', elevation: 5, marginBottom: 20 },
  chartHeaderDark: { color: '#E0E0E0', fontSize: 16, alignSelf: 'flex-start', marginBottom: 10, fontWeight: '500' },
  miniBtnDark: { marginTop: 5, backgroundColor: '#333', padding: 8, paddingHorizontal: 12, borderRadius: 8 },
  miniBtnTextDark: { fontSize: 11, fontWeight: 'bold', color: '#fff' },

  // ── Tracker-style weight chart (dark navy) ──
  trackerCard: { backgroundColor: '#101828', borderRadius: 20, padding: 16, width: '100%', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  trackerTabs: { flexDirection: 'row' as const, backgroundColor: '#161F30', borderRadius: 12, padding: 4, marginBottom: 18 },
  trackerTab: { flex: 1, paddingVertical: 9, alignItems: 'center' as const, borderRadius: 9 },
  trackerTabActive: { backgroundColor: 'rgba(34,211,238,0.12)' },
  trackerTabText: { color: '#4A5D7A', fontSize: 13, fontWeight: '600' as const },
  trackerTabTextActive: { color: '#22D3EE', fontWeight: '700' as const },
  trackerPeriodLabel: { color: '#4A5D7A', fontSize: 11, fontWeight: '700' as const, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  trackerAvgValue: { color: '#F0F6FF', fontSize: 34, fontWeight: '800' as const, letterSpacing: -1 },
  trackerAvgSub: { color: '#4A5D7A', fontSize: 11, fontWeight: '500' as const, marginTop: 2 },
  trackerDayView: { alignItems: 'center' as const, paddingVertical: 24 },
  trackerCurrentWeight: { color: '#F0F6FF', fontSize: 58, fontWeight: '900' as const, letterSpacing: -2 },
  trackerKgUnit: { color: '#8B9EC0', fontSize: 20, fontWeight: '500' as const, marginBottom: 10 },
  trackerDeltaBadge: { backgroundColor: '#161F30', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  trackerDeltaText: { fontSize: 14, fontWeight: '700' as const },
  trackerDayTargetRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 14 },
  trackerDayTargetDash: { width: 18, height: 2, backgroundColor: '#F59E0B', borderRadius: 1, marginRight: 7 },
  trackerDayTargetText: { color: '#F59E0B', fontSize: 12, fontWeight: '600' as const },
  trackerStatsRow: { flexDirection: 'row' as const, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingTop: 14, marginTop: 10 },
  trackerStat: { flex: 1, alignItems: 'center' as const },
  trackerStatLabel: { color: '#4A5D7A', fontSize: 9, fontWeight: '700' as const, letterSpacing: 1, marginBottom: 5 },
  trackerStatVal: { color: '#F0F6FF', fontSize: 17, fontWeight: '800' as const, letterSpacing: -0.3 },
  trackerTargetRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  trackerTargetDash: { width: 20, height: 2, backgroundColor: '#F59E0B', borderRadius: 1, marginRight: 8 },
  trackerTargetNote: { color: '#F59E0B', fontSize: 12, fontWeight: '600' as const },
  trackerDaysNote: { color: '#2A3A50', fontSize: 11, textAlign: 'center' as const, marginTop: 8 },

  // ── Weight modal (dark) ──
  wmOverlay: { flex: 1, backgroundColor: '#08111E' },
  wmHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  wmTitle: { fontSize: 26, fontWeight: '800' as const, color: '#F0F6FF', letterSpacing: -0.5 },
  wmSubtitle: { fontSize: 12, color: '#4A5D7A', marginTop: 2, fontWeight: '500' as const },
  wmCloseBtn: { width: 38, height: 38, backgroundColor: '#141E30', borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  wmScroll: { flex: 1, paddingHorizontal: 16 },
  wmHero: { backgroundColor: '#101828', borderRadius: 22, padding: 22, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center' as const },
  wmHeroLabel: { fontSize: 10, color: '#4A5D7A', fontWeight: '700' as const, letterSpacing: 1.2 },
  wmHeroNum: { fontSize: 60, fontWeight: '900' as const, color: '#F0F6FF', letterSpacing: -2, lineHeight: 66 },
  wmHeroUnit: { fontSize: 22, fontWeight: '500' as const, color: '#8B9EC0', marginBottom: 8 },
  wmGoalRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 12 },
  wmGoalDash: { width: 18, height: 2, backgroundColor: '#F59E0B', borderRadius: 1, marginRight: 8 },
  wmGoalText: { fontSize: 13, color: '#F59E0B', fontWeight: '600' as const },
  wmProgressBg: { height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' as const },
  wmProgressFill: { height: '100%' as any, backgroundColor: '#F59E0B', borderRadius: 3 },
  wmProgressPct: { fontSize: 10, color: '#4A5D7A', textAlign: 'right' as const, marginTop: 4, fontWeight: '600' as const },
  wmInputCard: { backgroundColor: '#101828', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  wmInputLabel: { fontSize: 12, color: '#8B9EC0', fontWeight: '600' as const, marginBottom: 14, letterSpacing: 0.3 },
  wmPickerRow: { flexDirection: 'row' as const, justifyContent: 'center' as const, alignItems: 'center' as const, marginBottom: 18 },
  wmPickerDot: { fontSize: 34, fontWeight: '800' as const, color: '#F0F6FF', marginHorizontal: 2 },
  wmSaveBtn: { backgroundColor: '#22D3EE', padding: 16, borderRadius: 14, alignItems: 'center' as const },
  wmSaveBtnText: { color: '#06111C', fontSize: 16, fontWeight: '800' as const, letterSpacing: -0.2 },
  wmSectionTitle: { fontSize: 15, fontWeight: '700' as const, color: '#8B9EC0', marginBottom: 10, marginTop: 4, letterSpacing: 0.2 },
  wmHistoryItem: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, backgroundColor: '#101828', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  wmHistoryDate: { fontSize: 14, color: '#F0F6FF', fontWeight: '600' as const },
  wmHistoryTime: { fontSize: 11, color: '#4A5D7A', marginTop: 2, fontWeight: '500' as const },
  wmHistoryWeight: { fontSize: 18, fontWeight: '800' as const, color: '#F0F6FF', letterSpacing: -0.3 },
  wmHistoryDelta: { fontSize: 12, fontWeight: '700' as const, marginTop: 2 },

  historyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15 },
  dateText: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8, fontWeight: 'bold' },
  groupExerciseTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 8, marginTop: 5 },
  exerciseSetText: { flex: 1, fontSize: 16, color: COLORS.textPrimary },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' },
  exerciseName: { flex: 1, fontSize: 16, color: COLORS.textPrimary, fontWeight: '500' },
  setDetails: { fontWeight: 'bold', color: COLORS.tabBar, fontSize: 15, marginTop: 4 },
  emptyGroupsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  emptyText: { fontSize: 18, fontWeight: '600', color: COLORS.textSecondary, marginVertical: 20, textAlign: 'center', paddingHorizontal: 20 },
  centerActionBtn: { backgroundColor: COLORS.tabBar, width: '80%', padding: 20, borderRadius: 20, alignItems: 'center' },
  actionButtonsRow: { width: '100%', alignItems: 'center' },
  groupsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  groupSquare: { width: '47%', height: 150, backgroundColor: '#fff', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 3 },
  groupSquareText: { marginTop: 10, fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary, paddingHorizontal: 10, textAlign: 'center' },
  groupDetailContainer: { flex: 1, backgroundColor: COLORS.bg },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: 'rgba(255,255,255,0.3)' },
  groupHeaderTitle: { flex: 1, fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', paddingHorizontal: 10 },
  memberCard: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  memberName: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary },
  memberRole: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  progressBarBg: { width: 80, height: 10, backgroundColor: '#f0f0f0', borderRadius: 10, overflow: 'hidden', marginLeft: 15 },
  progressBarFill: { height: '100%', borderRadius: 10 },
  clientExerciseCard: { backgroundColor: '#fff', padding: 12, borderRadius: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  dateGroup: { marginBottom: 25 },
  dateHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 5 },
  dateHeaderText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary, textTransform: 'capitalize' },
  sessionCard: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2 },
  sessionTimeBadge: { backgroundColor: COLORS.tabBar, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, marginRight: 15 },
  sessionTimeText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  sessionInfo: { flex: 1 },
  sessionDetailsTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary },
  emptyCardList: { padding: 20, borderRadius: 15, alignItems: 'center', marginTop: 20 },
  deleteBtn: { padding: 5 },
  modalOverlayFull: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  modalContentFull: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, elevation: 10 },
  modalHeaderFull: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 15, marginBottom: 10 },
  modalTitleFull: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: COLORS.bg, padding: 25, borderRadius: 25, alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: COLORS.textPrimary },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, alignSelf: 'flex-start', color: COLORS.textPrimary },
  selectItem: { width: '100%', backgroundColor: '#fff', padding: 18, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectItemText: { fontSize: 16, color: COLORS.textPrimary, fontWeight: '500' },
  pickerButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, width: '100%' },
  pickerButtonText: { marginLeft: 15, fontSize: 16, color: COLORS.textPrimary, fontWeight: '500' },
  sideMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', justifyContent: 'flex-end' },
  sideMenuCloseArea: { flex: 1 },
  sideMenuContent: { width: '75%', backgroundColor: '#fff', height: '100%', padding: 20, paddingTop: 60, elevation: 5 },
  sideMenuHeader: { alignItems: 'center', marginBottom: 25, paddingBottom: 25, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  sideMenuName: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: 10, textAlign: 'center' },
  sideMenuRole: { fontSize: 14, color: COLORS.textSecondary, marginTop: 5 },
  sideMenuNav: { flex: 1 },
  sideMenuLink: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18 },
  sideMenuLinkText: { fontSize: 18, color: COLORS.textPrimary, marginLeft: 15, fontWeight: '500' },
  sideMenuFooter: { borderTopWidth: 1, borderColor: '#f0f0f0', paddingTop: 20, paddingBottom: 60 },
  sideMenuBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  sideMenuBtnText: { fontSize: 18, marginLeft: 15, fontWeight: 'bold', color: COLORS.textPrimary },
  settingsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: -50 },
  settingsTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 10 },
  settingsDesc: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
  dangerButton: { backgroundColor: COLORS.error, padding: 20, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '90%', elevation: 3 },
  dangerButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  accountSwitcherOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  accountSwitcherContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 40, maxHeight: '70%' },
  accountSwitcherHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 15, borderBottomWidth: 1, borderColor: '#eee' },
  accountSwitcherTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
  accountItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  accountItemActive: { backgroundColor: 'rgba(181, 123, 77, 0.1)', borderRadius: 10, paddingHorizontal: 10, borderBottomWidth: 0 },
  accName: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary },
  accEmail: { fontSize: 14, color: COLORS.textSecondary },
  addAccountBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, justifyContent: 'center', marginTop: 10 },
  addAccountText: { fontSize: 16, fontWeight: 'bold', marginLeft: 10, color: COLORS.textPrimary },
  tabBar: { flexDirection: 'row', backgroundColor: COLORS.tabBar, paddingHorizontal: 20, position: 'absolute', bottom: 0, width: '100%', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  tabItem: { flex: 1, alignItems: 'center' },
  
  chatContainer: { flex: 1, marginTop: 10 },
  chatBubble: { maxWidth: '85%', padding: 15, borderRadius: 20, marginBottom: 12 },
  chatBubbleUser: { backgroundColor: COLORS.tabBar, alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  chatBubbleAI: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 5, elevation: 1 },
  chatText: { fontSize: 16, lineHeight: 22 },
  chatTextUser: { color: '#fff' },
  chatTextAI: { color: COLORS.textPrimary },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginBottom: 5 },
  chatInput: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 15, paddingTop: 15, fontSize: 16, maxHeight: 120, color: COLORS.textPrimary, elevation: 1 },
  chatSendBtn: { backgroundColor: COLORS.tabBar, width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginLeft: 10, elevation: 1, marginBottom: 2 },
  
  editMessageContainer: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 12, borderWidth: 1, borderColor: COLORS.tabBar, width: '90%', alignSelf: 'flex-end' },
  editMessageInput: { fontSize: 16, color: COLORS.textPrimary, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 5, marginBottom: 10, minHeight: 40 },
  editMessageActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  editIconBtn: { position: 'absolute', bottom: -10, left: -10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 15, width: 28, height: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  
  chatSidebarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row' },
  chatSidebarContent: { width: '75%', maxWidth: 320, backgroundColor: COLORS.chatSidebarBg, height: '100%', padding: 20, paddingTop: 50 },
  chatSidebarCloseArea: { flex: 1 },
  newChatBtnSidebar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.tabBar, padding: 15, borderRadius: 12, marginBottom: 30 },
  newChatBtnTextSidebar: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  sidebarSectionTitle: { fontSize: 12, color: '#aaa', marginBottom: 15, fontWeight: 'bold', textTransform: 'uppercase' },
  chatSidebarItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 5 },
  chatSidebarItemActive: { backgroundColor: COLORS.chatSidebarHover },
  chatSidebarItemText: { fontSize: 15, color: COLORS.chatSidebarText, flex: 1 },

  macrosRowContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
  macroCard: { backgroundColor: '#fff', width: '31%', padding: 15, borderRadius: 15, alignItems: 'center' },
  macroLabel: { fontSize: 14, color: COLORS.textSecondary, fontWeight: 'bold', marginBottom: 5 },
  macroValueSmall: { fontSize: 14, color: COLORS.textPrimary, marginBottom: 8, fontWeight: 'bold' },
  macroProgressBg: { width: '100%', height: 8, backgroundColor: '#f0f0f0', borderRadius: 5, overflow: 'hidden' },
  macroProgressFill: { height: '100%', borderRadius: 5 },

  previewContainer: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 2, marginTop: 15 },
  previewTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 5 },
  previewCals: { fontSize: 24, fontWeight: 'bold', color: COLORS.tabBar, textAlign: 'center', marginBottom: 15 },
  previewMacrosRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderColor: '#eee', paddingTop: 15 },
  previewMacro: { alignItems: 'center' },
});