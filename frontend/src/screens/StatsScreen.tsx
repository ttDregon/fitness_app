import React from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';

export default function StatsScreen() {
  const { handleTabChange } = useApp();

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 15 }}><Text style={styles.pageTitle} numberOfLines={1}>Статистика</Text></View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}><Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>
      <View style={styles.centerView}>
        <Ionicons name="stats-chart" size={100} color={COLORS.cyan} style={{opacity: 0.85}} />
        <Text style={styles.placeholderText}>Раздел находится в разработке</Text>
      </View>
    </View>
  );
}
