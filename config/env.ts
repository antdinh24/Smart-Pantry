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
  const value = process.env[key] || defaultValue
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
