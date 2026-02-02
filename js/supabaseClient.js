// js/supabaseClient.js
const SUPABASE_URL = "https://edkutwxjjrzqhfephiys.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OTon5bWCuMDV_Lzcdpe-yg_fQL5o4or";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
