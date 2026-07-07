import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import { useGetProfile } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverStatus } from '@/contexts/DriverStatusContext';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { signOut } = useAuth();
  const { isOnline } = useDriverStatus();

  const { data, isLoading } = useGetProfile({ query: { queryKey: ['profile'] } });
  const user = data?.user;
  const dp = data?.driverProfile;

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const Row = ({ icon, label, value }: { icon: any; label: string; value: string }) => (
    <View style={styles.row}>
      <Feather name={icon} size={18} color={colors.mutedForeground} style={{ width: 26 }} />
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
      >
        <View style={styles.headerRow}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {(user?.fullName || user?.email || 'D').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            {isLoading ? (
              <Skeleton style={{ height: 24, width: 160 }} />
            ) : (
              <Text style={[styles.name, { color: colors.foreground }]}>
                {user?.fullName || 'Driver'}
              </Text>
            )}
            <View style={styles.statusLine}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10b981' : colors.mutedForeground }]} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {/* Rating + trips */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Feather name="star" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {dp?.rating != null ? dp.rating.toFixed(1) : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rating</Text>
          </Card>
          <Card style={styles.statCard}>
            <Feather name="check-circle" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {dp?.totalTrips ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Trips</Text>
          </Card>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Account</Text>
        <Card style={styles.infoCard}>
          <Row icon="mail" label="Email" value={user?.email || '—'} />
          <Row icon="phone" label="Phone" value={user?.phone || '—'} />
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Vehicle</Text>
        <Card style={styles.infoCard}>
          <Row icon="truck" label="Type" value={dp?.vehicleType || '—'} />
          <Row icon="hash" label="Plate" value={dp?.plateNumber || '—'} />
          <Row icon="droplet" label="Color" value={dp?.vehicleColor || '—'} />
          <Row icon="credit-card" label="License" value={dp?.licenseNumber || '—'} />
        </Card>

        <Button
          title="Sign Out"
          variant="destructive"
          onPress={confirmSignOut}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#fff' },
  name: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, padding: 16, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 12, marginTop: 4 },
  infoCard: { padding: 8, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8 },
  rowLabel: { fontSize: 14, fontFamily: 'Inter_400Regular', width: 70 },
  rowValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'right' },
});
