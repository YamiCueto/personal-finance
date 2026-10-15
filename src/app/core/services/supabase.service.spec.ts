import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SupabaseService);
  });

  it('should be created and expose a configured Supabase client instance', () => {
    expect(service).toBeTruthy();
    expect(service.clientInstance).toBeTruthy();
    expect(service.clientInstance.auth).toBeDefined();
  });
});
