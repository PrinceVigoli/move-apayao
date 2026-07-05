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
  const { signInWithPassword, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithPassword(email.trim(), password);
      // Root layout's auth guard will redirect to (tabs) automatically.
    } catch (err: any) {
      setError(err?.message ?? 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
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

        <Button
          title="Continue with Google"
          variant="outline"
          size="lg"
          loading={googleLoading}
          onPress={handleGoogle}
          icon={<Feather name="chrome" size={18} color={colors.foreground} />}
          style={{ marginTop: 32 }}
        />

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
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
