import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui/Button';
import { Feather } from '@expo/vector-icons';
import { useCreateIncident } from '@workspace/api-client-react';
import { useLocation } from '@/hooks/useLocation';
import * as Haptics from 'expo-haptics';

// SOW: "Driver/passenger reporting/feedback system … road accident, fleet
// troubleshooting, flood reporting." Driver-behavior feedback is handled by
// the per-trip star rating; this screen covers location-tagged incidents.
const INCIDENT_TYPES = [
  { value: 'accident', label: 'Road Accident', icon: 'alert-octagon' },
  { value: 'flood', label: 'Flooded Road', icon: 'cloud-rain' },
  { value: 'fleet_issue', label: 'Vehicle / Fleet Issue', icon: 'tool' },
] as const;

const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { lat, lon, isFallback } = useLocation();

  const [type, setType] = useState<(typeof INCIDENT_TYPES)[number]['value']>('accident');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]['value']>('medium');
  const [description, setDescription] = useState('');

  const createIncident = useCreateIncident();

  const submit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    createIncident.mutate(
      {
        data: {
          type,
          severity,
          lat,
          lon,
          description: description.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          Alert.alert(
            'Report submitted',
            'Thank you — the operations team has been notified.',
            [{ text: 'OK', onPress: () => router.back() }],
          );
        },
        onError: () => {
          Alert.alert('Could not submit', 'Please check your connection and try again.');
        },
      },
    );
  };

  const chip = (
    active: boolean,
    label: string,
    onPress: () => void,
    icon?: string,
  ) => (
    <Pressable
      key={label}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primary + '18' : 'transparent',
        },
      ]}
    >
      {icon && (
        <Feather
          name={icon as any}
          size={15}
          color={active ? colors.primary : colors.mutedForeground}
        />
      )}
      <Text style={[styles.chipText, { color: active ? colors.primary : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Report an Issue</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>What happened?</Text>
        <View style={styles.chipRow}>
          {INCIDENT_TYPES.map((t) =>
            chip(type === t.value, t.label, () => setType(t.value), t.icon),
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>How serious is it?</Text>
        <View style={styles.chipRow}>
          {SEVERITIES.map((s) => chip(severity === s.value, s.label, () => setSeverity(s.value)))}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          Details (optional)
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Describe what you saw — landmark, direction, vehicles involved…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[
            styles.textarea,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
          ]}
        />

        <View style={[styles.locRow, { backgroundColor: colors.card }]}>
          <Feather name="map-pin" size={16} color={colors.primary} />
          <Text style={[styles.locText, { color: colors.mutedForeground }]}>
            {isFallback
              ? 'Location unavailable — report will use the Apayao area center.'
              : 'Your current location will be attached to this report.'}
          </Text>
        </View>

        <Button
          title="Submit Report"
          onPress={submit}
          loading={createIncident.isPending}
          icon={<Feather name="send" size={18} color={colors.primaryForeground} />}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 10,
    marginTop: 18,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  textarea: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginTop: 18,
  },
  locText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
});
