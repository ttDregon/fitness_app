import type { Session as SupabaseSession } from '@supabase/supabase-js';

export type Session = SupabaseSession;

export interface WorkoutData { exercise: string; weight: number; reps: number; id?: string; completed?: boolean; }
export interface GroupedWorkout { exercise: string; sets: WorkoutData[]; }
export interface ScrollPickerItem { label: string; value: string | number; }
export interface SavedAccount { id: string; email: string; name: string; role: string; password: string; }
export interface Group { id: string; name: string; code: string; owner_id: string; }
export interface GroupMember { id: string; email: string; name?: string; }
export interface WeightLog { id: string; weight: number; created_at: string; }
export interface WorkoutRecord { id: string; raw_text: string; parsed_data: WorkoutData[]; user_id: string; created_at: string; }
export interface AssignedWorkout { id: string; group_id: string; client_id: string; trainer_id: string; date: string; workout_data: WorkoutData[]; }
export interface TrainingSession { id: string; group_id: string; client_id: string; trainer_id: string; session_date: string; session_time: string; group_name?: string; client_name?: string; }
export interface ChatMessage { id: string; text: string; sender: 'user' | 'ai'; }
export interface ChatSession { id: string; title: string; messages: ChatMessage[]; updatedAt: number; }
export interface Macros { protein: number; fat: number; carb: number; }
export interface MealPreview { name: string; calories: number; protein: number; fat: number; carbs: number; }
export interface MealItem { id: string; name: string; calories: number; protein: number; fat: number; carbs: number; eaten?: boolean; }
export interface AssignedMeal { id?: string; group_id: string; client_id: string; trainer_id: string; date: string; meal_data: MealItem[]; }
export interface MealLogRow { id: string; user_id: string; date: string; name: string; calories: number; protein: number; fat: number; carbs: number; source: string; }
