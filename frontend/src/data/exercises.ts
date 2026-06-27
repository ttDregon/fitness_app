// Библиотека упражнений: ~100 самых популярных в зале (тренажёры/штанга),
// с гантелями и дома (свой вес). group — мышечная группа, equipment — снаряд.
export interface ExerciseDef { name: string; group: string; equipment: string }

export const EQUIP = { GYM: 'Тренажёр', DB: 'Гантели', BW: 'Свой вес' } as const;

export const EXERCISES: ExerciseDef[] = [
  // Грудь
  { name: 'Жим штанги лёжа', group: 'Грудь', equipment: EQUIP.GYM },
  { name: 'Жим штанги на наклонной скамье', group: 'Грудь', equipment: EQUIP.GYM },
  { name: 'Жим гантелей лёжа', group: 'Грудь', equipment: EQUIP.DB },
  { name: 'Жим гантелей на наклонной', group: 'Грудь', equipment: EQUIP.DB },
  { name: 'Разведение гантелей лёжа', group: 'Грудь', equipment: EQUIP.DB },
  { name: 'Разведение гантелей на наклонной', group: 'Грудь', equipment: EQUIP.DB },
  { name: 'Пуловер с гантелью', group: 'Грудь', equipment: EQUIP.DB },
  { name: 'Сведение рук в кроссовере', group: 'Грудь', equipment: EQUIP.GYM },
  { name: 'Жим в тренажёре (грудь)', group: 'Грудь', equipment: EQUIP.GYM },
  { name: 'Отжимания от пола', group: 'Грудь', equipment: EQUIP.BW },
  { name: 'Отжимания с широкой постановкой', group: 'Грудь', equipment: EQUIP.BW },
  { name: 'Отжимания с колен', group: 'Грудь', equipment: EQUIP.BW },

  // Спина
  { name: 'Подтягивания', group: 'Спина', equipment: EQUIP.BW },
  { name: 'Подтягивания обратным хватом', group: 'Спина', equipment: EQUIP.BW },
  { name: 'Подтягивания нейтральным хватом', group: 'Спина', equipment: EQUIP.BW },
  { name: 'Тяга верхнего блока', group: 'Спина', equipment: EQUIP.GYM },
  { name: 'Тяга нижнего блока', group: 'Спина', equipment: EQUIP.GYM },
  { name: 'Тяга штанги в наклоне', group: 'Спина', equipment: EQUIP.GYM },
  { name: 'Тяга Т-грифа', group: 'Спина', equipment: EQUIP.GYM },
  { name: 'Становая тяга', group: 'Спина', equipment: EQUIP.GYM },
  { name: 'Тяга гантели одной рукой', group: 'Спина', equipment: EQUIP.DB },
  { name: 'Тяга гантелей в наклоне', group: 'Спина', equipment: EQUIP.DB },
  { name: 'Тяга гантелей в планке (renegade row)', group: 'Спина', equipment: EQUIP.DB },
  { name: 'Гиперэкстензия', group: 'Спина', equipment: EQUIP.BW },
  { name: 'Супермен', group: 'Спина', equipment: EQUIP.BW },

  // Плечи
  { name: 'Армейский жим штанги стоя', group: 'Плечи', equipment: EQUIP.GYM },
  { name: 'Жим гантелей сидя', group: 'Плечи', equipment: EQUIP.DB },
  { name: 'Жим гантелей стоя', group: 'Плечи', equipment: EQUIP.DB },
  { name: 'Жим Арнольда', group: 'Плечи', equipment: EQUIP.DB },
  { name: 'Махи гантелями в стороны', group: 'Плечи', equipment: EQUIP.DB },
  { name: 'Подъём гантелей перед собой', group: 'Плечи', equipment: EQUIP.DB },
  { name: 'Разведение гантелей в наклоне (задняя дельта)', group: 'Плечи', equipment: EQUIP.DB },
  { name: 'Тяга штанги к подбородку', group: 'Плечи', equipment: EQUIP.GYM },
  { name: 'Жим в тренажёре на плечи', group: 'Плечи', equipment: EQUIP.GYM },
  { name: 'Разведение в тренажёре (задняя дельта)', group: 'Плечи', equipment: EQUIP.GYM },
  { name: 'Шраги со штангой', group: 'Плечи', equipment: EQUIP.GYM },
  { name: 'Шраги с гантелями', group: 'Плечи', equipment: EQUIP.DB },

  // Бицепс
  { name: 'Подъём штанги на бицепс', group: 'Бицепс', equipment: EQUIP.GYM },
  { name: 'Подъём гантелей на бицепс', group: 'Бицепс', equipment: EQUIP.DB },
  { name: 'Подъём гантелей на бицепс сидя', group: 'Бицепс', equipment: EQUIP.DB },
  { name: 'Молотковые сгибания', group: 'Бицепс', equipment: EQUIP.DB },
  { name: 'Концентрированный подъём', group: 'Бицепс', equipment: EQUIP.DB },
  { name: 'Подъём на скамье Скотта', group: 'Бицепс', equipment: EQUIP.GYM },
  { name: 'Сгибания на бицепс в кроссовере', group: 'Бицепс', equipment: EQUIP.GYM },

  // Трицепс
  { name: 'Французский жим', group: 'Трицепс', equipment: EQUIP.GYM },
  { name: 'Жим узким хватом лёжа', group: 'Трицепс', equipment: EQUIP.GYM },
  { name: 'Разгибание на блоке', group: 'Трицепс', equipment: EQUIP.GYM },
  { name: 'Разгибание на блоке канатом', group: 'Трицепс', equipment: EQUIP.GYM },
  { name: 'Разгибание гантели из-за головы', group: 'Трицепс', equipment: EQUIP.DB },
  { name: 'Разгибание гантели в наклоне (кикбэк)', group: 'Трицепс', equipment: EQUIP.DB },
  { name: 'Отжимания на брусьях', group: 'Трицепс', equipment: EQUIP.BW },
  { name: 'Отжимания узким хватом', group: 'Трицепс', equipment: EQUIP.BW },
  { name: 'Обратные отжимания от скамьи', group: 'Трицепс', equipment: EQUIP.BW },

  // Предплечья
  { name: 'Сгибание запястий со штангой', group: 'Предплечья', equipment: EQUIP.GYM },
  { name: 'Сгибание запястий с гантелями', group: 'Предплечья', equipment: EQUIP.DB },

  // Ноги
  { name: 'Приседания со штангой', group: 'Ноги', equipment: EQUIP.GYM },
  { name: 'Фронтальные приседания', group: 'Ноги', equipment: EQUIP.GYM },
  { name: 'Жим ногами', group: 'Ноги', equipment: EQUIP.GYM },
  { name: 'Разгибание ног в тренажёре', group: 'Ноги', equipment: EQUIP.GYM },
  { name: 'Сгибание ног в тренажёре', group: 'Ноги', equipment: EQUIP.GYM },
  { name: 'Румынская тяга', group: 'Ноги', equipment: EQUIP.GYM },
  { name: 'Становая тяга на прямых ногах', group: 'Ноги', equipment: EQUIP.GYM },
  { name: 'Приседания с гантелями', group: 'Ноги', equipment: EQUIP.DB },
  { name: 'Гоблет-приседания', group: 'Ноги', equipment: EQUIP.DB },
  { name: 'Выпады с гантелями', group: 'Ноги', equipment: EQUIP.DB },
  { name: 'Выпады ходьбой', group: 'Ноги', equipment: EQUIP.DB },
  { name: 'Болгарские выпады', group: 'Ноги', equipment: EQUIP.DB },
  { name: 'Зашагивания на платформу', group: 'Ноги', equipment: EQUIP.DB },
  { name: 'Приседания без веса', group: 'Ноги', equipment: EQUIP.BW },
  { name: 'Приседания с выпрыгиванием', group: 'Ноги', equipment: EQUIP.BW },
  { name: 'Стульчик у стены', group: 'Ноги', equipment: EQUIP.BW },

  // Ягодицы
  { name: 'Ягодичный мост со штангой', group: 'Ягодицы', equipment: EQUIP.GYM },
  { name: 'Ягодичный мост', group: 'Ягодицы', equipment: EQUIP.BW },
  { name: 'Ягодичный мостик на одной ноге', group: 'Ягодицы', equipment: EQUIP.BW },
  { name: 'Отведение ноги в кроссовере', group: 'Ягодицы', equipment: EQUIP.GYM },
  { name: 'Махи ногой назад', group: 'Ягодицы', equipment: EQUIP.BW },
  { name: 'Свинги с гантелью', group: 'Ягодицы', equipment: EQUIP.DB },

  // Икры
  { name: 'Подъём на носки стоя', group: 'Икры', equipment: EQUIP.GYM },
  { name: 'Подъём на носки сидя', group: 'Икры', equipment: EQUIP.GYM },
  { name: 'Подъём на носки с гантелями', group: 'Икры', equipment: EQUIP.DB },

  // Пресс
  { name: 'Скручивания', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Подъём корпуса', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Подъём ног в висе', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Подъём ног лёжа', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Планка', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Боковая планка', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Велосипед', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Скалолаз', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Вакуум живота', group: 'Пресс', equipment: EQUIP.BW },
  { name: 'Скручивания на блоке', group: 'Пресс', equipment: EQUIP.GYM },
  { name: 'Русский твист', group: 'Пресс', equipment: EQUIP.DB },

  // Всё тело / дом / кардио
  { name: 'Берпи', group: 'Всё тело', equipment: EQUIP.BW },
  { name: 'Трастеры (присед + жим)', group: 'Всё тело', equipment: EQUIP.DB },
  { name: 'Прыжки на скакалке', group: 'Всё тело', equipment: EQUIP.BW },
  { name: 'Подъём по лестнице', group: 'Всё тело', equipment: EQUIP.BW },
  { name: 'Тяга гантели к поясу двумя руками', group: 'Спина', equipment: EQUIP.DB },
];

export const EXERCISE_GROUPS: string[] = ['Все', ...Array.from(new Set(EXERCISES.map(e => e.group)))];
