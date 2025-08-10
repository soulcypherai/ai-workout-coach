import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY');
}

// Create Supabase client with service role key for server-side auth operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper function to verify user access token
export async function verifySupabaseToken(accessToken) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error) {
      console.error('[Supabase] Token verification failed:', error.message);
      return null;
    }
    return user;
  } catch (error) {
    console.error('[Supabase] Token verification error:', error);
    return null;
  }
}

// Helper function to get user by email
export async function getUserByEmail(email) {
  try {
    const { data, error } = await supabase.auth.admin.getUserByEmail(email);
    if (error) {
      console.error('[Supabase] Get user by email failed:', error.message);
      return null;
    }
    return data.user;
  } catch (error) {
    console.error('[Supabase] Get user by email error:', error);
    return null;
  }
}

export default supabase;