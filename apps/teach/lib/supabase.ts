// lib/supabase.ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
}

if (!SUPABASE_KEY) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_KEY");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Explicit AsyncStorage adapter so sessions survive a cold start on device
    // instead of relying on the SDK's implicit default.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});