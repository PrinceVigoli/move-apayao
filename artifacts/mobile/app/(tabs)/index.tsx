import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useGetWeather,
  useGetNearbyDrivers,
  useGetProfile,
  useListTrips
} from '@workspace/api-client-react';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const mockLat = 18.3121; // Example Apayao coordinates
  const mockLon = 121.3214;

  const { data: profileData, isLoading: isLoadingProfile } = useGetProfile();
  const { data: weatherData, isLoading: isLoadingWeather } = useGetWeather({ lat: mockLat, lon: mockLon });
  const { data: nearbyData, isLoading: isLoadingNearby } = useGetNearbyDrivers({ lat: mockLat, lon: mockLon });
  const { data: tripsData, isLoading: isLoadingTrips } = useListTrips({ limit: 1 });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 100),
          paddingHorizontal: 16,
        }}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {isLoadingProfile ? 'Loading...' : `Magandang araw,`}
            </Text>
            <Text style={[styles.name, { color: colors.foreground }]}>
              {profileData?.user?.fullName || profileData?.user?.email?.split('@')[0] || 'Apayao Commuter'}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {profileData?.user?.fullName?.[0]?.toUpperCase() || 'A'}
            </Text>
          </View>
        </View>

        {/* Quick Book */}
        <Card style={styles.heroCard}>
          <Text style={[styles.heroTitle, { color: colors.cardForeground }]}>
            Where to?
          </Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Book a fast & reliable e-trike ride
          </Text>
          <Button
            title="Book a Ride"
            size="lg"
            onPress={() => router.push('/trips')}
            icon={<Feather name="navigation" size={20} color={colors.primaryForeground} />}
            style={{ marginTop: 16 }}
          />
        </Card>

        {/* Widgets Row */}
        <View style={styles.widgetsRow}>
          <Card style={styles.widgetCard}>
            {isLoadingNearby ? (
              <Skeleton style={{ height: 40, width: '100%' }} />
            ) : (
              <>
                <View style={styles.widgetHeader}>
                  <Feather name="zap" size={20} color={colors.accent} />
                  <Text style={[styles.widgetValue, { color: colors.foreground }]}>
                    {nearbyData?.drivers?.length || 0}
                  </Text>
                </View>
                <Text style={[styles.widgetLabel, { color: colors.mutedForeground }]}>
                  Nearby E-Trikes
                </Text>
              </>
            )}
          </Card>

          <Card style={styles.widgetCard}>
            {isLoadingWeather ? (
              <Skeleton style={{ height: 40, width: '100%' }} />
            ) : (
              <>
                <View style={styles.widgetHeader}>
                  <Feather name={weatherData?.weather?.icon === '01d' ? 'sun' : 'cloud'} size={20} color={colors.primary} />
                  <Text style={[styles.widgetValue, { color: colors.foreground }]}>
                    {weatherData?.weather?.temp ? `${Math.round(weatherData.weather.temp)}°C` : '28°C'}
                  </Text>
                </View>
                <Text style={[styles.widgetLabel, { color: colors.mutedForeground }]}>
                  Apayao Weather
                </Text>
              </>
            )}
          </Card>
        </View>

        {/* Recent Trip */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Trip</Text>
        {isLoadingTrips ? (
          <Card><Skeleton style={{ height: 80, width: '100%' }} /></Card>
        ) : tripsData?.trips?.length ? (
          <Card>
            <View style={styles.tripRow}>
              <View style={[styles.tripIcon, { backgroundColor: colors.muted }]}>
                <Feather name="map-pin" size={20} color={colors.primary} />
              </View>
              <View style={styles.tripDetails}>
                <Text style={[styles.tripAddress, { color: colors.foreground }]} numberOfLines={1}>
                  {tripsData.trips[0].dropoffAddress || 'Dropped off'}
                </Text>
                <Text style={[styles.tripDate, { color: colors.mutedForeground }]}>
                  {new Date(tripsData.trips[0].createdAt).toLocaleDateString()} • {tripsData.trips[0].status}
                </Text>
              </View>
              <Button
                title="View"
                variant="ghost"
                size="sm"
                onPress={() => router.push(`/trip/${tripsData.trips[0].id}`)}
              />
            </View>
          </Card>
        ) : (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Feather name="compass" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
              <Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>No trips yet.</Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  name: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
  },
  heroCard: {
    marginBottom: 16,
    padding: 24,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  widgetsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  widgetCard: {
    flex: 1,
    padding: 16,
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  widgetValue: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  widgetLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 12,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tripDetails: {
    flex: 1,
  },
  tripAddress: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  tripDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
