import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../theme';

const { height } = Dimensions.get('window');

/**
 * Стартовый экран загрузки: логотип по центру + полоса прогресса (~62% высоты).
 * Фон плоский тёмный (#0A0C16) — бесшовно продолжает нативный сплэш.
 * Когда done=true (всё нужное загружено) — добегает до 100% и плавно растворяется,
 * открывая главный экран под собой.
 */
export function BootScreen({ done, onFinish }: { done: boolean; onFinish: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const startedAt = useRef(Date.now()).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 0.85, duration: 1400, easing: undefined, useNativeDriver: false }).start();
  }, [progress]);

  useEffect(() => {
    if (!done) return;
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, 450 - elapsed); // минимальный показ, чтобы не мигало
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: false }),
        Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start(() => onFinish());
    }, wait);
    return () => clearTimeout(t);
  }, [done, progress, fade, startedAt, onFinish]);

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <Image source={require('../../assets/splash.png')} style={styles.logo} />
      <View style={[styles.barWrap, { top: height * 0.62 }]}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 210, height: 210, resizeMode: 'contain' },
  barWrap: { position: 'absolute', width: '58%', alignSelf: 'center' },
  barTrack: { height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.accentHover },
});
