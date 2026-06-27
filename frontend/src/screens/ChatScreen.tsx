import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../components/Gradient';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { useApp } from '../context/AppContext';

// Плавное «печатающееся» появление текста ответа ИИ.
// Анимируется только при animate=true (новые сообщения); история выводится сразу.
function TypewriterText({ text, animate, onDone, style }: { text: string; animate: boolean; onDone?: () => void; style?: any }) {
  const [count, setCount] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) { setCount(text.length); return; }
    setCount(0);
    const step = Math.max(1, Math.ceil(text.length / 140)); // вся анимация ≤ ~2.3с
    let i = 0;
    const timer = setInterval(() => {
      i += step;
      if (i >= text.length) { i = text.length; clearInterval(timer); onDone?.(); }
      setCount(i);
    }, 16);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, animate]);
  const done = count >= text.length;
  return <Text style={style}>{text.slice(0, count)}{done ? '' : '▌'}</Text>;
}

export default function ChatScreen() {
  const {
    isChatSidebarVisible, setIsChatSidebarVisible, createNewChat, chatSessions, activeChatId,
    smoothStateUpdate, setActiveChatId, deleteChat, displayName, openAnimatedModal, handleTabChange,
    editingMessageId, editInput, setEditInput, setEditingMessageId, saveEditMessage, startEditMessage,
    isChatLoading, handleSendChatMessage, chatScrollRef,
  } = useApp();
  // Локальный стейт ввода — чтобы набор текста не перерисовывал весь общий контекст.
  const [chatInput, setChatInput] = useState('');

  // Какие сообщения уже показаны (без повторной анимации). При открытии чата
  // помечаем всю текущую историю как «показанную» — анимируются только новые ответы ИИ.
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const chat = chatSessions.find(c => c.id === activeChatId);
    seenRef.current = new Set((chat?.messages || []).map(m => m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  const renderChatSidebar = () => {
    if (!isChatSidebarVisible) return null;
    return (
      <Modal visible={true} transparent animationType="fade" onRequestClose={() => setIsChatSidebarVisible(false)}>
        <View style={styles.chatSidebarOverlay}>
           <View style={styles.chatSidebarContent}>
              <GradientButton colors={GRADIENTS.indigo} style={styles.newChatBtnSidebar} onPress={createNewChat}>
                 <Ionicons name="add" size={24} color="#fff" />
                 <Text style={styles.newChatBtnTextSidebar}>Новый чат</Text>
              </GradientButton>

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
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setIsChatSidebarVisible(true)} style={{padding: 5, marginRight: 15}}>
           <Ionicons name="menu" size={32} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginRight: 15 }}>
           <Text style={styles.pageTitle} numberOfLines={1}>{activeChatId ? activeChat?.title : 'Новый чат'}</Text>
        </View>
        <TouchableOpacity onPress={() => handleTabChange('profile')} style={styles.profileBtn}>
           <Ionicons name="person-circle-outline" size={42} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {renderChatSidebar()}

      {!activeChatId && currentMessages.length === 0 ? (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20}}>
           <Ionicons name="chatbubbles" size={80} color={COLORS.indigo} style={{opacity: 0.7, marginBottom: 20}} />
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
                  <TouchableOpacity onPress={saveEditMessage} style={{padding: 8}}><Text style={{color: COLORS.indigo, fontWeight: 'bold', fontSize: 16}}>Сохранить</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <View key={msg.id} style={[styles.chatBubble, msg.sender === 'user' ? styles.chatBubbleUser : styles.chatBubbleAI]}>
                {msg.sender === 'ai' ? (
                  <TypewriterText
                    text={msg.text}
                    animate={!seenRef.current.has(msg.id)}
                    onDone={() => seenRef.current.add(msg.id)}
                    style={[styles.chatText, styles.chatTextAI]}
                  />
                ) : (
                  <Text style={[styles.chatText, styles.chatTextUser]}>{msg.text}</Text>
                )}
                {msg.sender === 'user' && (
                  <TouchableOpacity onPress={() => startEditMessage(msg)} style={styles.editIconBtn}>
                    <Ionicons name="pencil" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            )
          ))}
          {isChatLoading && ( <View style={[styles.chatBubble, styles.chatBubbleAI, { width: 70, alignItems: 'center' }]}><ActivityIndicator size="small" color={COLORS.indigo} /></View> )}
        </ScrollView>
      )}

      <View style={styles.chatInputRow}>
        <TextInput style={styles.chatInput} placeholder="Запитайте AI..." placeholderTextColor={COLORS.textSecondary} value={chatInput} onChangeText={setChatInput} multiline />
        <GradientButton colors={GRADIENTS.indigo} style={styles.chatSendBtn} onPress={() => { handleSendChatMessage(chatInput); setChatInput(''); }} disabled={isChatLoading}><Ionicons name="send" size={22} color="#fff" /></GradientButton>
      </View>
    </View>
  );
}
