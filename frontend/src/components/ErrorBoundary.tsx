import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { COLORS } from '../theme';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

// Ловит ошибки рендера в дереве ниже и показывает экран восстановления вместо
// «белого экрана»/вылета. Стоит выше провайдера, поэтому не зависит от контекста.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    // Лог в консоль (виден в dev и в нативных логах). Сюда же можно добавить
    // отправку на бэкенд при желании.
    console.error('App crashed:', error, info?.componentStack);
  }

  handleRestart = async () => {
    try {
      // Чистая перезагрузка JS-бандла (модуль уже в бинаре — используется для OTA).
      const Updates = require('expo-updates');
      if (Updates?.reloadAsync) {
        await Updates.reloadAsync();
        return;
      }
    } catch {}
    // Фолбэк: просто сбросить состояние и перемонтировать дерево.
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
          Что-то пошло не так
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 21 }}>
          Произошла ошибка. Нажмите, чтобы перезапустить приложение — ваши данные сохранены.
        </Text>
        <TouchableOpacity
          onPress={this.handleRestart}
          activeOpacity={0.85}
          style={{ backgroundColor: COLORS.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Перезапустить</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
