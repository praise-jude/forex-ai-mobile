import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { SettingsProvider } from '@/lib/api/SettingsContext';
import { PushProvider } from '@/lib/push/PushContext';
import '@/lib/push/notificationHandler';
import { VoiceSettingsProvider } from '@/lib/voice/VoiceSettingsContext';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SettingsProvider>
        <PushProvider>
          <VoiceSettingsProvider>
            <AnimatedSplashOverlay />
            <AppTabs />
          </VoiceSettingsProvider>
        </PushProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
