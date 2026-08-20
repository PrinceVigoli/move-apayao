import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";
import { PremiumField } from "@/components/PremiumField";
import { BrandHero } from "@/components/BrandHero";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { signInWithPassword, sendPasswordReset } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handleLogin = async () => {
    setError(null);
    setInfo(null);
    if (!identifier.trim() || !password)
      return setError("Enter your email or phone number and password.");
    setLoading(true);
    try {
      await signInWithPassword(identifier.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };
  const handleReset = async () => {
    if (!identifier.includes("@"))
      return setError("Enter your email above to reset your password.");
    setError(null);
    try {
      setInfo(await sendPasswordReset(identifier.trim()));
    } catch (err: any) {
      setError(err?.message ?? "Could not request a reset link.");
    }
  };
  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: colors.primary + "18" }]}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <BrandHero />
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Drive with MOVE
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to your approved driver account.
          </Text>
        </View>
        <View style={styles.form}>
          <PremiumField
            icon="user"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="Email or phone"
            autoCapitalize="none"
            autoComplete="username"
          />
          <PremiumField
            icon="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secure
            autoComplete="password"
          />
        </View>
        {error && (
          <View style={[styles.notice, { borderColor: colors.destructive }]}>
            <Text style={[styles.noticeText, { color: colors.destructive }]}>
              {error}
            </Text>
          </View>
        )}
        {info && (
          <View style={[styles.notice, { borderColor: colors.primary }]}>
            <Text style={[styles.noticeText, { color: colors.primaryStrong }]}>
              {info}
            </Text>
          </View>
        )}
        <Button
          title="Sign in"
          size="lg"
          loading={loading}
          onPress={handleLogin}
          style={styles.primaryButton}
        />
        <Pressable onPress={handleReset} style={styles.linkButton}>
          <Text style={[styles.link, { color: colors.accent }]}>
            Forgot password?
          </Text>
        </Pressable>
        <View style={[styles.divider, { borderColor: colors.border }]}>
          <Text
            style={[
              styles.or,
              {
                color: colors.mutedForeground,
                backgroundColor: colors.background,
              },
            ]}
          >
            OR
          </Text>
        </View>
        <View style={styles.footer}>
          <Text style={{ color: colors.mutedForeground }}>
            New to driving with us?{" "}
          </Text>
          <Text
            style={[styles.link, { color: colors.accent }]}
            onPress={() => router.push("/(auth)/signup")}
          >
            Apply to become a driver
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  glow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -190,
    alignSelf: "center",
  },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  heading: { alignItems: "center", marginBottom: 28 },
  title: { fontSize: 29, fontFamily: "Inter_700Bold", letterSpacing: -0.7 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 7 },
  form: { gap: 12 },
  notice: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 12 },
  noticeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  primaryButton: { marginTop: 18 },
  linkButton: { alignSelf: "center", padding: 14 },
  link: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  divider: { borderTopWidth: 1, marginTop: 14, alignItems: "center" },
  or: {
    paddingHorizontal: 14,
    marginTop: -7,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 28,
  },
});
