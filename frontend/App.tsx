import React from 'react';
import { Platform, UIManager, LogBox, View, ActivityIndicator } from 'react-native';
import { AppProvider, useApp } from './src/context/AppContext';
import AuthScreen from './src/screens/AuthScreen';
import MainShell from './src/screens/MainShell';
import { styles } from './src/styles';
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
      <View style={[styles.containerApp, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.tabBar} />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return <MainShell />;
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
