import { Environment } from '../app/core/config/environment.model';

export const environment: Environment = {
  production: true,
  supabase: {
    url: 'https://hlehsgwsjphvuyngzjry.supabase.co',
    publishableKey: 'sb_publishable_I2A5p25Tck4RsvBP96THRQ_Xvr1cYZ0',
  },
  providerMode: 'supabase',
};
