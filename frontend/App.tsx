import React from 'react';
import { Platform, UIManager, LogBox, ActivityIndicator } from 'react-native';
import { AppProvider, useApp } from './src/context/AppContext';
import AuthScreen from './src/screens/AuthScreen';
import MainShell from './src/screens/MainShell';
import { ScreenBackground } from './src/components/Gradient';
import { COLORS } from './src/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

LogBox.ignoreLogs([
  'VirtualizedLists should never be nested',
  'props.pointerEvents is deprecated'
]);

function Root() {
  const { isSwitchingAccount, session } = useApp();

  if (isSwitchingAccount) {
    return (
      <ScreenBackground style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.accentHover} />
      </ScreenBackground>
    );
  }

  if (!session) return <ScreenBackground><AuthScreen /></ScreenBackground>;

  return <MainShell />;
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
