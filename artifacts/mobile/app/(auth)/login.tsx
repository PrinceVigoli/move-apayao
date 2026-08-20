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
      setError(err?.message ?? "Could not sign in. Please try again.");
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
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <BrandHero />
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Welcome back
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to continue your journey.
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
          <View
            style={[
              styles.notice,
              { backgroundColor: colors.destructive + "12" },
            ]}
          >
            <Text style={[styles.noticeText, { color: colors.destructive }]}>
              {error}
            </Text>
          </View>
        )}
        {info && (
          <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
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
          <Text style={[styles.link, { color: colors.primaryStrong }]}>
            Forgot password?
          </Text>
        </Pressable>
        <View style={styles.footer}>
          <Text style={{ color: colors.mutedForeground }}>
            Don&apos;t have an account?{" "}
          </Text>
          <Text
            style={[styles.link, { color: colors.primaryStrong }]}
            onPress={() => router.push("/(auth)/signup")}
          >
            Create your account
          </Text>
        </View>
        <View style={[styles.trust, { borderColor: colors.border }]}>
          <Text style={[styles.trustText, { color: colors.mutedForeground }]}>
            LOCAL & TRUSTED · ZERO EMISSION · SAFE & SECURE
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  heading: { alignItems: "center", marginBottom: 24 },
  title: { fontSize: 29, fontFamily: "Inter_700Bold", letterSpacing: -0.7 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 7 },
  form: { gap: 12 },
  notice: { borderRadius: 14, padding: 12, marginTop: 12 },
  noticeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  primaryButton: { marginTop: 18 },
  linkButton: { alignSelf: "center", padding: 14 },
  link: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 18 },
  trust: {
    borderTopWidth: 1,
    marginTop: "auto",
    paddingTop: 22,
    alignItems: "center",
  },
  trustText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
});
