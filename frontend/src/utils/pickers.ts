import type { ScrollPickerItem } from '../types';

export const generateArray = (start: number, end: number, step: number = 1): ScrollPickerItem[] => { const arr: ScrollPickerItem[] = []; for (let i = start; i <= end; i += step) arr.push({ label: i.toString(), value: i }); return arr; };
export const generateDecimals = (): ScrollPickerItem[] => { const arr: ScrollPickerItem[] = []; for (let i = 0; i <= 95; i += 5) { let str = i < 10 ? `0${i}` : `${i}`; arr.push({ label: `.${str}`, value: str }); } return arr; };

export const ageData = generateArray(10, 100);
export const heightWholeData = generateArray(100, 250);
export const weightWholeData = generateArray(30, 200);
export const decimalsData = generateDecimals();
