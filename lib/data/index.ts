import { hasSupabase } from "../supabase";
import { localStore } from "./local-store";
import { supabaseStore } from "./supabase-store";
import type { DataStore } from "../types";

export const store: DataStore = hasSupabase ? supabaseStore : localStore;
