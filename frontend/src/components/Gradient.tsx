import React, { useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, RadialGradient as SvgRadialGradient, Stop, Rect } from 'react-native-svg';
import { COLORS, GRADIENTS } from '../theme';

// Уникальный id для каждого <LinearGradient> внутри SVG.
let _gid = 0;
const useGradId = (prefix = 'g') => useRef(`${prefix}_${_gid++}`).current;

interface Point { x: number; y: number }
const TL: Point = { x: 0, y: 0 };
const BR: Point = { x: 1, y: 1 };

type Colors = readonly string[];

const stops = (colors: Colors, locations?: number[]) =>
  colors.map((c, i) => (
    <Stop key={i} offset={locations ? locations[i] : i / Math.max(colors.length - 1, 1)} stopColor={c} stopOpacity={1} />
  ));

/** Заливка градиентом во всю площадь родителя (абсолютно позиционирована, не ловит тапы). */
export function GradientFill({
  colors = GRADIENTS.primary,
  start = TL,
  end = BR,
  locations,
}: {
  colors?: Colors;
  start?: Point;
  end?: Point;
  locations?: number[];
}) {
  const id = useGradId('fill');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id={id} x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
            {stops(colors, locations)}
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Любой контейнер с градиентной заливкой. Контент рисуется поверх. */
export function GradientView({
  colors = GRADIENTS.primary,
  start = TL,
  end = BR,
  locations,
  style,
  children,
  pointerEvents,
}: {
  colors?: Colors;
  start?: Point;
  end?: Point;
  locations?: number[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}) {
  return (
    <View style={[styles.clip, style]} pointerEvents={pointerEvents}>
      <GradientFill colors={colors} start={start} end={end} locations={locations} />
      {children}
    </View>
  );
}

/**
 * Кнопка с градиентом. Drop-in замена <TouchableOpacity>: те же props
 * (onPress / disabled / style / children). Цвет фона из style перекрывается заливкой.
 */
export function GradientButton({
  onPress,
  onLongPress,
  disabled,
  style,
  colors = GRADIENTS.primary,
  start = TL,
  end = BR,
  activeOpacity = 0.85,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  colors?: Colors;
  start?: Point;
  end?: Point;
  activeOpacity?: number;
  children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      activeOpacity={activeOpacity}
      style={[styles.clip, style, disabled && styles.disabled]}
    >
      <GradientFill colors={colors} start={start} end={end} />
      {children}
    </TouchableOpacity>
  );
}

/**
 * Фон-аурора: глубокий фон + мягкие цветные «свечения» по углам.
 * Один компонент даёт всему экрану множество оттенков сразу.
 */
export function ScreenBackground({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.bgRoot, style]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <SvgRadialGradient id="aurora1" cx="12%" cy="-2%" r="60%">
              <Stop offset="0" stopColor={GRADIENTS.auroraA} stopOpacity={0.28} />
              <Stop offset="1" stopColor={GRADIENTS.auroraA} stopOpacity={0} />
            </SvgRadialGradient>
            <SvgRadialGradient id="aurora2" cx="98%" cy="8%" r="55%">
              <Stop offset="0" stopColor={GRADIENTS.auroraB} stopOpacity={0.20} />
              <Stop offset="1" stopColor={GRADIENTS.auroraB} stopOpacity={0} />
            </SvgRadialGradient>
            <SvgRadialGradient id="aurora3" cx="85%" cy="102%" r="65%">
              <Stop offset="0" stopColor={GRADIENTS.auroraC} stopOpacity={0.16} />
              <Stop offset="1" stopColor={GRADIENTS.auroraC} stopOpacity={0} />
            </SvgRadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={COLORS.bg} />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#aurora1)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#aurora2)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#aurora3)" />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  disabled: { opacity: 0.55 },
  bgRoot: { flex: 1, backgroundColor: COLORS.bg },
});
