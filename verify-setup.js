/**
 * Environment Setup Verification Script
 * Run with: node verify-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Environment Setup...\n');

// Check root .env file
console.log('📱 EXPO APP ENVIRONMENT:');
const rootEnvPath = path.join(__dirname, '.env');
if (fs.existsSync(rootEnvPath)) {
  const envContent = fs.readFileSync(rootEnvPath, 'utf8');
  
  const hasSupabaseUrl = envContent.includes('EXPO_PUBLIC_SUPABASE_URL=');
  const hasAnonKey = envContent.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY=');
  
  if (hasSupabaseUrl) {
    const urlMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/);
    const url = urlMatch ? urlMatch[1].trim() : '';
    console.log('  ✅ EXPO_PUBLIC_SUPABASE_URL is set');
    if (url.includes('jdpmkjysftxnmcpjkmge')) {
      console.log(`     URL: ${url.substring(0, 50)}...`);
    }
  } else {
    console.log('  ❌ EXPO_PUBLIC_SUPABASE_URL is missing');
  }
  
  if (hasAnonKey) {
    const keyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
    const key = keyMatch ? keyMatch[1].trim() : '';
    console.log('  ✅ EXPO_PUBLIC_SUPABASE_ANON_KEY is set');
    if (key.startsWith('eyJ')) {
      console.log('     Key format: Valid JWT token');
    }
  } else {
    console.log('  ❌ EXPO_PUBLIC_SUPABASE_ANON_KEY is missing');
  }
} else {
  console.log('  ❌ .env file not found in root directory');
}

// Check package.json
console.log('\n📦 DEPENDENCIES:');
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (pkg.dependencies && pkg.dependencies['@supabase/supabase-js']) {
    console.log('  ✅ @supabase/supabase-js is installed');
  } else {
    console.log('  ❌ @supabase/supabase-js is missing from dependencies');
  }
  
  if (pkg.dependencies && pkg.dependencies['axios']) {
    console.log('  ✅ axios is installed');
  } else {
    console.log('  ❌ axios is missing from dependencies');
  }
} else {
  console.log('  ❌ package.json not found');
}

// Check config files
console.log('\n⚙️  CONFIGURATION FILES:');
const configFiles = [
  { path: 'config/env.ts', name: 'config/env.ts' },
  { path: 'services/supabase.ts', name: 'services/supabase.ts' },
  { path: 'backend/app/config.py', name: 'backend/app/config.py' }
];

configFiles.forEach(file => {
  const filePath = path.join(__dirname, file.path);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file.name} exists`);
  } else {
    console.log(`  ❌ ${file.name} missing`);
  }
});

// Backend .env check
console.log('\n🔧 BACKEND ENVIRONMENT:');
const backendEnvPath = path.join(__dirname, 'backend', '.env');
if (fs.existsSync(backendEnvPath)) {
  console.log('  ✅ backend/.env file exists');
  console.log('  ⚠️  Note: Verify manually that it contains:');
  console.log('     - SUPABASE_URL');
  console.log('     - SUPABASE_KEY (anon key)');
  console.log('     - SUPABASE_SERVICE_KEY (service_role key)');
} else {
  console.log('  ⚠️  backend/.env file not found (may be gitignored)');
  console.log('     Ensure it contains the required Supabase variables');
}

console.log('\n✨ Verification complete!\n');

