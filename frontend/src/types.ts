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
export interface FoodItem { name: string; calories: number; protein: number; fat: number; carbs: number; }
export interface MealItem { id: string; meal_type?: string; name: string; items?: FoodItem[]; calories: number; protein: number; fat: number; carbs: number; eaten?: boolean; }
export interface AssignedMeal { id?: string; group_id: string; client_id: string; trainer_id: string; date: string; meal_data: MealItem[]; }
export interface MealLogRow { id: string; user_id: string; date: string; name: string; meal_type?: string; items?: FoodItem[]; calories: number; protein: number; fat: number; carbs: number; source: string; }

// ИИ-план тренировки, как его возвращает бэкенд (ещё ничего не сохранено — только
// предложение). Экран журнала превращает его в обычные блоки конструктора,
// которые пользователь подтверждает той же кнопкой "Добавить", что и вручную.
export interface GeneratedPlanSet { target_reps: number; target_weight: number; }
export interface GeneratedPlanExercise { exercise: string; sets: GeneratedPlanSet[]; }
export interface GeneratedWorkoutPlan { plan_name: string; exercises: GeneratedPlanExercise[]; }
