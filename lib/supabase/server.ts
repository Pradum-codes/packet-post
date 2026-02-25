export type SupabaseServerConfig = {
  url: string;
  serviceRoleKey: string;
  schema: string;
};

type SupabaseRequestInit = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: URLSearchParams;
  body?: unknown;
  prefer?: string;
};

export type SupabaseRequestResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

const DEFAULT_SCHEMA = 'public';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function readSupabaseServerConfig(): SupabaseServerConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const schema = process.env.SUPABASE_DB_SCHEMA?.trim() || DEFAULT_SCHEMA;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: trimTrailingSlash(url),
    serviceRoleKey,
    schema,
  };
}

function parseErrorMessage(raw: string) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { message?: string; code?: string; details?: string; hint?: string };
    if (!parsed || typeof parsed !== 'object') {
      return raw;
    }

    const parts = [parsed.message, parsed.details, parsed.hint].filter((part) => typeof part === 'string' && part);
    if (parts.length > 0) {
      return parts.join(' | ');
    }

    return parsed.code || raw;
  } catch {
    return raw;
  }
}

export async function supabaseServerRequest<T>(
  config: SupabaseServerConfig,
  init: SupabaseRequestInit
): Promise<SupabaseRequestResult<T>> {
  const method = init.method || 'GET';
  const query = init.query?.toString();
  const url = `${config.url}/rest/v1/${init.path}${query ? `?${query}` : ''}`;
  const headers = new Headers({
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: 'application/json',
    'Accept-Profile': config.schema,
    'Content-Profile': config.schema,
  });

  if (init.prefer) {
    headers.set('Prefer', init.prefer);
  }

  let body: string | undefined;
  if (typeof init.body !== 'undefined') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      cache: 'no-store',
    });

    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: parseErrorMessage(raw),
      };
    }

    if (!raw) {
      return {
        ok: true,
        status: response.status,
        data: null,
        error: null,
      };
    }

    try {
      return {
        ok: true,
        status: response.status,
        data: JSON.parse(raw) as T,
        error: null,
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: 'Supabase returned non-JSON response.',
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Supabase request failed.',
    };
  }
}
