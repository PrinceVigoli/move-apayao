import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Feather } from '@expo/vector-icons';

const TYPE_LABELS: Record<string, string> = {
  top_up: 'Wallet Top-up',
  deduct: 'Fare Payment',
  refund: 'Refund',
  adjustment: 'Adjustment',
};

export default function TransactionDetailScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const params = useLocalSearchParams<{
    id: string;
    type: string;
    amount: string;
    description: string;
    referenceId: string;
    balanceBefore: string;
    balanceAfter: string;
    createdAt: string;
  }>();

  const type = params.type ?? 'adjustment';
  const isAddition = type === 'top_up' || type === 'refund';
  const amount = Number(params.amount ?? 0);
  const balanceBefore = Number(params.balanceBefore ?? 0);
  const balanceAfter = Number(params.balanceAfter ?? 0);
  const created = params.createdAt ? new Date(params.createdAt) : null;

  const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          { color: colors.foreground },
          mono && { fontFamily: 'Inter_500Medium' },
        ]}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.modalHeader}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.hero}>
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: isAddition ? '#10b98120' : '#ef444420' },
            ]}
          >
            <Feather
              name={isAddition ? 'arrow-down-left' : 'arrow-up-right'}
              size={28}
              color={isAddition ? '#10b981' : '#ef4444'}
            />
          </View>
          <Text style={[styles.heroAmount, { color: isAddition ? '#10b981' : colors.foreground }]}>
            {isAddition ? '+' : '-'}₱{amount.toFixed(2)}
          </Text>
          <Text style={[styles.heroType, { color: colors.mutedForeground }]}>
            {TYPE_LABELS[type] ?? type.replace('_', ' ')}
          </Text>
        </View>

        <Card style={styles.card}>
          {created && (
            <>
              <Row
                label="Date"
                value={created.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Row
                label="Time"
                value={created.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </>
          )}
          {!!params.description && (
            <>
              <Row label="Description" value={params.description} />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </>
          )}
          <Row label="Balance before" value={`₱${balanceBefore.toFixed(2)}`} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Row label="Balance after" value={`₱${balanceAfter.toFixed(2)}`} />
        </Card>

        <Card style={styles.card}>
          <Row label="Transaction ID" value={`#${params.id}`} mono />
          {!!params.referenceId && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Row label="Reference" value={params.referenceId} mono />
            </>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalHeader: { alignItems: 'center', paddingVertical: 12 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  hero: { alignItems: 'center', marginVertical: 24 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroAmount: { fontSize: 34, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  heroType: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  card: { padding: 16, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  rowValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  divider: { height: 1, marginVertical: 8 },
});