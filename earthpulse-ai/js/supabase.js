/* =========================================================
   EarthPulse AI — Supabase client wrapper
   Loads the Supabase JS SDK from CDN and exposes a small
   helper API used by app.js, ai.js, and nasa.js.
   Only the PUBLIC url + publishable (anon) key ever live here.
   ========================================================= */

// ---- Configuration ----
// These are safe to expose in the browser: the Supabase anon key
// is a publishable key, not a secret. Row Level Security (see
// supabase/migrations/001_initial_schema.sql) enforces access control.
// Replace with your project values, or set them via a small inline
// <script> block in each HTML file / build-time env injection.
window.EARTHPULSE_CONFIG = window.EARTHPULSE_CONFIG || {
  SUPABASE_URL: "https://qlceawivvxawymhtsxxs.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsY2Vhd2l2dnhhd3ltaHRzeHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTYyMTMsImV4cCI6MjEwMzUzMjIxM30.M8yIpjAhVlxqc6IUP45IEkKbEf8h5Dmw_eRPJdkZyek",
};

const EarthPulseDB = (() => {
  let client = null;
  let configured = false;

  function init() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.EARTHPULSE_CONFIG;
    const looksConfigured =
      SUPABASE_URL && SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
      !SUPABASE_ANON_KEY.includes("YOUR-SUPABASE");

    if (!looksConfigured || typeof window.supabase === "undefined") {
      configured = false;
      return null;
    }
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      configured = true;
    } catch (e) {
      console.warn("[EarthPulse] Supabase init failed, falling back to demo mode:", e);
      configured = false;
    }
    return client;
  }

  function isConfigured() {
    return configured;
  }

  // ---- Auth ----
  async function getUser() {
    if (!configured) return null;
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data.user;
  }

  async function signInWithEmail(email, password) {
    if (!configured) throw new Error("Supabase is not configured.");
    return client.auth.signInWithPassword({ email, password });
  }

  async function signUpWithEmail(email, password) {
    if (!configured) throw new Error("Supabase is not configured.");
    return client.auth.signUp({ email, password });
  }

  async function signOut() {
    if (!configured) return;
    return client.auth.signOut();
  }

  function onAuthChange(cb) {
    if (!configured) return;
    client.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
  }

  // ---- Saved locations ----
  async function listSavedLocations() {
    if (!configured) return [];
    const user = await getUser();
    if (!user) return [];
    const { data, error } = await client
      .from("saved_locations")
      .select("id, label, latitude, longitude, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[EarthPulse] listSavedLocations error:", error.message);
      return [];
    }
    return data || [];
  }

  async function saveLocation(label, latitude, longitude) {
    if (!configured) throw new Error("Sign in to save locations.");
    const user = await getUser();
    if (!user) throw new Error("Sign in to save locations.");
    const { data, error } = await client
      .from("saved_locations")
      .insert({ user_id: user.id, label, latitude, longitude })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteSavedLocation(id) {
    if (!configured) return;
    const user = await getUser();
    if (!user) return;
    const { error } = await client
      .from("saved_locations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
  }

  // ---- Edge Function invocation ----
  // Falls through to null (caller uses demo data) if Supabase isn't configured.
  async function invokeFunction(name, body) {
    if (!configured) return null;
    const { data, error } = await client.functions.invoke(name, { body });
    if (error) {
      console.warn(`[EarthPulse] Edge Function "${name}" error:`, error.message);
      return null;
    }
    return data;
  }

  return {
    init,
    isConfigured,
    getUser,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    onAuthChange,
    listSavedLocations,
    saveLocation,
    deleteSavedLocation,
    invokeFunction,
  };
})();
