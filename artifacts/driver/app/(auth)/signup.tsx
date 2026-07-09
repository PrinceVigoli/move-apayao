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
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

// Mirrors the defaults in artifacts/api-server/src/lib/vehicle-capacity.ts —
// shown here so drivers know how many passengers their vehicle type can
// carry (the actual capacity is set server-side at registration).
const VEHICLE_TYPES: { value: string; label: string; capacity: number }[] = [
  { value: 'e-trike', label: 'e-trike', capacity: 4 },
  { value: 'tricycle', label: 'tricycle', capacity: 4 },
  { value: 'jeepney', label: 'jeepney', capacity: 12 },
  { value: 'van', label: 'van', capacity: 15 },
];

export default function DriverSignupScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { signUpWithPassword } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('e-trike');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    if (!plateNumber.trim() || !licenseNumber.trim()) {
      setError('Plate number and license number are required for drivers.');
      return;
    }
    setLoading(true);
    try {
      await signUpWithPassword(email.trim(), password, {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        vehicleType,
        plateNumber: plateNumber.trim(),
        vehicleColor: vehicleColor.trim() || undefined,
        licenseNumber: licenseNumber.trim(),
      });
      setInfo('Check your email to confirm your account, then log in.');
    } catch (err: any) {
      setError(err?.message ?? 'Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (
    label: string,
    value: string,
    setter: (v: string) => void,
    opts?: { placeholder?: string; keyboardType?: any; secure?: boolean; autoCap?: any; autoComplete?: any },
  ) => (
    <>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setter}
        placeholder={opts?.placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={opts?.keyboardType}
        secureTextEntry={opts?.secure}
        autoCapitalize={opts?.autoCap ?? 'sentences'}
        autoComplete={opts?.autoComplete}
        style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
      />
    </>
  );

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
        <Text style={[styles.title, { color: colors.foreground }]}>Become a driver</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Register your vehicle to start earning
        </Text>

        {field('Full name', fullName, setFullName, { placeholder: 'Juan Dela Cruz', autoComplete: 'name' })}
        {field('Email', email, setEmail, {
          placeholder: 'you@example.com',
          keyboardType: 'email-address',
          autoCap: 'none',
          autoComplete: 'email',
        })}
        {field('Password', password, setPassword, { placeholder: 'At least 8 characters', secure: true })}
        {field('Phone', phone, setPhone, { placeholder: '09xx xxx xxxx', keyboardType: 'phone-pad' })}

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Vehicle type</Text>
        <View style={styles.chips}>
          {VEHICLE_TYPES.map((t) => {
            const active = vehicleType === t.value;
            return (
              <Text
                key={t.value}
                onPress={() => setVehicleType(t.value)}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary + '18' : 'transparent',
                    color: active ? colors.primary : colors.mutedForeground,
                  },
                ]}
              >
                {t.label} · up to {t.capacity}
              </Text>
            );
          })}
        </View>

        {field('Plate number', plateNumber, setPlateNumber, { placeholder: 'ABC 1234', autoCap: 'characters' })}
        {field('Vehicle color', vehicleColor, setVehicleColor, { placeholder: 'Red' })}
        {field('License number', licenseNumber, setLicenseNumber, { placeholder: 'N01-23-456789', autoCap: 'characters' })}

        {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
        {info && <Text style={[styles.info, { color: colors.primary }]}>{info}</Text>}

        <Button title="Create Driver Account" size="lg" loading={loading} onPress={handleSignup} style={{ marginTop: 20 }} />

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
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 6, marginBottom: 12 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6, marginTop: 12 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  error: { marginTop: 14, fontFamily: 'Inter_500Medium', fontSize: 13 },
  info: { marginTop: 14, fontFamily: 'Inter_500Medium', fontSize: 13 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
});
