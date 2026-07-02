import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const KEY = "pending-profile-v1";

type PendingProfile = {
  email: string;
  username: string;
  first_name: string;
  last_name: string;
};

/**
 * When "Confirm email" is enabled, signUp() returns no session, so the app
 * cannot write the chosen username to public.users yet (the anon role has no
 * UPDATE grant — by design). We stash the profile locally and complete it on
 * the first successful sign-in.
 */
export async function savePendingProfile(profile: PendingProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}

/** Idempotent; safe to call after every successful sign-in. */
export async function completePendingProfile(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingProfile;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if ((user.email ?? "").toLowerCase() !== pending.email.toLowerCase()) {
      // Signed in as someone else — keep the stash for the right account.
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({
        first_name: pending.first_name,
        last_name: pending.last_name,
        username: pending.username,
        email: pending.email,
      })
      .eq("userid", user.id);

    // 23505 = username/email already taken; the user can pick a new one in
    // Settings. Either way the stash has served its purpose.
    if (!error || (error as { code?: string }).code === "23505") {
      await AsyncStorage.removeItem(KEY);
    }
  } catch {
    // Non-fatal — retried on the next sign-in.
  }
}
