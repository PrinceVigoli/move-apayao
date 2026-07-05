import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Platform, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useListTrips, useCreateTrip, getListTripsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  const { data: tripsData, isLoading, isRefetching, refetch } = useListTrips({ limit: 20 });
  const createTrip = useCreateTrip();

  const handleBook = () => {
    if (!pickup.trim() || !dropoff.trim()) {
      Alert.alert('Missing details', 'Please enter both pickup and dropoff locations.');
      return;
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    createTrip.mutate({ data: {
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      pickupLat: 18.312,
      pickupLon: 121.321,
      dropoffLat: 18.320,
      dropoffLon: 121.330
    } }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
        setPickup('');
        setDropoff('');
        router.push(`/trip/${res.trip.id}`);
      },
      onError: (err) => {
        Alert.alert('Booking Failed', 'Unable to book a ride right now.');
      }
    });
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
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 100),
          paddingHorizontal: 16,
        }}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Book a Ride</Text>
        
        <Card style={styles.bookingCard}>
          <View style={styles.inputWrapper}>
            <View style={styles.dotLine}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <View style={[styles.square, { backgroundColor: colors.secondaryForeground }]} />
            </View>
            <View style={styles.inputs}>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="Current Location"
                placeholderTextColor={colors.mutedForeground}
                value={pickup}
                onChangeText={setPickup}
              />
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginTop: 12 }]}
                placeholder="Where to?"
                placeholderTextColor={colors.mutedForeground}
                value={dropoff}
                onChangeText={setDropoff}
              />
            </View>
          </View>
          <Button
            title="Request E-Trike"
            onPress={handleBook}
            loading={createTrip.isPending}
            style={{ marginTop: 16 }}
          />
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trip History</Text>
        
        {isLoading ? (
          <View style={{ gap: 12 }}>
            <Card><Skeleton style={{ height: 80, width: '100%' }} /></Card>
            <Card><Skeleton style={{ height: 80, width: '100%' }} /></Card>
          </View>
        ) : tripsData?.trips?.length ? (
          <View style={{ gap: 12 }}>
            {tripsData.trips.map((trip) => (
              <Card key={trip.id}>
                <View style={styles.tripRow}>
                  <View style={styles.tripDetails}>
                    <Text style={[styles.tripAddress, { color: colors.foreground }]} numberOfLines={1}>
                      {trip.dropoffAddress || 'Unknown dropoff'}
                    </Text>
                    <Text style={[styles.tripDate, { color: colors.mutedForeground }]}>
                      {new Date(trip.createdAt).toLocaleString()} • {trip.fareAmount ? `₱${trip.fareAmount.toFixed(2)}` : 'Est. ₱40'}
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
            <Text style={[styles.emptyStateSub, { color: colors.mutedForeground }]}>Your trip history will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  bookingCard: {
    padding: 16,
    marginBottom: 32,
  },
  inputWrapper: {
    flexDirection: 'row',
  },
  dotLine: {
    alignItems: 'center',
    marginRight: 12,
    marginTop: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 4,
    minHeight: 24,
  },
  square: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  inputs: {
    flex: 1,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 16,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripDetails: {
    flex: 1,
    marginRight: 16,
  },
  tripAddress: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  tripDate: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
  },
  emptyStateSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
