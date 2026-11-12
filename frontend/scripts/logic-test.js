// Тест чистой логики приложения (без React Native и без сети): статистика и рекорды журнала,
// «снимок» данных для ИИ-компаньона, склонения, перевод ошибок входа.
// Транспилирует нужные .ts-файлы во временную папку и проверяет их на тестовых данных.
//
//   npm test                      — прогнать проверки (код возврата 0 = всё прошло)
//   node scripts/logic-test.js --print   — ещё и показать, какой текст получает ИИ
const fs = require('fs');
const os = require('os');
const path = require('path');
const front = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'striva-logic-'));
const ts = require(path.join(front, 'node_modules', 'typescript'));

const files = ['src/utils/date.ts', 'src/utils/stats.ts', 'src/utils/companion.ts', 'src/data/exercises.ts', 'src/utils/authErrors.ts', 'src/utils/workout.ts'];
for (const f of files) {
  const src = fs.readFileSync(path.join(front, f), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const dest = path.join(out, f.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
const date = require(path.join(out, 'src/utils/date.js'));
const stats = require(path.join(out, 'src/utils/stats.js'));
const comp = require(path.join(out, 'src/utils/companion.js'));
const auth = require(path.join(out, 'src/utils/authErrors.js'));

let ok = true;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); ok = ok && cond; };

const today = date.getCurrentDateString();
const d = n => date.addDaysStr(today, n);
const S = (exercise, weight, reps) => ({ exercise, weight, reps });
const map = new Map([
  [d(-15), [S('Жим штанги лёжа', 70, 8), S('Жим штанги лёжа', 70, 8)]],
  [d(-8), [S('Присед со штангой', 90, 5), S('присед со штангой', 100, 3)]],
  [d(-3), [S('Жим штанги лёжа', 75, 6), S('Жим штанги лёжа', '80', '3'), S('Подтягивания', 0, 12)]],
  [d(-1), [S('Тяга верхнего блока', 50, 10)]],
  [today, [S('Жим штанги лёжа', 60, 10)]],
]);
const keys = [...map.keys()].sort();
const groups = { keys, map };

const st = stats.computeExerciseStats(groups);
const bench = st[stats.exerciseKey('Жим штанги лёжа')];
check('bench best weight 80x3', bench.bestWeight === 80 && bench.bestWeightReps === 3, JSON.stringify(bench).slice(0, 120));
check('bench last = before today', bench.lastDate === d(-3) && bench.lastSets.length === 2, bench.lastDate);
check('bench days 3', bench.days === 3);
check('case-insensitive merge', st[stats.exerciseKey('ПРИСЕД со штангой')].sets === 2);
check('1RM epley (75x6 → 90)', Math.abs(bench.best1RM - 90) < 0.01, String(bench.best1RM));
const pull = st[stats.exerciseKey('Подтягивания')];
check('bodyweight maxReps', pull.maxReps === 12 && pull.bestWeight === 0);
const onlyToday = stats.computeExerciseStats({ keys: [today], map: new Map([[today, [S('Бег', 0, 1)]]]) });
check('lastDate falls back to today', onlyToday[stats.exerciseKey('Бег')].lastDate === today);

const sum = stats.computeWorkoutSummary(groups);
check('total workouts 5', sum.totalWorkouts === 5);
check('weeks bucket 8', sum.weeks.length === 8);
check('week counts sum ≤ total', sum.weeks.reduce((a, w) => a + w.workouts, 0) <= 5);
check('streak ≥ 1', sum.weekStreak >= 1, String(sum.weekStreak));
check('volume', sum.totalVolume === 70 * 8 * 2 + 90 * 5 + 100 * 3 + 75 * 6 + 80 * 3 + 50 * 10 + 60 * 10, String(sum.totalVolume));
const empty = stats.computeWorkoutSummary({ keys: [], map: new Map() });
check('empty summary', empty.totalWorkouts === 0 && empty.weekStreak === 0 && empty.lastWorkoutDate === null);
check('formatVolume', stats.formatVolume(12345) === '12,3 т' && stats.formatVolume(850) === '850 кг', stats.formatVolume(12345));

check('plural', date.plural(1, ['день', 'дня', 'дней']) === 'день' && date.plural(3, ['день', 'дня', 'дней']) === 'дня' && date.plural(11, ['день', 'дня', 'дней']) === 'дней' && date.plural(22, ['день', 'дня', 'дней']) === 'дня');
check('muscle group library', comp.muscleGroupOf('Жим штанги лёжа') === 'Грудь');
check('muscle group keyword', comp.muscleGroupOf('жим лёжа узким хватом') === 'Грудь' && comp.muscleGroupOf('Выпады с гантелями') === 'Ноги', comp.muscleGroupOf('жим лёжа узким хватом'));

const ctx = comp.buildCompanionContext({
  name: 'Тест', role: 'client', goal: 'lose', currentWeight: 82, startWeight: 86, targetWeight: 75,
  weightLogs: [{ weight: 84, created_at: new Date(Date.now() - 20 * 864e5).toISOString() }, { weight: 82, created_at: new Date().toISOString() }],
  dailyCalorieNorm: 2200, maintenanceCalories: 2700, dailyMacros: { protein: 160, fat: 60, carb: 240 },
  consumedCalories: 900, consumedMacros: { protein: 70, fat: 30, carb: 90 },
  selfMeals: [{ id: '1', user_id: 'u', date: today, name: 'овсянка', meal_type: 'breakfast', calories: 350, protein: 12, fat: 6, carbs: 60, source: 'self' }],
  assignedMeals: [], waterLiters: 1.2, dayGroups: groups, exerciseStats: st, summary: sum,
  trainerPlanToday: [{ exercise: 'Становая тяга', weight: 100, reps: 5, completed: true }, { exercise: 'Становая тяга', weight: 100, reps: 5 }],
  upcomingSessions: [{ id: 's', group_id: 'g', client_id: 'u', trainer_id: 't', session_date: d(2), session_time: '18:00', group_name: 'Power' }],
  builderBlocks: [{ id: 'b', exercise: 'Выпады', source: 'manual', sets: [{ id: 'x', reps: '10', weight: '20', completed: true }] }],
});
check('ctx has groups-last-trained', /Ноги — 8 дней назад/.test(ctx) && /Спина — вчера/.test(ctx), '');
check('ctx has recent days', ctx.includes(`${d(-3)} (3 дня назад)`));
check('ctx has PR', ctx.includes('Жим штанги лёжа 80 кг × 3'));
check('ctx has nutrition left', ctx.includes('осталось 1300'));
check('ctx has trainer plan', ctx.includes('ПЛАН ОТ ТРЕНЕРА НА СЕГОДНЯ: Становая тяга — выполнено 1 из 2'));
check('ctx has builder', ctx.includes('Выпады (1 подх., выполнено 1)'));
check('ctx has weight dynamics', ctx.includes('за 30 дней -2.0 кг') && !ctx.includes('за 7 дней'));
check('ctx merges exercise case', ctx.includes('Присед со штангой: 90 кг × 5, 100 кг × 3'));
check('ctx size', ctx.length < 8500, String(ctx.length));
const emptyCtx = comp.buildCompanionContext({
  name: 'X', role: null, goal: 'maintain', currentWeight: 0, startWeight: null, targetWeight: null, weightLogs: [],
  dailyCalorieNorm: 0, maintenanceCalories: 0, dailyMacros: { protein: 0, fat: 0, carb: 0 }, consumedCalories: 0, consumedMacros: { protein: 0, fat: 0, carb: 0 },
  selfMeals: [], assignedMeals: [], waterLiters: 0, dayGroups: { keys: [], map: new Map() }, exerciseStats: {}, summary: empty,
  trainerPlanToday: null, upcomingSessions: [], builderBlocks: [],
});
check('empty ctx says journal empty', emptyCtx.includes('Журнал пуст'));

check('auth error translate', auth.translateAuthError({ message: 'Invalid login credentials' }) === 'Неверный email или пароль.');
check('auth unknown passthrough', auth.translateAuthError({ message: 'weird thing' }) === 'weird thing');
check('email validation', auth.isValidEmail(' a@b.co ') && !auth.isValidEmail('a@b') && !auth.isValidEmail('ab.com'));

if (process.argv.includes('--print')) console.log('\n--- пример снимка для компаньона ---\n' + ctx);
fs.rmSync(out, { recursive: true, force: true });
console.log(ok ? '\nALL OK' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
