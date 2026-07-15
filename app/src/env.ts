import { Platform } from 'react-native';

// Baked in at bundle time: EXPO_PUBLIC_USE_EMULATORS=1 npx expo start [--web]
export const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === '1';

// The Android emulator reaches the host machine at 10.0.2.2.
export const EMULATOR_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
