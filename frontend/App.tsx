import React, { useState } from 'react';
import { View, Platform, UIManager, LogBox, ActivityIndicator, Text, TextInput, StatusBar } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { AppProvider, useApp } from './src/context/AppContext';
import AuthScreen from './src/screens/AuthScreen';
import MainShell from './src/screens/MainShell';
import { ScreenBackground } from './src/components/Gradient';
import { BootScreen } from './src/components/BootScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppAlertHost } from './src/components/AppAlert';
import { COLORS } from './src/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Тёмная нижняя навигационная панель Android, в цвет фона приложения. Раньше это
// настраивалось статически через app.json (androidNavigationBar), но то поле выпилили —
// теперь то же самое делается через API expo-navigation-bar при старте.
if (Platform.OS === 'android') {
  NavigationBar.setBackgroundColorAsync('#0A0C16').catch(() => {});
  NavigationBar.setButtonStyleAsync('light').catch(() => {});
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
  const { isSwitchingAccount, session, authReady, bootReady } = useApp();
  // Экран загрузки показывается один раз за «холодный» запуск процесса.
  const [bootDone, setBootDone] = useState(false);

  // Смена аккаунта — отдельный тёмный лоадер.
  if (isSwitchingAccount) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={COLORS.accentHover} />
      </View>
    );
  }

  // Сессия проверена и её нет → экран входа.
  if (authReady && !session) {
    return (
      <ScreenBackground>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <AuthScreen />
      </ScreenBackground>
    );
  }

  // Иначе: идёт проверка сессии ИЛИ грузятся данные → главный экран под экраном загрузки.
  const showMain = authReady && !!session;
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {showMain && <MainShell />}
      {!bootDone && <BootScreen done={showMain && bootReady} onFinish={() => setBootDone(true)} />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Root />
        <AppAlertHost />
      </AppProvider>
    </ErrorBoundary>
  );
}
