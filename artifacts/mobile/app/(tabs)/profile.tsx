import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Feather } from '@expo/vector-icons';
import { useGetProfile, useGetMySubscription } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { signOut } = useAuth();

  const { data: profileData, isLoading: isLoadingProfile } = useGetProfile();
  const { data: subData, isLoading: isLoadingSub } = useGetMySubscription();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 100),
          paddingHorizontal: 16,
        }}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>

        <Card style={styles.profileCard}>
          {isLoadingProfile ? (
            <Skeleton style={{ height: 80, width: '100%' }} />
          ) : (
            <View style={styles.profileHeader}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>
                  {profileData?.user?.fullName?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.name, { color: colors.foreground }]}>
                  {profileData?.user?.fullName || 'User'}
                </Text>
                <Text style={[styles.email, { color: colors.mutedForeground }]}>
                  {profileData?.user?.email || 'No email provided'}
                </Text>
                <View style={{ marginTop: 8 }}>
                  <Badge label={profileData?.user?.role || 'Passenger'} variant="secondary" />
                </View>
              </View>
            </View>
          )}
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>Subscription</Text>
        
        <Card style={styles.subCard}>
          {isLoadingSub ? (
            <Skeleton style={{ height: 60, width: '100%' }} />
          ) : subData?.subscription ? (
            <View style={styles.subRow}>
              <View>
                <Text style={[styles.subPlan, { color: colors.foreground }]}>
                  {subData.subscription.plan.toUpperCase()} PLAN
                </Text>
                <Text style={[styles.subDate, { color: colors.mutedForeground }]}>
                  Expires: {new Date(subData.subscription.expiresAt).toLocaleDateString()}
                </Text>
              </View>
              <Badge 
                label={subData.subscription.status} 
                variant={subData.subscription.status === 'active' ? 'success' : 'secondary'} 
              />
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>You don't have an active subscription</Text>
              <Button title="View Plans" variant="outline" onPress={() => {}} />
            </View>
          )}
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>Settings</Text>

        <Card style={{ padding: 0 }}>
          <View style={[styles.settingRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <Feather name="bell" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>Notifications</Text>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} style={{ marginLeft: 'auto' }} />
          </View>
          <View style={[styles.settingRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <Feather name="shield" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>Privacy & Security</Text>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} style={{ marginLeft: 'auto' }} />
          </View>
          <View style={styles.settingRow}>
            <Feather name="help-circle" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>Help & Support</Text>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} style={{ marginLeft: 'auto' }} />
          </View>
        </Card>

        <Button 
          title="Sign Out" 
          variant="destructive" 
          style={{ marginTop: 32 }} 
          icon={<Feather name="log-out" size={20} color="#fff" />}
          onPress={() => signOut()} 
        />
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
    marginBottom: 24,
  },
  profileCard: {
    padding: 20,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 16,
  },
  subCard: {
    padding: 16,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subPlan: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  subDate: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  settingText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
});
