import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { COLORS } from '../theme';
import { useApp } from '../context/AppContext';

export default function ChatScreen() {
  const {
    isChatSidebarVisible, setIsChatSidebarVisible, createNewChat, chatSessions, activeChatId,
    smoothStateUpdate, setActiveChatId, deleteChat, displayName, openAnimatedModal, setIsSideMenuVisible,
    editingMessageId, editInput, setEditInput, setEditingMessageId, saveEditMessage, startEditMessage,
    isChatLoading, chatInput, setChatInput, handleSendChatMessage, chatScrollRef,
  } = useApp();

  const renderChatSidebar = () => {
    if (!isChatSidebarVisible) return null;
    return (
      <Modal visible={true} transparent animationType="fade" onRequestClose={() => setIsChatSidebarVisible(false)}>
        <View style={styles.chatSidebarOverlay}>
           <View style={styles.chatSidebarContent}>
              <TouchableOpacity style={styles.newChatBtnSidebar} onPress={createNewChat}>
                 <Ionicons name="add" size={24} color="#fff" />
                 <Text style={styles.newChatBtnTextSidebar}>Новый чат</Text>
              </TouchableOpacity>

              <Text style={styles.sidebarSectionTitle}>Чаты</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {chatSessions.sort((a,b) => b.updatedAt - a.updatedAt).map(chat => (
                   <View key={chat.id} style={[styles.chatSidebarItem, activeChatId === chat.id && styles.chatSidebarItemActive]}>
                      <TouchableOpacity style={{flex: 1, flexDirection: 'row', alignItems: 'center'}} onPress={() => { smoothStateUpdate(() => { setActiveChatId(chat.id); setIsChatSidebarVisible(false); }); }}>
                         <Ionicons name="chatbubble-outline" size={20} color={COLORS.chatSidebarText} style={{marginRight: 12}} />
                         <Text style={styles.chatSidebarItemText} numberOfLines={1}>{chat.title}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteChat(chat.id)} style={{padding: 8}}>
                         <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                      </TouchableOpacity>
                   </View>
                ))}
                {chatSessions.length === 0 && <Text style={{color: COLORS.textSecondary, marginTop: 15, fontSize: 14, textAlign: 'center'}}>Нет диалогов</Text>}
              </ScrollView>
           </View>
           <TouchableOpacity style={styles.chatSidebarCloseArea} onPress={() => setIsChatSidebarVisible(false)} />
        </View>
      </Modal>
    );
  };

  const activeChat = chatSessions.find(c => c.id === activeChatId);
  const currentMessages = activeChat ? activeChat.messages : [];

  return (
    <View style={styles.mainContent}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setIsChatSidebarVisible(true)} style={{padding: 5, marginRight: 15}}>
           <Ionicons name="menu" size={32} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginRight: 15 }}>
           <Text style={styles.pageTitle} numberOfLines={1}>{activeChatId ? activeChat?.title : 'Новый чат'}</Text>
        </View>
        <TouchableOpacity onPress={() => openAnimatedModal(setIsSideMenuVisible)} style={styles.profileBtn}>
           <Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {renderChatSidebar()}

      {!activeChatId && currentMessages.length === 0 ? (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20}}>
           <Ionicons name="chatbubbles-outline" size={80} color={COLORS.tabBar} style={{opacity: 0.6, marginBottom: 20}} />
           <Text style={{fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12, textAlign: 'center'}}>
              Привет, {displayName}!
           </Text>
           <Text style={{fontSize: 18, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 26}}>
              Задавай любые вопросы о тренировках и питании.
           </Text>
        </View>
      ) : (
        <ScrollView style={styles.chatContainer} contentContainerStyle={{ paddingBottom: 20 }} ref={chatScrollRef} onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false}>
          {currentMessages.map(msg => (
            editingMessageId === msg.id ? (
              <View key={msg.id} style={styles.editMessageContainer}>
                <TextInput style={styles.editMessageInput} value={editInput} onChangeText={setEditInput} multiline />
                <View style={styles.editMessageActions}>
                  <TouchableOpacity onPress={() => smoothStateUpdate(() => setEditingMessageId(null))} style={{padding: 8}}><Text style={{color: COLORS.error, marginRight: 20, fontSize: 16, fontWeight: '600'}}>Отмена</Text></TouchableOpacity>
                  <TouchableOpacity onPress={saveEditMessage} style={{padding: 8}}><Text style={{color: COLORS.tabBar, fontWeight: 'bold', fontSize: 16}}>Сохранить</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <View key={msg.id} style={[styles.chatBubble, msg.sender === 'user' ? styles.chatBubbleUser : styles.chatBubbleAI]}>
                <Text style={[styles.chatText, msg.sender === 'user' ? styles.chatTextUser : styles.chatTextAI]}>{msg.text}</Text>
                {msg.sender === 'user' && (
                  <TouchableOpacity onPress={() => startEditMessage(msg)} style={styles.editIconBtn}>
                    <Ionicons name="pencil" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            )
          ))}
          {isChatLoading && ( <View style={[styles.chatBubble, styles.chatBubbleAI, { width: 70, alignItems: 'center' }]}><ActivityIndicator size="small" color={COLORS.tabBar} /></View> )}
        </ScrollView>
      )}

      <View style={styles.chatInputRow}>
        <TextInput style={styles.chatInput} placeholder="Запитайте AI..." placeholderTextColor={COLORS.textSecondary} value={chatInput} onChangeText={setChatInput} multiline />
        <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendChatMessage} disabled={isChatLoading}><Ionicons name="send" size={22} color="#fff" /></TouchableOpacity>
      </View>
    </View>
  );
}
