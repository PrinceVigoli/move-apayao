import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import { useGetEarnings } from '@workspace/api-client-react';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const startDate = useMemo(() => isoDaysAgo(29), []);
  const endDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data, isLoading, isRefetching, refetch } = useGetEarnings(
    { startDate, endDate },
    { query: { queryKey: ['driver-earnings', startDate, endDate] } },
  );

  const rows = data?.earnings ?? [];
  const totalEarnings = rows.reduce((s, r) => s + r.totalEarnings, 0);
  const totalTrips = rows.reduce((s, r) => s + r.tripCount, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = rows.find((r) => r.date.slice(0, 10) === today);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Earnings</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Last 30 days</Text>

        {/* Summary tiles */}
        <View style={styles.tiles}>
          <Card style={styles.tile}>
            <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>Today</Text>
            {isLoading ? (
              <Skeleton style={{ height: 28, width: 80, marginTop: 4 }} />
            ) : (
              <Text style={[styles.tileValue, { color: colors.foreground }]}>
                ₱{(todayRow?.totalEarnings ?? 0).toFixed(2)}
              </Text>
            )}
            <Text style={[styles.tileSub, { color: colors.mutedForeground }]}>
              {todayRow?.tripCount ?? 0} trips
            </Text>
          </Card>

          <Card style={styles.tile}>
            <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>30-day total</Text>
            {isLoading ? (
              <Skeleton style={{ height: 28, width: 80, marginTop: 4 }} />
            ) : (
              <Text style={[styles.tileValue, { color: colors.foreground }]}>
                ₱{totalEarnings.toFixed(2)}
              </Text>
            )}
            <Text style={[styles.tileSub, { color: colors.mutedForeground }]}>
              {totalTrips} trips
            </Text>
          </Card>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daily breakdown</Text>

        {isLoading ? (
          <View style={{ gap: 12 }}>
            <Card><Skeleton style={{ height: 60, width: '100%' }} /></Card>
            <Card><Skeleton style={{ height: 60, width: '100%' }} /></Card>
          </View>
        ) : rows.length ? (
          <View style={{ gap: 10 }}>
            {[...rows].reverse().map((r) => (
              <Card key={r.date} style={styles.dayRow}>
                <View>
                  <Text style={[styles.dayDate, { color: colors.foreground }]}>
                    {new Date(r.date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <Text style={[styles.dayTrips, { color: colors.mutedForeground }]}>
                    {r.tripCount} trip{r.tripCount === 1 ? '' : 's'} • avg ₱{r.avgFare.toFixed(0)}
                  </Text>
                </View>
                <Text style={[styles.dayAmount, { color: colors.primary }]}>
                  ₱{r.totalEarnings.toFixed(2)}
                </Text>
              </Card>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Feather name="dollar-sign" size={44} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.foreground }]}>No earnings yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Completed trips will show up here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 20 },
  tiles: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  tile: { flex: 1, padding: 16 },
  tileLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  tileValue: { fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 4 },
  tileSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 14 },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  dayDate: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dayTrips: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  dayAmount: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
