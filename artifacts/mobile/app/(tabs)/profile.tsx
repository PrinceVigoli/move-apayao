import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Feather } from "@expo/vector-icons";
import { useGetProfile } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { openLegalDocument, openSupportEmail } from "@/lib/legal";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useAuth();

  const { data: profileData, isLoading: isLoadingProfile } = useGetProfile();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 84 : 100),
          paddingHorizontal: 16,
        }}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Profile
        </Text>

        <Card style={styles.profileCard}>
          {isLoadingProfile ? (
            <Skeleton style={{ height: 80, width: "100%" }} />
          ) : (
            <View style={styles.profileHeader}>
              <View
                style={[styles.avatar, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.avatarText}>
                  {profileData?.user?.fullName?.[0]?.toUpperCase() || "U"}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.name, { color: colors.foreground }]}>
                  {profileData?.user?.fullName || "User"}
                </Text>
                <Text style={[styles.email, { color: colors.mutedForeground }]}>
                  {profileData?.user?.email || "No email provided"}
                </Text>
                <View style={{ marginTop: 8 }}>
                  <Badge
                    label={profileData?.user?.role || "Passenger"}
                    variant="secondary"
                  />
                </View>
              </View>
            </View>
          )}
        </Card>

        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, marginTop: 24 },
          ]}
        >
          Settings
        </Text>

        <Card style={{ padding: 0 }}>
          <Pressable style={[styles.settingRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]} onPress={() => router.push("/feedback" as never)}>
            <Feather name="message-square" size={20} color={colors.foreground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingText, { color: colors.foreground }]}>Send feedback</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>App bugs and suggestions</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={[
              styles.settingRow,
              { borderBottomColor: colors.border, borderBottomWidth: 1 },
            ]}
            onPress={() => router.push("/account" as never)}
          >
            <Feather name="user" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>
              Edit profile
            </Text>
            <Feather
              name="chevron-right"
              size={20}
              color={colors.mutedForeground}
              style={{ marginLeft: "auto" }}
            />
          </Pressable>
          <Pressable
            style={[
              styles.settingRow,
              { borderBottomColor: colors.border, borderBottomWidth: 1 },
            ]}
            onPress={() => router.push("/account" as never)}
          >
            <Feather name="shield" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>
              Privacy & Security
            </Text>
            <Feather
              name="chevron-right"
              size={20}
              color={colors.mutedForeground}
              style={{ marginLeft: "auto" }}
            />
          </Pressable>
          <Pressable
            style={[
              styles.settingRow,
              { borderBottomColor: colors.border, borderBottomWidth: 1 },
            ]}
            onPress={() => openLegalDocument("terms")}
          >
            <Feather name="file-text" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>
              Terms of Service
            </Text>
            <Feather
              name="external-link"
              size={18}
              color={colors.mutedForeground}
              style={{ marginLeft: "auto" }}
            />
          </Pressable>
          <Pressable
            style={[
              styles.settingRow,
              { borderBottomColor: colors.border, borderBottomWidth: 1 },
            ]}
            onPress={() => openLegalDocument("privacy")}
          >
            <Feather name="lock" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>
              Privacy Notice
            </Text>
            <Feather
              name="external-link"
              size={18}
              color={colors.mutedForeground}
              style={{ marginLeft: "auto" }}
            />
          </Pressable>
          <Pressable
            style={[
              styles.settingRow,
              { borderBottomColor: colors.border, borderBottomWidth: 1 },
            ]}
            onPress={() => openSupportEmail()}
          >
            <Feather name="help-circle" size={20} color={colors.foreground} />
            <Text style={[styles.settingText, { color: colors.foreground }]}>
              Help & Support
            </Text>
            <Feather
              name="chevron-right"
              size={20}
              color={colors.mutedForeground}
              style={{ marginLeft: "auto" }}
            />
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={() => router.push("/report" as never)}
          >
            <Feather
              name="alert-triangle"
              size={20}
              color={colors.foreground}
            />
            <Text style={[styles.settingText, { color: colors.foreground }]}>
              Report a ride issue
            </Text>
            <Feather
              name="chevron-right"
              size={20}
              color={colors.mutedForeground}
              style={{ marginLeft: "auto" }}
            />
          </Pressable>
        </Card>

        <Button
          title="Sign Out"
          variant="destructive"
          style={{ marginTop: 32 }}
          icon={<Feather name="log-out" size={20} color="#fff" />}
          onPress={() => signOut()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 24,
  },
  profileCard: {
    padding: 20,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  avatarText: {
    color: "#fff",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  settingText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
