import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Animated } from 'react-native';
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
  accessibilityHint?: string;
}

/**
 * Primary action control.
 *
 * Filled variants carry a soft shadow so the main action stands out from the
 * surface it sits on — on a busy map screen a flat button competes with
 * everything else. Pressing scales the button down slightly: on a phone your
 * thumb covers the control, so the confirmation has to be visible around your
 * finger, not under it.
 *
 * Coloured text (ghost/outline) uses `primaryStrong` rather than `primary`:
 * the button-surface colour isn't dark enough to read as small text on a
 * light background.
 */
export function Button({
  onPress,
  title,
  variant = 'default',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityHint,
}: ButtonProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;

  const isFilled = variant === 'default' || variant === 'destructive';
  const inactive = disabled || loading;

  const handlePress = () => {
    if (inactive) return;
    Haptics.selectionAsync();
    onPress();
  };

  const animate = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();

  const backgroundColor =
    variant === 'default'
      ? colors.primary
      : variant === 'secondary'
        ? colors.secondary
        : variant === 'destructive'
          ? colors.destructive
          : 'transparent';

  const textColor =
    variant === 'default'
      ? colors.primaryForeground
      : variant === 'secondary'
        ? colors.secondaryForeground
        : variant === 'destructive'
          ? colors.destructiveForeground
          : variant === 'ghost'
            ? colors.primaryStrong
            : colors.foreground;

  const height = size === 'sm' ? 40 : size === 'lg' ? 56 : 48;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 17 : 16;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => !inactive && animate(0.97)}
        onPressOut={() => animate(1)}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        style={[
          styles.button,
          {
            backgroundColor,
            borderColor: variant === 'outline' ? colors.input : 'transparent',
            borderWidth: variant === 'outline' ? 1.5 : 0,
            height,
            borderRadius: colors.radius,
            opacity: disabled ? 0.45 : 1,
          },
          isFilled && !disabled && styles.raised,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <View style={styles.content}>
            {icon && <View style={styles.iconContainer}>{icon}</View>}
            <Text style={[styles.text, { color: textColor, fontSize }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 18,
  },
  raised: {
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: { marginRight: 8 },
  text: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.1,
  },
});
