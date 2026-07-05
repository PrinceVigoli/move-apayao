import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, RefreshControl, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useListLoopRoutes } from '@workspace/api-client-react';

export default function RoutesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const { data, isLoading, isRefetching, refetch } = useListLoopRoutes();

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
        <Text style={[styles.title, { color: colors.foreground }]}>Loop Routes</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Fixed routes for regular commuting around Apayao.
        </Text>

        {isLoading ? (
          <View style={{ gap: 16, marginTop: 24 }}>
            <Card><Skeleton style={{ height: 100, width: '100%' }} /></Card>
            <Card><Skeleton style={{ height: 100, width: '100%' }} /></Card>
          </View>
        ) : data?.routes?.length ? (
          <View style={{ gap: 16, marginTop: 24 }}>
            {data.routes.map((route) => (
              <TouchableOpacity
                key={route.id}
                activeOpacity={0.8}
                onPress={() => router.push(`/route/${route.id}`)}
              >
                <Card style={styles.routeCard}>
                  <View style={styles.routeHeader}>
                    <View style={styles.routeIconWrapper}>
                      <View style={[styles.routeIcon, { backgroundColor: colors.primary }]}>
                        <Feather name="refresh-cw" size={20} color={colors.primaryForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.routeName, { color: colors.foreground }]}>{route.name}</Text>
                        <Text style={[styles.routeDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {route.description || 'Regular fixed loop'}
                        </Text>
                      </View>
                    </View>
                    <Badge label={route.isActive ? 'Active' : 'Offline'} variant={route.isActive ? 'success' : 'secondary'} />
                  </View>
                  
                  <View style={[styles.routeFooter, { borderTopColor: colors.border }]}>
                    <View style={styles.footerItem}>
                      <Feather name="tag" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Base Fare: ₱{route.baseFare}</Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="map" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyStateText, { color: colors.foreground }]}>No active loops found</Text>
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  routeCard: {
    padding: 0,
  },
  routeHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  routeIconWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  routeIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  routeName: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 2,
  },
  routeDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  routeFooter: {
    borderTopWidth: 1,
    padding: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    marginTop: 32,
  },
  emptyStateText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
});
