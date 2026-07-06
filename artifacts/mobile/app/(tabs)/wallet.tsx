import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, RefreshControl, TextInput, Alert, Linking, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Feather } from '@expo/vector-icons';
import {
  useGetWallet,
  useListTransactions,
  useCreateTopUpIntent,
} from '@workspace/api-client-react';
import * as Haptics from 'expo-haptics';

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const [topUpAmount, setTopUpAmount] = useState('');

  const { data: walletData, isLoading: isLoadingWallet, refetch: refetchWallet } = useGetWallet();
  const { data: txData, isLoading: isLoadingTx, refetch: refetchTx } = useListTransactions({ limit: 10 });
  const topUpIntent = useCreateTopUpIntent();

  const isRefetching = isLoadingWallet || isLoadingTx;

  const onRefresh = () => {
    refetchWallet();
    refetchTx();
  };

  // Top-ups no longer credit the wallet directly from the app — that would
  // mean anyone could mint money for themselves. Instead this opens a
  // payment-provider checkout in the browser; the wallet balance updates
  // once the provider confirms payment (webhook), so pull-to-refresh after
  // completing checkout to see the new balance.
  const handleTopUp = () => {
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount to top up.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    topUpIntent.mutate(
      { data: { amount } },
      {
        onSuccess: async ({ checkoutUrl }) => {
          setTopUpAmount('');
          const canOpen = await Linking.canOpenURL(checkoutUrl);
          if (canOpen) {
            await Linking.openURL(checkoutUrl);
          } else {
            Alert.alert('Error', 'Could not open the payment page.');
          }
        },
        onError: () => {
          Alert.alert('Error', 'Failed to start top-up. Please try again.');
        }
      }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 100),
          paddingHorizontal: 16,
        }}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>

        {/* Balance Card */}
        <Card style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
          <Text style={[styles.balanceLabel, { color: colors.primaryForeground }]}>Current Balance</Text>
          {isLoadingWallet ? (
            <Skeleton style={{ height: 40, width: 150, marginTop: 8 }} />
          ) : (
            <Text style={[styles.balanceValue, { color: colors.primaryForeground }]}>
              ₱{walletData?.wallet?.balance?.toFixed(2) || '0.00'}
            </Text>
          )}
          <View style={styles.topUpRow}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground }]}
              placeholder="Amount (₱)"
              keyboardType="numeric"
              value={topUpAmount}
              onChangeText={setTopUpAmount}
            />
            <Button
              title="Top Up"
              variant="secondary"
              onPress={handleTopUp}
              loading={topUpIntent.isPending}
            />
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Transactions</Text>

        {isLoadingTx ? (
          <View style={{ gap: 12 }}>
            <Card><Skeleton style={{ height: 60, width: '100%' }} /></Card>
            <Card><Skeleton style={{ height: 60, width: '100%' }} /></Card>
          </View>
        ) : txData?.transactions?.length ? (
          <View style={{ gap: 12 }}>
            {txData.transactions.map((tx) => {
              const isAddition = tx.type === 'top_up' || tx.type === 'refund';
              return (
                <Pressable
                  key={tx.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push({
                      pathname: '/transaction/[id]',
                      params: {
                        id: String(tx.id),
                        type: tx.type,
                        amount: String(tx.amount),
                        description: tx.description ?? '',
                        referenceId: tx.referenceId ?? '',
                        balanceBefore: String(tx.balanceBefore),
                        balanceAfter: String(tx.balanceAfter),
                        createdAt: tx.createdAt,
                      },
                    });
                  }}
                >
                <Card style={styles.txCard}>
                  <View style={styles.txRow}>
                    <View style={styles.txIconWrapper}>
                      <View style={[styles.txIcon, { backgroundColor: isAddition ? '#10b98120' : '#ef444420' }]}>
                        <Feather 
                          name={isAddition ? 'arrow-down-left' : 'arrow-up-right'} 
                          size={20} 
                          color={isAddition ? '#10b981' : '#ef4444'} 
                        />
                      </View>
                      <View>
                        <Text style={[styles.txType, { color: colors.foreground }]}>
                          {tx.type.replace('_', ' ').toUpperCase()}
                        </Text>
                        <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.txAmount, { color: isAddition ? '#10b981' : colors.foreground }]}>
                        {isAddition ? '+' : '-'}₱{tx.amount.toFixed(2)}
                      </Text>
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                    </View>
                  </View>
                </Card>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="file-text" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyStateText, { color: colors.foreground }]}>No transactions yet</Text>
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
  balanceCard: {
    padding: 24,
    marginBottom: 32,
    borderWidth: 0,
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    opacity: 0.9,
  },
  balanceValue: {
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
    marginBottom: 24,
  },
  topUpRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 16,
  },
  txCard: {
    padding: 16,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txIconWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txType: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  txDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  txAmount: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
});