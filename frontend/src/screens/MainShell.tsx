import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar, Modal, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TabErrorBoundary } from '../components/TabErrorBoundary';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';
import HomeScreen from './HomeScreen';
import WorkoutScreen from './WorkoutScreen';
import ClubScreen from './ClubScreen';
import SettingsScreen from './SettingsScreen';
import ChatScreen from './ChatScreen';
import StatsScreen from './StatsScreen';
import NutritionScreen from './NutritionScreen';
import ProfileScreen from './ProfileScreen';
import type { SavedAccount } from '../types';

export default function MainShell() {
  const {
    currentTab, activeGroup, contentFadeAnim, setActiveGroup, setCurrentTab,
    closeAnimatedModal, modalOpacityAnim, modalScaleAnim, setIsAccountSwitcherVisible,
    isAccountSwitcherVisible, savedAccounts, session, handleSwitchAccount, handleAddAnotherAccount,
    handleTabChange,
  } = useApp();

  const renderContent = () => {
    switch (currentTab) {
      case 'home': return <HomeScreen />;
      case 'workout': return <WorkoutScreen />;
      case 'club': return <ClubScreen />;
      case 'settings': return <SettingsScreen />;
      case 'profile': return <ProfileScreen />;
      case 'chat': return <ChatScreen />;
      case 'stats': return <StatsScreen />;
      case 'nutrition': return <NutritionScreen />;
      default: return <HomeScreen />;
    }
  };

  return (
    <View style={styles.containerApp}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <Animated.View style={[styles.contentArea, { opacity: contentFadeAnim }]}>
        <TabErrorBoundary key={`${currentTab}_${activeGroup?.id || 'none'}`} onReset={() => { setActiveGroup(null); setCurrentTab('home'); }}>
          {renderContent()}
        </TabErrorBoundary>
      </Animated.View>

      {isAccountSwitcherVisible && (
        <Modal transparent animationType="none" onRequestClose={() => closeAnimatedModal(setIsAccountSwitcherVisible)}>
          <Animated.View style={[styles.accountSwitcherOverlay, { opacity: modalOpacityAnim }]}>
            <Animated.View style={[styles.accountSwitcherContent, { transform: [{ translateY: modalScaleAnim.interpolate({ inputRange: [0.9, 1], outputRange: [100, 0] }) }] }]}>
              <View style={styles.accountSwitcherHeader}><Text style={styles.accountSwitcherTitle}>Выберите аккаунт</Text><TouchableOpacity onPress={() => closeAnimatedModal(setIsAccountSwitcherVisible)}><Ionicons name="close-circle" size={36} color={COLORS.textSecondary} /></TouchableOpacity></View>
              <ScrollView style={{maxHeight: 350}} showsVerticalScrollIndicator={false}>
                {savedAccounts.map((acc: SavedAccount) => {
                  const isActive = session?.user?.id === acc.id;
                  return ( <TouchableOpacity key={acc.id} style={[styles.accountItem, isActive && styles.accountItemActive]} onPress={() => handleSwitchAccount(acc)}><Ionicons name="person-circle" size={50} color={isActive ? COLORS.tabBar : COLORS.textSecondary} /><View style={{flex: 1, marginLeft: 15}}><Text style={styles.accName}>{acc.name}</Text><Text style={styles.accEmail}>{acc.email}</Text></View>{isActive && <Ionicons name="checkmark" size={26} color={COLORS.tabBar} />}</TouchableOpacity> )
                })}
                <TouchableOpacity style={styles.addAccountBtn} onPress={handleAddAnotherAccount}><Ionicons name="person-add-outline" size={24} color={COLORS.textPrimary} /><Text style={styles.addAccountText}>Добавить аккаунт</Text></TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}

      <View style={[styles.tabBar, { paddingBottom: Platform.OS === 'ios' ? 35 : 20, paddingTop: 15 }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => handleTabChange('chat')}><Ionicons name={currentTab === 'chat' ? "chatbubble" : "chatbubble-outline"} size={28} color={currentTab === 'chat' ? COLORS.tabBar : COLORS.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => handleTabChange('workout')}><Ionicons name={currentTab === 'workout' ? "barbell" : "barbell-outline"} size={32} color={currentTab === 'workout' ? COLORS.tabBar : COLORS.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => handleTabChange('home')}><View style={[styles.homeTabIcon, currentTab === 'home' && {backgroundColor: COLORS.tabBar}]}><Ionicons name={currentTab === 'home' ? "home" : "home-outline"} size={32} color={currentTab === 'home' ? '#fff' : COLORS.textSecondary} /></View></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => handleTabChange('club')}><Ionicons name={currentTab === 'club' ? "people" : "people-outline"} size={32} color={currentTab === 'club' ? COLORS.tabBar : COLORS.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => handleTabChange('stats')}><Ionicons name={currentTab === 'stats' ? "stats-chart" : "stats-chart-outline"} size={28} color={currentTab === 'stats' ? COLORS.tabBar : COLORS.textSecondary} /></TouchableOpacity>
      </View>
    </View>
  );
}
