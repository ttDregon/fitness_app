import React from 'react';
import { Platform, UIManager, LogBox, ActivityIndicator, Text, TextInput, StatusBar } from 'react-native';
import { AppProvider, useApp } from './src/context/AppContext';
import AuthScreen from './src/screens/AuthScreen';
import MainShell from './src/screens/MainShell';
import { ScreenBackground } from './src/components/Gradient';
import { COLORS } from './src/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Текст в приложении НЕ должен зависеть от системного размера шрифта.
// Отключаем масштабирование глобально для всех Text/TextInput.
const TextAny = Text as any;
TextAny.defaultProps = TextAny.defaultProps || {};
TextAny.defaultProps.allowFontScaling = false;
TextAny.defaultProps.maxFontSizeMultiplier = 1;
const TextInputAny = TextInput as any;
TextInputAny.defaultProps = TextInputAny.defaultProps || {};
TextInputAny.defaultProps.allowFontScaling = false;
TextInputAny.defaultProps.maxFontSizeMultiplier = 1;

LogBox.ignoreLogs([
  'VirtualizedLists should never be nested',
  'props.pointerEvents is deprecated'
]);

function Root() {
  const { isSwitchingAccount, session, authReady } = useApp();

  // Пока не проверена сохранённая сессия (или идёт смена аккаунта) — показываем заставку,
  // а не экран входа. Иначе при холодном старте на миг мелькает окно входа.
  if (isSwitchingAccount || !authReady) {
    return (
      <ScreenBackground style={{ justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={COLORS.accentHover} />
      </ScreenBackground>
    );
  }

  if (!session) return (
    <ScreenBackground>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <AuthScreen />
    </ScreenBackground>
  );

  return <MainShell />;
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
