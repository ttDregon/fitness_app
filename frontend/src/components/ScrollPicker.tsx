import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { COLORS } from '../theme';
import type { ScrollPickerItem } from '../types';

export const ITEM_HEIGHT = 40;

interface ScrollPickerProps { items: ScrollPickerItem[]; selectedValue: string | number; onValueChange: (value: string | number) => void; width?: number; textColor?: string; lineColor?: string; }

export const ScrollPicker = ({ items, selectedValue, onValueChange, width = 100, textColor, lineColor }: ScrollPickerProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = items.findIndex((i: ScrollPickerItem) => i.value === selectedValue);
    if (idx >= 0 && idx !== selectedIndex) {
      setSelectedIndex(idx);
      setTimeout(() => { scrollViewRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true }); }, 100);
    }
  }, [selectedValue, items]);

  const paddedItems = [{ label: '', value: 'pad1' }, ...items, { label: '', value: 'pad2' }];
  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    if (items[index]) { setSelectedIndex(index); onValueChange(items[index].value); }
  };

  return (
    <View style={{ height: ITEM_HEIGHT * 3, width, overflow: 'hidden', alignItems: 'center' }}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled={true}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{ paddingBottom: 0 }}
      >
        {paddedItems.map((item, index) => {
          const isSelected = index === selectedIndex + 1;
          return (
            <View key={index} style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: isSelected ? 24 : 16, color: isSelected ? (textColor || COLORS.textPrimary) : 'rgba(148, 163, 184, 0.4)', fontWeight: isSelected ? '800' : '500', transform: [{ scale: isSelected ? 1.1 : 1 }] }}>{item.label}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ position: 'absolute', top: ITEM_HEIGHT, height: ITEM_HEIGHT, width: '100%', borderTopWidth: 2, borderBottomWidth: 2, borderColor: lineColor || 'rgba(139, 92, 246, 0.3)', zIndex: -1, pointerEvents: 'none', borderRadius: 8 }} />
    </View>
  );
};
