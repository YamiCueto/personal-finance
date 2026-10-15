import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Singleton Supabase Client Service.
 *
 * Provides a single, reusable SupabaseClient instance initialized with
 * browser-safe public configuration (Project URL and Publishable Key).
 *
 * Security Guarantee:
 * - Operates strictly as a client-side agent with public privileges.
 * - Zero administrative or service_role access.
 * - Future data access will be guarded by PostgreSQL Row Level Security (RLS).
 */
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(
      environment.supabase.url,
      environment.supabase.publishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }

  /**
   * Exposes the underlying SupabaseClient instance.
   */
  get clientInstance(): SupabaseClient {
    return this.client;
  }
}
