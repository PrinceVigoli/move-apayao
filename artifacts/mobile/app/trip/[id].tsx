import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  TextInput,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { RouteMap } from '@/components/RouteMap';
import { Feather } from '@expo/vector-icons';
import {
  useGetTrip,
  useCancelTrip,
  useRateTrip,
  getGetTripQueryKey,
  getListTripsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

function openInMaps(lat: number, lon: number, label: string) {
  const encodedLabel = encodeURIComponent(label);
  const url = Platform.select({
    ios: `maps://?q=${encodedLabel}&ll=${lat},${lon}`,
    android: `geo:${lat},${lon}?q=${lat},${lon}(${encodedLabel})`,
    default: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
  });
  Linking.openURL(url as string).catch(() =>
    Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
    ),
  );
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();

  const [rateVisible, setRateVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const { data, isLoading } = useGetTrip(tripId, {
    query: {
      queryKey: getGetTripQueryKey(tripId),
      enabled: !!tripId,
      // While the trip is still being matched (or awaiting driver accept),
      // poll so the background sweeper's rematch/expiry shows up without a
      // manual refresh. Stops polling once the trip reaches a settled state.
      refetchInterval: (query) => {
        const s = query.state.data?.trip?.status;
        return s === 'requested' || s === 'matched' ? 5000 : false;
      },
    },
  });
  const cancelTrip = useCancelTrip();
  const rateTrip = useRateTrip();

  const trip = data?.trip;

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
              },
            },
          );
        },
      },
    ]);
  };

  const submitRating = () => {
    if (rating < 1) {
      Alert.alert('Select a rating', 'Please tap a star from 1 to 5.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    rateTrip.mutate(
      { id: tripId, data: { rating, comment: comment.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
          setRateVisible(false);
          setRating(0);
          setComment('');
          Alert.alert('Thank you!', 'Your rating has been submitted.');
        },
        onError: (err: any) => {
          const msg =
            err?.response?.data?.error ??
            err?.message ??
            'Could not submit your rating. Please try again.';
          Alert.alert('Rating failed', String(msg));
        },
      },
    );
  };

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

  const MAP_W = 600;
  const MAP_H = 400;

  const canTrack =
    !!trip?.driverId && (trip?.status === 'matched' || trip?.status === 'in_progress');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.modalHeader}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        {isLoading || !trip ? (
          <View style={{ gap: 20, marginTop: 20 }}>
            <Skeleton style={{ height: 120, width: '100%' }} />
            <Skeleton style={{ height: 200, width: '100%' }} />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.foreground }]}>Trip Details</Text>
              <Badge label={trip.status} variant={getStatusVariant(trip.status)} />
            </View>

            {/* Searching / no-driver states */}
            {trip.status === 'requested' && (
              <Card style={[styles.stateCard, { borderColor: colors.primary }]}>
                <ActivityIndicator color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stateTitle, { color: colors.foreground }]}>
                    Looking for a driver…
                  </Text>
                  <Text style={[styles.stateSub, { color: colors.mutedForeground }]}>
                    We keep searching for up to 5 minutes as drivers come online nearby.
                  </Text>
                </View>
              </Card>
            )}
            {trip.status === 'cancelled' && trip.cancelReason === 'no_driver_available' && (
              <Card style={[styles.stateCard, { borderColor: colors.destructive }]}>
                <Feather name="alert-circle" size={22} color={colors.destructive} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stateTitle, { color: colors.foreground }]}>
                    No driver available
                  </Text>
                  <Text style={[styles.stateSub, { color: colors.mutedForeground }]}>
                    We couldn't find an available e-trike nearby. Please try booking again in a
                    little while.
                  </Text>
                </View>
              </Card>
            )}

            {/* Embedded interactive route map */}
            <Pressable
              onPress={() => {
                if (canTrack) {
                  router.push(`/trip/${tripId}/track`);
                } else {
                  openInMaps(trip.dropoffLat, trip.dropoffLon, trip.dropoffAddress || 'Dropoff');
                }
              }}
            >
              <Card style={styles.mapCard}>
                <RouteMap
                  pickup={{ latitude: trip.pickupLat, longitude: trip.pickupLon }}
                  dropoff={{ latitude: trip.dropoffLat, longitude: trip.dropoffLon }}
                  interactive={false}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.mapHint, { backgroundColor: colors.card }]} pointerEvents="none">
                  <Feather
                    name={canTrack ? 'navigation' : 'external-link'}
                    size={13}
                    color={colors.primary}
                  />
                  <Text style={[styles.mapHintText, { color: colors.primary }]}>
                    {canTrack ? 'Track Driver' : 'Open in Maps'}
                  </Text>
                </View>
              </Card>
            </Pressable>

            <Card style={styles.detailsCard}>
              <View style={styles.locationRow}>
                <Feather name="navigation" size={20} color={colors.primary} style={styles.icon} />
                <View style={styles.locationText}>
                  <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>Pickup</Text>
                  <Text style={[styles.locationValue, { color: colors.foreground }]}>
                    {trip.pickupAddress || 'Current Location'}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.locationRow}>
                <Feather name="map-pin" size={20} color={colors.secondaryForeground} style={styles.icon} />
                <View style={styles.locationText}>
                  <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>Dropoff</Text>
                  <Text style={[styles.locationValue, { color: colors.foreground }]}>
                    {trip.dropoffAddress || 'Destination'}
                  </Text>
                </View>
              </View>
            </Card>

            <Card style={styles.fareCard}>
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>Estimated Fare</Text>
                <Text style={[styles.fareValue, { color: colors.foreground }]}>
                  {trip.fareAmount != null ? `₱${trip.fareAmount.toFixed(2)}` : '--'}
                </Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>Distance</Text>
                <Text style={[styles.fareValue, { color: colors.foreground }]}>
                  {trip.distanceKm != null ? `${trip.distanceKm.toFixed(1)} km` : '--'}
                </Text>
              </View>
            </Card>

            {canTrack && (
              <Button
                title="Track Driver Live"
                variant="default"
                onPress={() => router.push(`/trip/${tripId}/track`)}
                icon={<Feather name="navigation" size={18} color={colors.primaryForeground} />}
                style={{ marginTop: 24 }}
              />
            )}

            {trip.status === 'requested' || trip.status === 'matched' ? (
              <Button
                title="Cancel Trip"
                variant="destructive"
                onPress={handleCancel}
                loading={cancelTrip.isPending}
                style={{ marginTop: 12 }}
              />
            ) : null}

            {trip.status === 'completed' && (
              <Button
                title="Rate Trip"
                variant="default"
                onPress={() => setRateVisible(true)}
                style={{ marginTop: 24 }}
              />
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={rateVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRateVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRateVisible(false)}>
          <Pressable
            style={[
              styles.ratingSheet,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 },
            ]}
            onPress={() => {}}
          >
            <View
              style={[
                styles.handle,
                { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
              ]}
            />
            <Text style={[styles.ratingTitle, { color: colors.foreground }]}>Rate your trip</Text>
            <Text style={[styles.ratingSub, { color: colors.mutedForeground }]}>How was your ride?</Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRating(star);
                  }}
                  hitSlop={8}
                  style={{ marginHorizontal: 4 }}
                >
                  <Feather
                    name="star"
                    size={40}
                    color={star <= rating ? colors.primary : colors.border}
                  />
                </Pressable>
              ))}
            </View>

            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add a comment (optional)"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[
                styles.commentInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />

            <Button
              title="Submit Rating"
              variant="default"
              onPress={submitRating}
              loading={rateTrip.isPending}
              style={{ marginTop: 16 }}
            />
            <Button
              title="Not now"
              variant="ghost"
              onPress={() => setRateVisible(false)}
              style={{ marginTop: 8 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalHeader: { alignItems: 'center', paddingVertical: 12 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  mapCard: { height: 200, padding: 0, overflow: 'hidden', marginBottom: 20 },
  stateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  stateTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  stateSub: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  mapHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    opacity: 0.95,
  },
  mapHintText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  detailsCard: { padding: 16, marginBottom: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 16 },
  locationText: { flex: 1 },
  locationLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 2 },
  locationValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 16, marginLeft: 36 },
  fareCard: { padding: 16, gap: 12 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  fareValue: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  ratingSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  ratingTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  ratingSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 20 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  commentInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
});