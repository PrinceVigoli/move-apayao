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
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";
import { PremiumField } from "@/components/PremiumField";
import { BrandHero } from "@/components/BrandHero";
import { useAuth } from "@/contexts/AuthContext";
import { LEGAL_VERSION, openLegalDocument } from "@/lib/legal";

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { signUpWithPassword } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const submit = async () => {
    setError(null);
    if (!fullName.trim() || !email.trim() || password.length < 8)
      return setError(
        "Enter your name, a valid email, and a password of at least 8 characters.",
      );
    if (!acceptedTerms)
      return setError("Please accept the Terms of Service and Privacy Policy.");
    setLoading(true);
    try {
      await signUpWithPassword({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        acceptedTerms: true,
        termsVersion: LEGAL_VERSION,
      });
    } catch (err: any) {
      setError(err?.message ?? "Could not create your account.");
    } finally {
      setLoading(false);
    }
  };
  const benefits = [
    ["zap", "Quick bookings"],
    ["shield", "Safe & reliable"],
    ["heart", "Support local"],
  ] as const;
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
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.card }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <BrandHero compact />
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Let&apos;s get you started
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Create an account and book your next ride.
          </Text>
        </View>
        <View
          style={[
            styles.benefits,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {benefits.map(([icon, label]) => (
            <View key={label} style={styles.benefit}>
              <View
                style={[
                  styles.benefitIcon,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <Feather name={icon} size={16} color={colors.primary} />
              </View>
              <Text
                style={[styles.benefitText, { color: colors.primaryStrong }]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.form}>
          <PremiumField
            icon="user"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name"
            autoComplete="name"
          />
          <PremiumField
            icon="mail"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <PremiumField
            icon="phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone (optional)"
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <PremiumField
            icon="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secure
            autoComplete="password-new"
          />
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Use 8 or more characters. You can sign in with email or phone.
        </Text>
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
        <Button
          title="Create account"
          size="lg"
          loading={loading}
          onPress={submit}
          style={{ marginTop: 18 }}
        />
        <View style={styles.termsRow}>
          <Pressable
            onPress={() => setAcceptedTerms((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityLabel="Accept the Terms and Privacy Policy"
            accessibilityState={{ checked: acceptedTerms }}
            hitSlop={8}
            style={[
              styles.checkbox,
              {
                borderColor: acceptedTerms ? colors.primary : colors.border,
                backgroundColor: acceptedTerms ? colors.primary : "transparent",
              },
            ]}
          >
            {acceptedTerms && <Feather name="check" size={14} color="#fff" />}
          </Pressable>
          <Text style={[styles.terms, { color: colors.mutedForeground }]}>
            I accept the{" "}
            <Text
              style={{ color: colors.primaryStrong }}
              onPress={() => openLegalDocument("terms")}
            >
              Terms
            </Text>{" "}
            and{" "}
            <Text
              style={{ color: colors.primaryStrong }}
              onPress={() => openLegalDocument("privacy")}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
        <View style={styles.footer}>
          <Text style={{ color: colors.mutedForeground }}>
            Already have an account?{" "}
          </Text>
          <Text
            style={[styles.link, { color: colors.primaryStrong }]}
            onPress={() => router.replace("/(auth)/login")}
          >
            Sign in
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  back: {
    position: "absolute",
    top: 18,
    left: 20,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { alignItems: "center", marginBottom: 18 },
  title: { fontSize: 27, fontFamily: "Inter_700Bold", letterSpacing: -0.6 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 6 },
  benefits: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
  },
  benefit: { flex: 1, alignItems: "center", gap: 6 },
  benefitIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  form: { gap: 11 },
  hint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    marginLeft: 4,
  },
  notice: { borderRadius: 14, padding: 12, marginTop: 12 },
  noticeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  terms: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 20,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  link: { fontFamily: "Inter_600SemiBold" },
});
