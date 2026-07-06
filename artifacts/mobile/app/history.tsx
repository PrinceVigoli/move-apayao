import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import { useListTrips } from '@workspace/api-client-react';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const { data, isLoading, isRefetching, refetch } = useListTrips(
    { limit: 30 },
    { query: { queryKey: ['list-trips', 30] } },
  );

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'warning';
      case 'cancelled':
        return 'destructive';
      case 'matched':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Trip History</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      >
        {isLoading ? (
          <View style={{ gap: 12 }}>
            <Card><Skeleton style={{ height: 80, width: '100%' }} /></Card>
            <Card><Skeleton style={{ height: 80, width: '100%' }} /></Card>
            <Card><Skeleton style={{ height: 80, width: '100%' }} /></Card>
          </View>
        ) : data?.trips?.length ? (
          <View style={{ gap: 12 }}>
            {data.trips.map((trip) => (
              <Card key={trip.id}>
                <View style={styles.tripRow}>
                  <View style={styles.tripDetails}>
                    <Text style={[styles.tripAddress, { color: colors.foreground }]} numberOfLines={1}>
                      {trip.dropoffAddress || 'Unknown dropoff'}
                    </Text>
                    <Text style={[styles.tripDate, { color: colors.mutedForeground }]}>
                      {new Date(trip.createdAt).toLocaleString()} •{' '}
                      {trip.fareAmount != null ? `₱${trip.fareAmount.toFixed(2)}` : 'Est. ₱40'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Badge label={trip.status} variant={getStatusVariant(trip.status)} />
                    <Button
                      title="View"
                      variant="ghost"
                      size="sm"
                      onPress={() => router.push(`/trip/${trip.id}`)}
                    />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="map" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyStateText, { color: colors.foreground }]}>No trips booked yet</Text>
            <Text style={[styles.emptyStateSub, { color: colors.mutedForeground }]}>
              Your trip history will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 24 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  tripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripDetails: { flex: 1, marginRight: 16 },
  tripAddress: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  tripDate: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyStateText: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  emptyStateSub: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});