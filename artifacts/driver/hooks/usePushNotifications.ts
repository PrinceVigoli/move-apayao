import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerNotificationDevice, unregisterNotificationDevice } from "@workspace/api-client-react";

export const PUSH_TOKEN_KEY = "moveapayao.driverPushToken";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let active = true;
    void (async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("rides", {
          name: "Ride offers",
          importance: Notifications.AndroidImportance.MAX,
          sound: "default",
          vibrationPattern: [0, 250, 150, 250],
        });
      }
      const current = await Notifications.getPermissionsAsync();
      const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
      if (!permission.granted || !active) return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (!active) return;
      const previous = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
      if (previous && previous !== token) {
        await unregisterNotificationDevice({ token: previous }).catch(() => undefined);
      }
      await registerNotificationDevice({ token, platform: Platform.OS as "ios" | "android", app: "driver" });
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    })().catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const tripId = response.notification.request.content.data?.tripId;
      if (typeof tripId === "number" || typeof tripId === "string") {
        router.push(`/trip/${tripId}` as never);
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled, router]);
}
