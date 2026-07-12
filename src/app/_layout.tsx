import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  useEffect(() => {
    initI18n()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <View style={styles.frame}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'fade',
            }}
          >
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="log-glucose" options={{ presentation: 'modal' }} />
          <Stack.Screen name="log-insulin" options={{ presentation: 'modal' }} />
          <Stack.Screen name="calendar" options={{ presentation: 'modal' }} />
          <Stack.Screen name="bolus" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="activity-status"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="add-menu"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
            <Stack.Screen name="nutrition" />
            <Stack.Screen name="glucose" />
            <Stack.Screen name="insulin" />
            <Stack.Screen name="timeline" />
            <Stack.Screen name="foods" options={{ presentation: 'modal' }} />
            <Stack.Screen name="report" options={{ presentation: 'modal' }} />
            <Stack.Screen name="rappels" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="ai-journal"
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen name="ai-chat" options={{ presentation: 'modal' }} />
            <Stack.Screen name="ai-log" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="consent-detail"
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="ai-call"
              options={{ presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="insight-detail"
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="barcode"
              options={{ presentation: 'fullScreenModal' }}
            />
            <Stack.Screen name="menu-scan" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="integrations"
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="emergency"
              options={{ presentation: 'fullScreenModal' }}
            />
            <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
            <Stack.Screen name="subscription" options={{ presentation: 'modal' }} />
          </Stack>
        </View>
      </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // The web root (#root, styled in +html.tsx) is a fixed 390px column
  // scaled to the device, so here the frame just fills it.
  frame: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
});
