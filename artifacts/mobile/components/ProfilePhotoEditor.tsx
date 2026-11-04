import React, { useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetProfileQueryKey,
  useUpdateProfile,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/useColors";

export function ProfilePhotoEditor({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  const colors = useColors();
  const client = useQueryClient();
  const update = useUpdateProfile();
  const [busy, setBusy] = useState(false);
  const save = async (value: string) => {
    await update.mutateAsync({ data: { avatarUrl: value } });
    await client.invalidateQueries({ queryKey: getGetProfileQueryKey() });
  };
  const choose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (
        !asset ||
        asset.width * asset.height > 32_000_000 ||
        (asset.fileSize ?? 0) > 15_000_000
      )
        throw new Error("Choose a photo smaller than 15 MB and 32 megapixels.");
      const ratio = Math.min(320 / asset.width, 320 / asset.height, 1);
      const photo = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          {
            resize: {
              width: Math.max(1, Math.round(asset.width * ratio)),
              height: Math.max(1, Math.round(asset.height * ratio)),
            },
          },
        ],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!photo.base64 || photo.base64.length > 175_000)
        throw new Error(
          "This photo is too large. Please choose another photo.",
        );
      await save(`data:image/jpeg;base64,${photo.base64}`);
    } catch (error) {
      Alert.alert(
        "Could not update photo",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await save("");
    } catch {
      Alert.alert(
        "Could not remove photo",
        "Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 12 }}>
      {avatarUrl ? (
        <Image
          accessibilityLabel="Your profile photo"
          source={{ uri: avatarUrl }}
          style={{ width: 88, height: 88, borderRadius: 44 }}
        />
      ) : (
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: colors.primary,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontSize: 32 }}>
            {name[0]?.toUpperCase() || "P"}
          </Text>
        </View>
      )}
      <Text
        style={{
          color: colors.mutedForeground,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        Your assigned driver can see your photo when you share your pickup
        location.
      </Text>
      <Button
        title={avatarUrl ? "Change photo" : "Upload profile photo"}
        variant="outline"
        onPress={choose}
        loading={busy}
      />
      {!!avatarUrl && (
        <Button
          title="Remove photo"
          variant="outline"
          size="sm"
          onPress={remove}
          disabled={busy}
        />
      )}
    </View>
  );
}
