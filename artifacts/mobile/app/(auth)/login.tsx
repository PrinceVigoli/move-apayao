import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { signInWithPassword } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your email or phone number, and your password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithPassword(identifier.trim(), password);
      // Root layout's auth guard will redirect to (tabs) automatically.
    } catch (err: any) {
      setError(err?.message ?? 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Sign in to book rides across Apayao
        </Text>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Email or phone</Text>
        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="you@example.com or 09xx xxx xxxx"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoComplete="username"
          style={[
            styles.input,
            { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card },
          ]}
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          autoComplete="password"
          style={[
            styles.input,
            { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card },
          ]}
        />

        {error && (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        )}

        <Button
          title="Log In"
          size="lg"
          loading={loading}
          onPress={handleLogin}
          style={{ marginTop: 16 }}
        />

        <View style={styles.footerRow}>
          <Text style={{ color: colors.mutedForeground }}>Don't have an account? </Text>
          <Text
            style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}
            onPress={() => router.push('/(auth)/signup')}
          >
            Sign up
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
    fontFamily: 'Inter_400Regular',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  error: {
    marginTop: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
});
