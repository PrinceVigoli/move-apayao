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

const VEHICLES = [
  { value: "e-trike", label: "E-Trike", seats: 4 },
  { value: "tricycle", label: "Tricycle", seats: 4 },
  { value: "jeepney", label: "Jeepney", seats: 12 },
  { value: "van", label: "Van", seats: 15 },
];
export default function DriverSignupScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { signUpWithPassword } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [vehicleType, setVehicleType] = useState("e-trike");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const next = () => {
    setError(null);
    if (!fullName.trim() || !email.trim() || password.length < 8)
      return setError(
        "Enter your name, email, and a password of at least 8 characters.",
      );
    setStep(2);
  };
  const submit = async () => {
    setError(null);
    if (!plateNumber.trim() || !licenseNumber.trim())
      return setError("Plate number and licence number are required.");
    if (!acceptedTerms)
      return setError("Please accept the driver Terms and Privacy Policy.");
    setLoading(true);
    try {
      await signUpWithPassword({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        vehicleType,
        plateNumber: plateNumber.trim(),
        vehicleColor: vehicleColor.trim() || undefined,
        licenseNumber: licenseNumber.trim(),
        acceptedTerms: true,
        termsVersion: "2026-08-19",
      });
      setInfo("Application pending");
    } catch (err: any) {
      setError(err?.message ?? "Could not submit your application.");
    } finally {
      setLoading(false);
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
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 30 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <Pressable
            onPress={() => (step === 2 ? setStep(1) : router.back())}
            style={[styles.back, { backgroundColor: colors.card }]}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <BrandHero compact />
          <View style={{ width: 42 }} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Driver application
        </Text>
        <Text style={[styles.stepText, { color: colors.primaryStrong }]}>
          Step {step} of 2
        </Text>
        <View style={styles.progress}>
          <View
            style={[styles.progressLine, { backgroundColor: colors.border }]}
          />
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.accent,
                width: step === 1 ? "50%" : "100%",
              },
            ]}
          />
          <View
            style={[
              styles.stepDot,
              styles.dotOne,
              { backgroundColor: colors.accent },
            ]}
          >
            <Text style={styles.dotText}>1</Text>
          </View>
          <View
            style={[
              styles.stepDot,
              styles.dotTwo,
              {
                backgroundColor: step === 2 ? colors.accent : colors.card,
                borderColor: colors.accent,
              },
            ]}
          >
            <Text
              style={[styles.dotText, step === 1 && { color: colors.accent }]}
            >
              2
            </Text>
          </View>
        </View>
        {info ? (
          <View style={[styles.successCard, { borderColor: colors.warning }]}>
            <View
              style={[
                styles.pendingIcon,
                { backgroundColor: colors.warning + "22" },
              ]}
            >
              <Feather name="clock" size={28} color={colors.warning} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              Application pending
            </Text>
            <Text
              style={[styles.successText, { color: colors.mutedForeground }]}
            >
              We&apos;ll notify you after an administrator verifies your licence
              and vehicle.
            </Text>
            <Button
              title="Back to sign in"
              onPress={() => router.replace("/(auth)/login")}
              style={{ marginTop: 20, alignSelf: "stretch" }}
            />
          </View>
        ) : step === 1 ? (
          <>
            <Text
              style={[styles.sectionLabel, { color: colors.mutedForeground }]}
            >
              PERSONAL INFORMATION
            </Text>
            <View style={styles.form}>
              <PremiumField
                icon="user"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Full name"
              />
              <PremiumField
                icon="mail"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <PremiumField
                icon="phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone (optional)"
                keyboardType="phone-pad"
              />
              <PremiumField
                icon="lock"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secure
              />
            </View>
            <Pressable
              onPress={() => setAcceptedTerms((value) => !value)}
              style={styles.consentRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
            >
              <View
                style={[
                  styles.consentBox,
                  {
                    borderColor: acceptedTerms ? colors.accent : colors.border,
                    backgroundColor: acceptedTerms ? colors.accent : "transparent",
                  },
                ]}
              >
                {acceptedTerms && <Feather name="check" size={13} color="#fff" />}
              </View>
              <Text style={[styles.consentText, { color: colors.mutedForeground }]}>
                I accept the driver Terms of Service and Privacy Policy.
              </Text>
            </Pressable>
            <Button
              title="Continue"
              size="lg"
              onPress={next}
              style={{ marginTop: 20 }}
            />
          </>
        ) : (
          <>
            <Text
              style={[styles.sectionLabel, { color: colors.mutedForeground }]}
            >
              VEHICLE INFORMATION
            </Text>
            <View style={styles.vehicles}>
              {VEHICLES.map((vehicle) => (
                <Pressable
                  key={vehicle.value}
                  onPress={() => setVehicleType(vehicle.value)}
                  style={[
                    styles.vehicle,
                    {
                      borderColor:
                        vehicleType === vehicle.value
                          ? colors.accent
                          : colors.border,
                      backgroundColor:
                        vehicleType === vehicle.value
                          ? colors.secondary
                          : colors.card,
                    },
                  ]}
                >
                  <Feather
                    name="truck"
                    size={18}
                    color={
                      vehicleType === vehicle.value
                        ? colors.accent
                        : colors.mutedForeground
                    }
                  />
                  <Text
                    style={[styles.vehicleName, { color: colors.foreground }]}
                  >
                    {vehicle.label}
                  </Text>
                  <Text
                    style={[styles.seats, { color: colors.mutedForeground }]}
                  >
                    {vehicle.seats} seats
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.form}>
              <PremiumField
                icon="credit-card"
                value={plateNumber}
                onChangeText={setPlateNumber}
                placeholder="Plate number"
                autoCapitalize="characters"
              />
              <PremiumField
                icon="file-text"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                placeholder="Licence number"
                autoCapitalize="characters"
              />
              <PremiumField
                icon="droplet"
                value={vehicleColor}
                onChangeText={setVehicleColor}
                placeholder="Vehicle color (optional)"
              />
            </View>
            <View
              style={[
                styles.review,
                {
                  borderColor: colors.warning,
                  backgroundColor: colors.warning + "0D",
                },
              ]}
            >
              <Feather name="shield" size={22} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.reviewTitle, { color: colors.warning }]}>
                  Verification & review
                </Text>
                <Text
                  style={[styles.reviewText, { color: colors.mutedForeground }]}
                >
                  Your application will be reviewed to keep every journey safe
                  and trusted.
                </Text>
              </View>
            </View>
            <Button
              title="Submit application"
              size="lg"
              loading={loading}
              onPress={submit}
              style={{ marginTop: 18 }}
            />
          </>
        )}
        {error && (
          <View style={[styles.error, { borderColor: colors.destructive }]}>
            <Text
              style={{
                color: colors.destructive,
                fontFamily: "Inter_500Medium",
                textAlign: "center",
              }}
            >
              {error}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { textAlign: "center", fontSize: 27, fontFamily: "Inter_700Bold" },
  stepText: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 7,
  },
  progress: {
    height: 58,
    marginHorizontal: 28,
    marginTop: 12,
    justifyContent: "center",
  },
  progressLine: { height: 2 },
  progressFill: { position: "absolute", left: 0, height: 3 },
  stepDot: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  dotOne: { left: -1 },
  dotTwo: { right: -1 },
  dotText: { fontFamily: "Inter_700Bold", color: "#0E1B2E" },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 12,
  },
  form: { gap: 11 },
  vehicles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  vehicle: { width: "48%", borderWidth: 1, borderRadius: 15, padding: 13 },
  vehicleName: { fontFamily: "Inter_600SemiBold", marginTop: 8 },
  seats: { fontSize: 11, marginTop: 2 },
  review: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
  },
  reviewTitle: { fontFamily: "Inter_700Bold", fontSize: 13 },
  reviewText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  consentBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  consentText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  error: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  successCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    marginTop: 28,
  },
  pendingIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 16 },
  successText: {
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
});
