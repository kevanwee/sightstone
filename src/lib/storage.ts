import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client-side Supabase (for auth + public reads)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase with elevated privileges (for file uploads)
export const supabaseAdmin = () =>
  createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

export const CONTRACTS_BUCKET = "contracts";

export async function uploadContractFile(
  file: Buffer,
  fileName: string,
  orgId: string,
  playbookId: string
): Promise<string> {
  const admin = supabaseAdmin();
  const path = `${orgId}/${playbookId}/${Date.now()}-${fileName}`;

  const { error } = await admin.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, file, { upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = admin.storage.from(CONTRACTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
