import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl } from '@workspace/api-client-react';
import { API_BASE_URL } from '@/lib/api-config';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';

// Initialize API Base URL.
// - Local dev outside Replit: set EXPO_PUBLIC_API_URL (see LOCAL_SETUP.md §8),
//   e.g. EXPO_PUBLIC_API_URL=http://192.168.1.23:5000
// - Running on Replit: falls back to the Replit tunnel domain automatically.
setBaseUrl(API_BASE_URL);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/**
 * Redirects between the (auth) group and the rest of the app based on
 * whether there's a live Supabase session. Runs on every navigation.
 */
function useAuthGuard() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);
}

function RootLayoutNav() {
  const { isLoading } = useAuth();
  const colors = useColors();
  useAuthGuard();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="report" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="history" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="trip/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="trip/[id]/track" options={{ headerShown: false }} />
      <Stack.Screen name="route/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}