import { Environment } from '../app/core/config/environment.model';

export const environment: Environment = {
  production: false,
  supabase: {
    url: 'http://127.0.0.1:54421',
    publishableKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  },
  providerMode: 'supabase',
};
