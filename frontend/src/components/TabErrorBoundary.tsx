import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';

// Перехватывает краши рендера, чтобы ошибка в одной вкладке не убивала всё приложение.
export class TabErrorBoundary extends React.Component<{ children: React.ReactNode; onReset?: () => void }, { error: Error | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  handleReset = () => { this.setState({ error: null }); this.props.onReset?.(); };
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <Ionicons name="warning-outline" size={64} color={COLORS.error} style={{ marginBottom: 16 }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 }}>Что-то пошло не так</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>{this.state.error?.message || 'Неизвестная ошибка'}</Text>
          <TouchableOpacity onPress={this.handleReset} style={{ backgroundColor: COLORS.tabBar, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Вернуться на главную</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
