import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import { useCreateFeedback } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";

const categories = [
  { value: "bug", label: "App bug" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Other feedback" },
] as const;

export default function FeedbackScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<"bug" | "suggestion" | "other">("bug");
  const [message, setMessage] = useState("");
  const submitFeedback = useCreateFeedback();
  const submit = () => {
    if (Array.from(message.trim()).length < 10 || submitFeedback.isPending) return;
    submitFeedback.mutate({ data: {
      category,
      message: message.trim(),
      appVersion: Constants.expoConfig?.version,
      platform: Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web",
    } }, {
      onSuccess: ({ feedback }) => {
        setMessage("");
        Alert.alert("Feedback received", `Thank you for helping improve MOVE Apayao. Your reference is #${feedback.id}.`, [
          { text: "Done", onPress: () => router.back() },
        ]);
      },
      onError: () => Alert.alert("Feedback wasn't sent", "Your message is still here. Check your connection and try again."),
    });
  };
  return (
    <KeyboardAvoidingView style={[styles.page, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={12}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Send feedback</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>Found an app problem or have an idea? Share it with the MOVE Apayao team.</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Feedback type</Text>
        <View style={styles.types}>
          {categories.map(item => (
            <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: category === item.value }} disabled={submitFeedback.isPending} onPress={() => setCategory(item.value)}
              style={[styles.type, { borderColor: category === item.value ? colors.primary : colors.border, backgroundColor: category === item.value ? colors.secondary : colors.card }]}>
              <Text style={{ color: category === item.value ? colors.primaryStrong : colors.foreground, fontFamily: "Inter_600SemiBold" }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>Your message</Text>
        <TextInput accessibilityLabel="Feedback message" value={message} onChangeText={setMessage} editable={!submitFeedback.isPending} maxLength={2000} multiline
          placeholder={category === "bug" ? "What happened, and what were you trying to do?" : "Tell us what could be better."}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.message, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>At least 10 characters · {Array.from(message).length}/2,000</Text>
        <Button title="Send feedback" onPress={submit} loading={submitFeedback.isPending} disabled={Array.from(message.trim()).length < 10} icon={<Feather name="send" size={18} color={colors.primaryForeground} />} />
        <Pressable onPress={() => router.push("/report" as never)} style={{ paddingVertical: 24 }}>
          <Text style={{ color: colors.primaryStrong, textAlign: "center", fontFamily: "Inter_600SemiBold" }}>Need to report a ride or safety issue?</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 20 },
  intro: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 23, marginBottom: 24 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 12 },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 28 },
  type: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12 },
  message: { borderWidth: 1, borderRadius: 14, minHeight: 180, padding: 16, fontSize: 15, fontFamily: "Inter_400Regular", textAlignVertical: "top" },
  hint: { fontSize: 12, marginTop: 8, marginBottom: 24 },
});
