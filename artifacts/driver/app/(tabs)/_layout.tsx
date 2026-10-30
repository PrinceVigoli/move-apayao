import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getListFixedLoopOperatorRunsQueryKey, getManilaDate, useGetProfile, useListFixedLoopOperatorRuns } from "@workspace/api-client-react";

export default function DriverTabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const profile = useGetProfile();
  const params = { date: getManilaDate() };
  const assignment = useListFixedLoopOperatorRuns(params, { query: {
    queryKey: getListFixedLoopOperatorRunsQueryKey(params),
    enabled: profile.data?.user.role === "driver",
    refetchInterval: 15_000,
  } });
  const fixedLoop = !!assignment.data?.service;
  const isWeb = Platform.OS === "web";
  const tabBarBottomInset = isWeb ? 0 : insets.bottom;
  const tabBarHeight = isWeb ? 84 : 64 + tabBarBottomInset;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 12,
          height: tabBarHeight,
          paddingTop: 7,
          paddingBottom: isWeb ? 8 : Math.max(tabBarBottomInset, 8),
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.background },
            ]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: fixedLoop ? "Runs" : "Home",
          tabBarIcon: ({ color }) => (
            <Feather name="navigation" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          href: fixedLoop ? null : undefined,
          tabBarIcon: ({ color }) => (
            <Feather name="dollar-sign" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Trips",
          href: fixedLoop ? null : undefined,
          tabBarIcon: ({ color }) => (
            <Feather name="map" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
