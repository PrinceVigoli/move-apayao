import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

type Role = 'passenger' | 'driver';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { signUpWithPassword, signInWithGoogle } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('passenger');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignup = async () => {
    setError(null);
    setInfo(null);
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Fill in your name, email, and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUpWithPassword(email.trim(), password, { fullName: fullName.trim(), role });
      setInfo('Check your email to confirm your account, then log in.');
    } catch (err: any) {
      setError(err?.message ?? 'Could not create your account. Please try again.');
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
        <Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Join MOVE Apayao in seconds
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

        <View style={styles.roleRow}>
          {(['passenger', 'driver'] as Role[]).map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRole(r)}
              style={[
                styles.roleOption,
                {
                  borderColor: role === r ? colors.primary : colors.border,
                  backgroundColor: role === r ? colors.secondary : colors.card,
                },
              ]}
            >
              <Text
                style={{
                  color: role === r ? colors.primary : colors.mutedForeground,
                  fontFamily: 'Inter_600SemiBold',
                  textTransform: 'capitalize',
                }}
              >
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Full name</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Juan Dela Cruz"
          placeholderTextColor={colors.mutedForeground}
          autoComplete="name"
          style={[
            styles.input,
            { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card },
          ]}
        />

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
          placeholder="At least 8 characters"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          autoComplete="password-new"
          style={[
            styles.input,
            { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card },
          ]}
        />

        {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
        {info && <Text style={[styles.info, { color: colors.primary }]}>{info}</Text>}

        <Button
          title="Create Account"
          size="lg"
          loading={loading}
          onPress={handleSignup}
          style={{ marginTop: 16 }}
        />

        <View style={styles.footerRow}>
          <Text style={{ color: colors.mutedForeground }}>Already have an account? </Text>
          <Text
            style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}
            onPress={() => router.push('/(auth)/login')}
          >
            Log in
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
  roleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  roleOption: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  info: {
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
