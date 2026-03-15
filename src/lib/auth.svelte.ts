import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = !!(url && key)

export let supabase: SupabaseClient | null = null
if (supabaseConfigured) {
  supabase = createClient(url, key)
}

export function createAuthState() {
  let user = $state<User | null>(null)
  let session = $state<Session | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)

  if (supabase) {
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (err) {
        error = err.message
      } else {
        session = data.session
        user = data.session?.user ?? null
      }
      loading = false
    })

    supabase.auth.onAuthStateChange((_event, s) => {
      session = s
      user = s?.user ?? null
    })
  } else {
    loading = false
  }

  async function signInWithGoogle() {
    if (!supabase) return
    error = null
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (err) error = err.message
  }

  async function signOut() {
    if (!supabase) return
    error = null
    const { error: err } = await supabase.auth.signOut()
    if (err) error = err.message
  }

  function clearError() {
    error = null
  }

  return {
    get user() { return user },
    get session() { return session },
    get loading() { return loading },
    get error() { return error },
    signInWithGoogle,
    signOut,
    clearError,
  }
}
