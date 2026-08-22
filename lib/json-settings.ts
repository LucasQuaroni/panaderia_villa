import type { SupabaseClient } from '@supabase/supabase-js'

export async function readJsonSetting<T>(supabase: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('site_content')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error || !data?.value) return fallback
  try {
    return JSON.parse(data.value) as T
  } catch {
    return fallback
  }
}

export async function writeJsonSetting<T>(supabase: SupabaseClient, key: string, value: T): Promise<string | null> {
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, value: JSON.stringify(value) })
  return error?.message ?? null
}
