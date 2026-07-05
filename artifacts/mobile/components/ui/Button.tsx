import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';
import * as Haptics from 'expo-haptics';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: any;
}

export function Button({
  onPress,
  title,
  variant = 'default',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const colors = useColors();

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.selectionAsync();
    onPress();
  };

  const getBackgroundColor = () => {
    if (variant === 'default') return colors.primary;
    if (variant === 'secondary') return colors.secondary;
    if (variant === 'destructive') return colors.destructive;
    return 'transparent';
  };

  const getTextColor = () => {
    if (variant === 'default') return colors.primaryForeground;
    if (variant === 'secondary') return colors.secondaryForeground;
    if (variant === 'destructive') return colors.destructiveForeground;
    if (variant === 'ghost') return colors.primary;
    return colors.foreground;
  };

  const getBorderColor = () => {
    if (variant === 'outline') return colors.border;
    return 'transparent';
  };

  const getHeight = () => {
    if (size === 'sm') return 36;
    if (size === 'lg') return 56;
    return 48; // md
  };

  const getFontSize = () => {
    if (size === 'sm') return 14;
    if (size === 'lg') return 18;
    return 16; // md
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'outline' ? 1 : 0,
          height: getHeight(),
          borderRadius: colors.radius,
          opacity: disabled || loading ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text
            style={[
              styles.text,
              { color: getTextColor(), fontSize: getFontSize() },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
  },
});
