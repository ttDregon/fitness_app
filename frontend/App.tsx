import React, { useState } from 'react';
import { View, Platform, UIManager, LogBox, ActivityIndicator, Text, TextInput, StatusBar } from 'react-native';
import { AppProvider, useApp } from './src/context/AppContext';
import AuthScreen from './src/screens/AuthScreen';
import MainShell from './src/screens/MainShell';
import { ScreenBackground } from './src/components/Gradient';
import { BootScreen } from './src/components/BootScreen';
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
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
