describe('supabaseEnabled', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('is true and builds a client when both env vars are present', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const { supabaseEnabled, supabase } = require('./supabase');
    expect(supabaseEnabled).toBe(true);
    expect(supabase).not.toBeNull();
  });

  it('is false and exposes a null client when env vars are missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const { supabaseEnabled, supabase } = require('./supabase');
    expect(supabaseEnabled).toBe(false);
    expect(supabase).toBeNull();
  });
});
