import React from 'react';
import { View, Text, TouchableOpacity, StatusBar, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';

// Публичный URL актуальной политики конфиденциальности (Claude Artifact). Тот же адрес
// указывается в листинге Google Play — при обновлении текста политики меняется контент
// по этой же ссылке, менять здесь ничего не нужно.
const PRIVACY_POLICY_URL = 'https://claude.ai/code/artifact/af27e39b-05d2-4b94-b0ea-87bc46f4aae8';

export default function SettingsScreen() {
  const { menuNavigate, handleDeleteAccount } = useApp();

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => menuNavigate('home')} style={{padding: 5}}><Ionicons name="arrow-back" size={32} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={[styles.pageTitle, {flex: 1, textAlign: 'center', marginRight: 42}]}>Настройки</Text>
      </View>

      <View style={settingsCard}>
        <TouchableOpacity style={settingsRow} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          <View style={settingsRowIconWrap}><Ionicons name="shield-checkmark-outline" size={20} color={COLORS.indigo} /></View>
          <Text style={settingsRowText}>Политика конфиденциальности</Text>
          <Ionicons name="open-outline" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.settingsContainer}>
        <Ionicons name="warning-outline" size={64} color={COLORS.error} style={{marginBottom: 20, opacity: 0.6}} />
        <Text style={styles.settingsTitle}>Удаление аккаунта</Text>
        <Text style={styles.settingsDesc}>Безвозвратно удалит профиль и все связанные записи — тренировки, питание, историю веса.</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAccount}><Ionicons name="trash-outline" size={22} color="#fff" style={{marginRight: 12}}/><Text style={styles.dangerButtonText}>Удалить аккаунт навсегда</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const settingsCard = { backgroundColor: COLORS.card, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: 'hidden' as const };
const settingsRow = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 18, paddingHorizontal: 18 };
const settingsRowIconWrap = { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(99,102,241,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 14 };
const settingsRowText = { flex: 1, color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' as const };
