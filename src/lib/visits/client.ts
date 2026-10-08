import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
export const visitsRequest = createAuthenticatedRequester(supabase);
