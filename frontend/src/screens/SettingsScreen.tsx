import React from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';

export default function SettingsScreen() {
  const { menuNavigate, handleDeleteAccount } = useApp();

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => menuNavigate('home')} style={{padding: 5}}><Ionicons name="arrow-back" size={32} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={[styles.pageTitle, {flex: 1, textAlign: 'center', marginRight: 42}]}>Настройки</Text>
      </View>
      <View style={styles.settingsContainer}>
        <Ionicons name="construct-outline" size={90} color={COLORS.textSecondary} style={{marginBottom: 25, opacity: 0.5}} />
        <Text style={styles.settingsTitle}>Управление профилем</Text>
        <Text style={styles.settingsDesc}>Здесь будут дополнительные настройки. Пока доступна только опция удаления аккаунта.</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAccount}><Ionicons name="warning-outline" size={24} color="#fff" style={{marginRight: 12}}/><Text style={styles.dangerButtonText}>Удалить аккаунт навсегда</Text></TouchableOpacity>
      </View>
    </View>
  );
}
