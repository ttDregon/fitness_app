import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { COLORS } from '../theme';
import type { ScrollPickerItem } from '../types';

export const ITEM_HEIGHT = 40;

interface ScrollPickerProps { items: ScrollPickerItem[]; selectedValue: string | number; onValueChange: (value: string | number) => void; width?: number; textColor?: string; lineColor?: string; }

export const ScrollPicker = ({ items, selectedValue, onValueChange, width = 100, textColor, lineColor }: ScrollPickerProps) => {
  const initialIndex = Math.max(0, items.findIndex(item => item.value === selectedValue));
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const scrollViewRef = useRef<ScrollView>(null);
  const initialOffset = useRef({ x: 0, y: initialIndex * ITEM_HEIGHT }).current;
  const settledIndex = useRef(initialIndex);

  useEffect(() => {
    const idx = items.findIndex((i: ScrollPickerItem) => i.value === selectedValue);
    if (idx >= 0 && idx !== settledIndex.current) {
      settledIndex.current = idx;
      setSelectedIndex(idx);
      scrollViewRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
    }
  }, [selectedValue, items]);

  const paddedItems = [{ label: '', value: 'pad1' }, ...items, { label: '', value: 'pad2' }];
  const getIndex = (y: number) => Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_HEIGHT)));
  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = getIndex(y);
    if (items[index]) {
      settledIndex.current = index;
      setSelectedIndex(index);
      scrollViewRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
      onValueChange(items[index].value);
    }
  };

  return (
    <View style={{ height: ITEM_HEIGHT * 3, width, overflow: 'hidden', alignItems: 'center' }}>
      <ScrollView
        ref={scrollViewRef}
        style={{ width: '100%' }}
        contentOffset={initialOffset}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        bounces={false}
        contentInsetAdjustmentBehavior="never"
        nestedScrollEnabled={true}
        onScroll={e => setSelectedIndex(getIndex(e.nativeEvent.contentOffset.y))}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{ paddingBottom: 0 }}
      >
        {paddedItems.map((item, index) => {
          const isSelected = index === selectedIndex + 1;
          return (
            <View key={index} style={{ height: ITEM_HEIGHT, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
              <Text numberOfLines={1} style={{ width: '100%', textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false, lineHeight: ITEM_HEIGHT, fontVariant: ['tabular-nums'], fontSize: isSelected ? 24 : 16, color: isSelected ? (textColor || COLORS.textPrimary) : 'rgba(148, 163, 184, 0.4)', fontWeight: isSelected ? '800' : '500' }}>{item.label}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ position: 'absolute', top: ITEM_HEIGHT, height: ITEM_HEIGHT, width: '100%', borderTopWidth: 2, borderBottomWidth: 2, borderColor: lineColor || 'rgba(139, 92, 246, 0.3)', zIndex: -1, pointerEvents: 'none', borderRadius: 8 }} />
    </View>
  );
};
