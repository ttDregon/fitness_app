import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// --- НАСТРОЙКИ SUPABASE ---
const supabaseUrl = 'https://izhkutjiuimsepzlohsl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6aGt1dGppdWltc2VwemxvaHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODI3NzksImV4cCI6MjA5MjE1ODc3OX0.ZR0HPdjhkrTeEeJ1F0cmqLgNV1AsxJb6pssIQtrlGeg';

const customWebStorage = {
  getItem: (key: string) => { if (typeof window !== 'undefined') return window.localStorage.getItem(key); return null; },
  setItem: (key: string, value: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); },
  removeItem: (key: string) => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
};

const authStorage = Platform.OS === 'web' ? customWebStorage : AsyncStorage;
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: authStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
