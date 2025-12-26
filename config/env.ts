/**
 * Environment Configuration
 *
 * Product Manager Note:
 * - This file loads API URLs and keys from .env file
 * - Keeps secrets out of code
 * - Easy to switch between dev/staging/production
 *
 * How it works:
 * - Expo automatically loads EXPO_PUBLIC_* variables
 * - We access them via process.env
 * - Validation ensures all required keys are present
 */

// Type-safe environment variables
interface Env {
  apiUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
  environment: 'development' | 'staging' | 'production'
  enableAnalytics: boolean
  enableAds: boolean
}

// Load environment variables
const getEnvVar = (key: string, defaultValue?: string): string => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ffe8eaa6-9082-45b1-bd8b-1379e0e455b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'config/env.ts:26',message:'getEnvVar called',data:{key,hasDefault:!!defaultValue,processEnvValue:!!process.env[key],hypothesisId:'C'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  const value = process.env[key] || defaultValue
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ffe8eaa6-9082-45b1-bd8b-1379e0e455b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'config/env.ts:30',message:'getEnvVar result',data:{key,hasValue:!!value,valueLength:value?.length||0,hypothesisId:'C'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value
}

// Export validated configuration
export const env: Env = {
  apiUrl: getEnvVar('EXPO_PUBLIC_API_URL', 'http://localhost:8000/api/v1'),
  supabaseUrl: getEnvVar('EXPO_PUBLIC_SUPABASE_URL', 'https://placeholder.supabase.co'),
  supabaseAnonKey: getEnvVar('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key'),
  environment: (getEnvVar('EXPO_PUBLIC_ENVIRONMENT', 'development') as Env['environment']),
  enableAnalytics: getEnvVar('EXPO_PUBLIC_ENABLE_ANALYTICS', 'false') === 'true',
  enableAds: getEnvVar('EXPO_PUBLIC_ENABLE_ADS', 'false') === 'true',
}

// Helper to check if we're in development
export const isDevelopment = env.environment === 'development'

// Helper to check if we're in production
export const isProduction = env.environment === 'production'

// Log config on startup (dev only)
if (isDevelopment) {
  console.log('📱 App Environment:', {
    environment: env.environment,
    apiUrl: env.apiUrl,
    supabaseUrl: env.supabaseUrl,
  })
}
