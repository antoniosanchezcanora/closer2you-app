import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DEMO, SUPABASE_ANON_KEY as anonKey, SUPABASE_URL as url } from '../config';

// En modo demostración no se conecta a nada y usa datos de ejemplo.
export const supabase: SupabaseClient | null =
  !DEMO && url && anonKey
    ? createClient(url, anonKey, {
        auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;
