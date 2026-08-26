import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qyjnfxgonjnjgdkecfdl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8JnoBBxeBijBDRaDAeEOCQ_0wNQTlfr';

// Fora do artefato, o supabase-js já usa localStorage por padrão para persistir a sessão —
// não é mais necessário o adaptador customizado que usávamos com window.storage.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
