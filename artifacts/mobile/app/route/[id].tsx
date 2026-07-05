import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import {
  useGetLoopRoute,
  useGetLoopVehicles,
  getGetLoopRouteQueryKey,
  getGetLoopVehiclesQueryKey,
} from '@workspace/api-client-react';

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams();
  const routeId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const { data: routeData, isLoading: isLoadingRoute } = useGetLoopRoute(routeId, {
    query: { queryKey: getGetLoopRouteQueryKey(routeId), enabled: !!routeId },
  });
  const { data: vehiclesData, isLoading: isLoadingVehicles } = useGetLoopVehicles(routeId, undefined, {
    query: { queryKey: getGetLoopVehiclesQueryKey(routeId), enabled: !!routeId },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.modalHeader}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        {isLoadingRoute ? (
          <Skeleton style={{ height: 100, width: '100%', marginBottom: 20 }} />
        ) : (
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>{routeData?.route?.name}</Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {routeData?.route?.description}
            </Text>
            <View style={styles.badgeRow}>
              <Badge label={`₱${routeData?.route?.baseFare} Base`} variant="secondary" />
              <Badge label={routeData?.route?.isActive ? 'Active' : 'Offline'} variant={routeData?.route?.isActive ? 'success' : 'outline'} />
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Stops & Timetable</Text>
        
        <Card style={styles.timelineCard}>
          {isLoadingRoute ? (
            <View style={{ gap: 20 }}>
              <Skeleton style={{ height: 40, width: '80%' }} />
              <Skeleton style={{ height: 40, width: '60%' }} />
            </View>
          ) : routeData?.stops?.length ? (
            <View style={styles.timeline}>
              {routeData.stops.sort((a, b) => a.sequence - b.sequence).map((stop, index) => (
                <View key={stop.id} style={styles.stopRow}>
                  <View style={styles.timelineVisual}>
                    <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                    {index < routeData.stops.length - 1 && (
                      <View style={[styles.line, { backgroundColor: colors.border }]} />
                    )}
                  </View>
                  <View style={styles.stopInfo}>
                    <Text style={[styles.stopName, { color: colors.foreground }]}>{stop.name}</Text>
                    {stop.etaMinutes !== undefined && stop.etaMinutes !== null && (
                      <Text style={[styles.stopEta, { color: colors.mutedForeground }]}>
                        ETA: {stop.etaMinutes} min
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.mutedForeground }}>No stops configured for this route.</Text>
          )}
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>Live Vehicles</Text>

        {isLoadingVehicles ? (
          <Card><Skeleton style={{ height: 60, width: '100%' }} /></Card>
        ) : vehiclesData?.vehicles?.length ? (
          <View style={{ gap: 12 }}>
            {vehiclesData.vehicles.map((v) => (
              <Card key={v.id} style={styles.vehicleCard}>
                <Feather name="truck" size={24} color={colors.primary} />
                <View style={styles.vehicleInfo}>
                  <Text style={[styles.vehicleName, { color: colors.foreground }]}>E-Trike #{v.id}</Text>
                  <Text style={[styles.vehicleStatus, { color: colors.mutedForeground }]}>
                    {v.status === 'in_transit' ? 'Moving' : 'Idle'} 
                    {v.etaFromUserMinutes ? ` • ${v.etaFromUserMinutes} min away` : ''}
                  </Text>
                </View>
                <Badge label="Live" variant="success" />
              </Card>
            ))}
          </View>
        ) : (
          <Card style={{ alignItems: 'center', padding: 24 }}>
            <Feather name="moon" size={32} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
            <Text style={{ color: colors.mutedForeground }}>No vehicles currently active on this route.</Text>
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
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 16,
  },
  timelineCard: {
    padding: 20,
  },
  timeline: {
    // container
  },
  stopRow: {
    flexDirection: 'row',
  },
  timelineVisual: {
    alignItems: 'center',
    marginRight: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 1,
  },
  line: {
    width: 2,
    height: 40,
    marginVertical: -2,
    zIndex: 0,
  },
  stopInfo: {
    flex: 1,
    paddingBottom: 24,
  },
  stopName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 2,
  },
  stopEta: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  vehicleInfo: {
    flex: 1,
    marginLeft: 16,
  },
  vehicleName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  vehicleStatus: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
