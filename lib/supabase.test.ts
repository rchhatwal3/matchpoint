jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js');
  return { ...actual, createClient: jest.fn(actual.createClient) };
});

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

  it('trims trailing newlines and surrounding whitespace before building the client', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co\n';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '  anon-key\n';
    const { supabaseEnabled, supabase } = require('./supabase');
    const { createClient } = require('@supabase/supabase-js');

    expect(supabaseEnabled).toBe(true);
    expect(supabase).not.toBeNull();
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.anything()
    );
  });

  it('treats whitespace-only values as absent and falls back to offline mode', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '   \n';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '\n\t';
    const { supabaseEnabled, supabase } = require('./supabase');
    const { createClient } = require('@supabase/supabase-js');

    expect(supabaseEnabled).toBe(false);
    expect(supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('leaves normal values unchanged', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    require('./supabase');
    const { createClient } = require('@supabase/supabase-js');

    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.anything()
    );
  });
});
