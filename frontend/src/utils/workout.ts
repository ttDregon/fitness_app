import type { WorkoutData, GroupedWorkout } from '../types';

export const groupWorkoutData = (data: WorkoutData[]): GroupedWorkout[] => {
  if (!Array.isArray(data)) return [];
  const grouped: GroupedWorkout[] = [];
  data.forEach((item: WorkoutData) => {
    let existing = grouped.find(g => g.exercise === item.exercise);
    if (!existing) { existing = { exercise: item.exercise, sets: [] }; grouped.push(existing); }
    existing.sets.push(item);
  });
  return grouped;
};
