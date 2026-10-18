/**
 * Public, browser-safe Supabase configuration contract.
 *
 * ==============================================================================
 * SECURITY BOUNDARY:
 * Only browser-safe public configuration (Project URL and Publishable Key)
 * is permitted here.
 *
 * The following privileged credentials MUST NEVER be included in environment files,
 * Angular source code, Git commits, or browser bundles:
 * - service_role key
 * - database passwords
 * - Supabase personal access tokens (sbp_...)
 * - JWT signing secrets
 * - administrative credentials
 * ==============================================================================
 */
export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

export interface Environment {
  readonly production: boolean;
  readonly supabase: SupabaseConfig;
  readonly providerMode?: 'local-demo' | 'supabase';
}
