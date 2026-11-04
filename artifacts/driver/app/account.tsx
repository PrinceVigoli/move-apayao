import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetProfileQueryKey,
  useChangePassword,
  useDeactivateAccount,
  useGetProfile,
  useUpdateProfile,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { PremiumField } from "@/components/PremiumField";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";
import { openLegalDocument } from "@/lib/legal";

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { data } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const deactivate = useDeactivateAccount();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deactivatePassword, setDeactivatePassword] = useState("");

  useEffect(() => {
    if (!data?.user) return;
    setFullName(data.user.fullName ?? "");
    setPhone(data.user.phone ?? "");
  }, [data?.user]);

  const saveProfile = () => {
    if (!fullName.trim()) return Alert.alert("Name required", "Enter your full name.");
    updateProfile.mutate(
      { data: { fullName: fullName.trim(), phone: phone.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
          Alert.alert("Profile updated", "Your account information was saved.");
        },
        onError: (error: any) =>
          Alert.alert("Could not update", error?.response?.data?.error ?? "Please try again."),
      },
    );
  };

  const savePassword = () => {
    if (!currentPassword || newPassword.length < 8) {
      return Alert.alert("Check passwords", "Use your current password and a new password of at least 8 characters.");
    }
    changePassword.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: async () => {
          Alert.alert("Password changed", "Sign in again using your new password.");
          await signOut();
        },
        onError: (error: any) =>
          Alert.alert("Could not change password", error?.response?.data?.error ?? "Please try again."),
      },
    );
  };

  const confirmDeactivate = () => {
    if (!deactivatePassword) return Alert.alert("Password required", "Enter your password first.");
    Alert.alert(
      "Deactivate account?",
      "You will be taken offline and signed out. Trip records remain available for safety and audit purposes.",
      [
        { text: "Keep account", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () =>
            deactivate.mutate(
              { data: { password: deactivatePassword } },
              {
                onSuccess: async () => {
                  await signOut();
                },
                onError: (error: any) =>
                  Alert.alert("Could not deactivate", error?.response?.data?.error ?? "Please try again."),
              },
            ),
        },
      ],
    );
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}> 
        <Pressable onPress={() => router.back()} accessibilityLabel="Back">
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Account & security</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 36 }}>
        <Text style={[styles.section, { color: colors.foreground }]}>Personal information</Text>
        <Card style={styles.card}>
          <PremiumField icon="user" value={fullName} onChangeText={setFullName} placeholder="Full name" />
          <PremiumField icon="phone" value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
          <Button title="Save profile" onPress={saveProfile} loading={updateProfile.isPending} />
        </Card>

        <Text style={[styles.section, { color: colors.foreground }]}>Change password</Text>
        <Card style={styles.card}>
          <PremiumField icon="lock" value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" secure />
          <PremiumField icon="shield" value={newPassword} onChangeText={setNewPassword} placeholder="New password" secure />
          <Button title="Change password" onPress={savePassword} loading={changePassword.isPending} />
        </Card>

        <Text style={[styles.section, { color: colors.destructive }]}>Delete account and personal data</Text>
        <Card style={styles.card}>
          <Text style={{ color: colors.mutedForeground, lineHeight: 19 }}>Request permanent deletion on our secure website. Verify your account there and keep your private request reference to follow its progress. Active journeys or balances must be resolved first.</Text>
          <Button title="Request account deletion" variant="destructive" onPress={() => openLegalDocument("delete-account").catch(() => Alert.alert("Could not open page", "Open https://moveapayao.com/delete-account in your browser."))} />
        </Card>
        <Text style={[styles.section, { color: colors.destructive }]}>Deactivate account</Text>
        <Card style={styles.card}>
          <Text style={{ color: colors.mutedForeground, lineHeight: 19 }}>
            Deactivation blocks sign-in immediately. Contact operations if the account needs to be restored.
          </Text>
          <PremiumField icon="lock" value={deactivatePassword} onChangeText={setDeactivatePassword} placeholder="Confirm password" secure />
          <Button title="Deactivate account" variant="destructive" onPress={confirmDeactivate} loading={deactivate.isPending} />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 14 },
  title: { fontFamily: "Inter_700Bold", fontSize: 19 },
  section: { fontFamily: "Inter_700Bold", fontSize: 15, marginTop: 18, marginBottom: 10 },
  card: { gap: 12, padding: 14 },
});
