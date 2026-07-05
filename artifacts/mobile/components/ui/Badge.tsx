import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline' | 'secondary';
}

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const colors = useColors();

  let bgColor = colors.primary;
  let textColor = colors.primaryForeground;
  let borderColor = 'transparent';

  if (variant === 'secondary') {
    bgColor = colors.secondary;
    textColor = colors.secondaryForeground;
  } else if (variant === 'success') {
    bgColor = '#10b981'; // green-500
    textColor = '#ffffff';
  } else if (variant === 'warning') {
    bgColor = '#f59e0b'; // amber-500
    textColor = '#ffffff';
  } else if (variant === 'destructive') {
    bgColor = colors.destructive;
    textColor = colors.destructiveForeground;
  } else if (variant === 'outline') {
    bgColor = 'transparent';
    textColor = colors.foreground;
    borderColor = colors.border;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor,
          borderWidth: variant === 'outline' ? 1 : 0,
        },
      ]}
    >
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
  },
});
