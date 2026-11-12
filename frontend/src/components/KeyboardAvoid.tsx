import React from 'react';
import { KeyboardAvoidingView, StyleProp, ViewStyle } from 'react-native';

/**
 * На Android приложение рисуется edge-to-edge, и окно больше НЕ сжимается под клавиатуру
 * (см. docs.expo.dev/guides/keyboard-handling) — поле чата и формы в модалках оказывались
 * под клавиатурой. behavior="padding" на обеих платформах: он считает реальное перекрытие
 * клавиатурой своей рамки, так что если система всё же сожмёт окно, лишнего отступа не будет.
 *
 * offset < 0 — «съесть» часть отступа: например, под полем чата есть место под таб-бар,
 * которое при открытой клавиатуре не нужно (таб-бар уходит под неё).
 */
export function KeyboardAvoid({ children, offset = 0, style }: { children: React.ReactNode; offset?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={offset} style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}
