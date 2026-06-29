import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Alert } from 'react-native';
import { COLORS } from '../theme';

// Тёмная модалка в стиле приложения вместо системного белого Alert.
// API совместим с Alert.alert: appAlert(title, message?, buttons?).
type AlertButton = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };
type AlertConfig = { title: string; message?: string; buttons?: AlertButton[] };

let emit: ((cfg: AlertConfig) => void) | null = null;

export function appAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (emit) emit({ title, message, buttons });
  else Alert.alert(title, message, buttons as any); // фолбэк, если хост ещё не смонтирован
}

export function AppAlertHost() {
  const [cfg, setCfg] = useState<AlertConfig | null>(null);

  useEffect(() => {
    emit = (c) => setCfg(c);
    return () => { emit = null; };
  }, []);

  if (!cfg) return null;

  const buttons: AlertButton[] = (cfg.buttons && cfg.buttons.length) ? cfg.buttons : [{ text: 'OK' }];
  const stacked = buttons.length > 2;
  const close = (b: AlertButton) => { setCfg(null); setTimeout(() => b.onPress && b.onPress(), 60); };
  const colorOf = (b: AlertButton) =>
    b.style === 'destructive' ? COLORS.rose : b.style === 'cancel' ? COLORS.textSecondary : COLORS.accentHover;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCfg(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: COLORS.card, borderRadius: 24, padding: 26, borderWidth: 1, borderColor: COLORS.borderSoft, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 12 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: '800', marginBottom: cfg.message ? 10 : 20 }}>{cfg.title}</Text>
          {!!cfg.message && <Text style={{ color: COLORS.textSecondary, fontSize: 16, lineHeight: 22, marginBottom: 22 }}>{cfg.message}</Text>}
          <View style={{ flexDirection: stacked ? 'column' : 'row', justifyContent: 'flex-end', gap: 8 }}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => close(b)}
                activeOpacity={0.7}
                style={{ paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, alignItems: stacked ? 'center' : 'flex-end' }}
              >
                <Text style={{ color: colorOf(b), fontSize: 16, fontWeight: '800' }}>{b.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
