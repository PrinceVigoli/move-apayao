import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import { useGetTrip, useCancelTrip, getGetTripQueryKey, getListTripsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetTrip(tripId, {
    query: { queryKey: getGetTripQueryKey(tripId), enabled: !!tripId },
  });
  const cancelTrip = useCancelTrip();

  const handleCancel = () => {
    Alert.alert('Cancel Trip', 'Are you sure you want to cancel this trip?', [
      { text: 'No', style: 'cancel' },
      { 
        text: 'Yes, Cancel', 
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          cancelTrip.mutate(
            { id: tripId, data: { reason: 'User requested' } },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
                queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
                router.back();
              }
            }
          );
        }
      }
    ]);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      case 'cancelled': return 'destructive';
      case 'matched': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Modal Handle */}
      <View style={styles.modalHeader}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        {isLoading || !data?.trip ? (
          <View style={{ gap: 20, marginTop: 20 }}>
            <Skeleton style={{ height: 120, width: '100%' }} />
            <Skeleton style={{ height: 200, width: '100%' }} />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.foreground }]}>Trip Details</Text>
              <Badge label={data.trip.status} variant={getStatusVariant(data.trip.status)} />
            </View>

            <Card style={styles.mapPlaceholder}>
              <Feather name="map" size={48} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>Live tracking map</Text>
            </Card>

            <Card style={styles.detailsCard}>
              <View style={styles.locationRow}>
                <Feather name="navigation" size={20} color={colors.primary} style={styles.icon} />
                <View style={styles.locationText}>
                  <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>Pickup</Text>
                  <Text style={[styles.locationValue, { color: colors.foreground }]}>{data.trip.pickupAddress || 'Current Location'}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.locationRow}>
                <Feather name="map-pin" size={20} color={colors.secondaryForeground} style={styles.icon} />
                <View style={styles.locationText}>
                  <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>Dropoff</Text>
                  <Text style={[styles.locationValue, { color: colors.foreground }]}>{data.trip.dropoffAddress || 'Destination'}</Text>
                </View>
              </View>
            </Card>

            <Card style={styles.fareCard}>
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>Estimated Fare</Text>
                <Text style={[styles.fareValue, { color: colors.foreground }]}>
                  {data.trip.fareAmount ? `₱${data.trip.fareAmount.toFixed(2)}` : '₱40.00'}
                </Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>Distance</Text>
                <Text style={[styles.fareValue, { color: colors.foreground }]}>
                  {data.trip.distanceKm ? `${data.trip.distanceKm.toFixed(1)} km` : '--'}
                </Text>
              </View>
            </Card>

            {data.trip.status === 'requested' || data.trip.status === 'matched' ? (
              <Button 
                title="Cancel Trip" 
                variant="destructive" 
                onPress={handleCancel}
                loading={cancelTrip.isPending}
                style={{ marginTop: 24 }}
              />
            ) : null}

            {data.trip.status === 'completed' && (
              <Button 
                title="Rate Trip" 
                variant="default" 
                onPress={() => Alert.alert('Coming Soon', 'Rating feature is not available yet.')}
                style={{ marginTop: 24 }}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modalHeader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  mapPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: '#f1f5f9',
  },
  detailsCard: {
    padding: 16,
    marginBottom: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 16,
  },
  locationText: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
    marginLeft: 36,
  },
  fareCard: {
    padding: 16,
    gap: 12,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  fareValue: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
});
