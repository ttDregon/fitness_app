import { Dimensions, Platform, StatusBar } from 'react-native';

/**
 * Палитра «Aurora» — глубокий сине-фиолетовый фон с многоцветными акцентами.
 * Раньше интерфейс держался на 3 цветах (фон / карточка / фиолетовый).
 * Теперь у каждого раздела свой оттенок, плюс готовые градиенты.
 */
export const COLORS = {
  // --- Поверхности (несколько уровней глубины) ---
  bg: '#0A0C16',          // основной фон
  bgDeep: '#070811',      // самый тёмный (за модалками)
  surface: '#121728',     // приподнятая поверхность
  card: '#171C30',        // карточки
  cardAlt: '#1E2438',     // вложенные блоки / инпуты
  cardHover: '#232A42',
  border: '#262C44',
  borderSoft: 'rgba(255,255,255,0.06)',

  // --- Текст ---
  textPrimary: '#F5F7FF',
  textSecondary: '#94A0C0',
  textMuted: '#5E6788',

  // --- Базовый акцент (фиолетовый) — обратная совместимость ---
  tabBar: '#8B5CF6',
  accent: '#8B5CF6',
  accentHover: '#A78BFA',
  accentSoft: 'rgba(139, 92, 246, 0.16)',

  // --- Многоцветная система акцентов ---
  violet: '#8B5CF6',
  indigo: '#6366F1',
  blue: '#3B82F6',
  sky: '#38BDF8',
  cyan: '#22D3EE',
  teal: '#2DD4BF',
  emerald: '#34D399',
  green: '#22C55E',
  lime: '#A3E635',
  amber: '#FBBF24',
  orange: '#FB923C',
  rose: '#FB7185',
  pink: '#F472B6',
  fuchsia: '#E879F9',

  // --- Семантика ---
  success: '#34D399',
  error: '#F87171',
  warning: '#FBBF24',

  // --- Чат-сайдбар ---
  chatSidebarBg: '#0D1120',
  chatSidebarHover: '#1E2438',
  chatSidebarText: '#F5F7FF',

  // --- Макросы (КБЖУ) ---
  protein: '#38BDF8',  // белки — голубой
  fat: '#FBBF24',      // жиры — янтарный
  carb: '#FB7185',     // углеводы — розовый
} as const;

/** Готовые градиенты [from, to]. Используются в GradientButton/GradientView. */
export const GRADIENTS = {
  primary: ['#A78BFA', '#7C3AED'],
  violet: ['#8B5CF6', '#6D28D9'],
  violetIndigo: ['#8B5CF6', '#5B6CF0'],
  violetPink: ['#A855F7', '#EC4899'],
  indigo: ['#818CF8', '#4F46E5'],
  sky: ['#38BDF8', '#0EA5E9'],
  cyan: ['#22D3EE', '#2563EB'],
  emerald: ['#34D399', '#0EA47A'],
  emeraldCyan: ['#34D399', '#22D3EE'],
  amber: ['#FBBF24', '#F97316'],
  orange: ['#FB923C', '#F43F5E'],
  rose: ['#FB7185', '#E11D8F'],
  pink: ['#F472B6', '#A855F7'],
  danger: ['#FB7185', '#E11D48'],
  // мягкие акцентные «свечения» для фона-ауроры
  auroraA: '#8B5CF6',
  auroraB: '#22D3EE',
  auroraC: '#FB7185',
} as const;

export type GradientKey = keyof typeof GRADIENTS;

export const screenWidth = Dimensions.get('window').width;

// Высота системной полосы статуса. Статус-бар сделан прозрачным (аврора уходит под него),
// поэтому контент нужно опускать на эту высоту, чтобы заголовки не лезли под часы/чёлку.
export const TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 47;
