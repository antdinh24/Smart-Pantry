#!/usr/bin/env node

/**
 * Interactive setup guide for backend configuration
 */

const http = require('http');
const readline = require('readline');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

console.log('\n🚀 Smart Pantry Backend Setup Guide\n');
console.log('='.repeat(50));
console.log('\nFollow these steps to set up your backend:\n');

const steps = [
  {
    title: 'Step 1: Run migrations in Supabase',
    description: [
      '1. Go to https://app.supabase.com → Your Project',
      '2. Click SQL Editor → New Query',
      '3. Copy/paste each migration file from backend/migrations/ in order:',
      '   - 001_create_users_table.sql',
      '   - 002_create_recipes_table.sql',
      '   - 003_create_ingredients_table.sql',
      '   - 004_create_receipts_table.sql',
      '4. Click Run for each migration',
      '',
      'Or use the Python script:',
      '  cd backend && python run_migrations.py'
    ]
  },
  {
    title: 'Step 2: Start backend server',
    description: [
      '1. Navigate to backend directory:',
      '   cd backend',
      '',
      '2. Activate virtual environment:',
      '   Windows: venv\\Scripts\\activate',
      '   Mac/Linux: source venv/bin/activate',
      '',
      '3. Start the server:',
      '   uvicorn app.main:app --reload',
      '',
      'The server will run at: http://localhost:8000'
    ]
  },
  {
    title: 'Step 3: Visit API documentation',
    description: [
      `Open in browser: ${BACKEND_URL}/docs`,
      '',
      'Or run: npm run backend:docs'
    ]
  },
  {
    title: 'Step 4: Register a test user',
    description: [
      'Use the interactive docs at /docs or use curl:',
      '',
      'curl -X POST http://localhost:8000/api/v1/auth/register \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"email": "test@example.com", "password": "TestPassword123!"}\'',
      '',
      'Save the access_token from the response!'
    ]
  },
  {
    title: 'Step 5: Login with test user',
    description: [
      'curl -X POST http://localhost:8000/api/v1/auth/login \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"email": "test@example.com", "password": "TestPassword123!"}\'',
      '',
      'Save the access_token from the response!'
    ]
  },
  {
    title: 'Step 6: Access /auth/me with token',
    description: [
      'curl -X GET http://localhost:8000/api/v1/auth/me \\',
      '  -H "Authorization: Bearer YOUR_TOKEN_HERE"',
      '',
      'Replace YOUR_TOKEN_HERE with the token from Step 4 or 5'
    ]
  },
  {
    title: 'Step 7: Connect your React Native app',
    description: [
      '1. Update config/env.ts with your backend URL',
      '2. Make sure EXPO_PUBLIC_API_URL points to http://localhost:8000',
      '3. Start your React Native app:',
      '   npm start',
      '   or',
      '   npm run android / npm run ios'
    ]
  }
];

// Display all steps
steps.forEach((step, index) => {
  console.log(`\n${step.title}`);
  console.log('-'.repeat(50));
  step.description.forEach(line => console.log(line));
});

console.log('\n' + '='.repeat(50));
console.log('\n💡 Quick Commands:');
console.log('  npm run backend:check  - Check if backend is running');
console.log('  npm run backend:docs  - Open API documentation');
console.log('  npm run backend:setup - Show this guide\n');

// Check if backend is running
console.log('🔍 Checking if backend is running...\n');

const request = http.get(BACKEND_URL, (res) => {
  if (res.statusCode === 200) {
    console.log('✅ Backend server is running!');
    console.log(`📍 URL: ${BACKEND_URL}`);
    console.log(`📚 Docs: ${BACKEND_URL}/docs\n`);
  } else {
    console.log(`⚠️  Backend responded with status ${res.statusCode}\n`);
  }
  process.exit(0);
});

request.on('error', (err) => {
  console.log('❌ Backend server is not running');
  console.log('   Start it with: cd backend && uvicorn app.main:app --reload\n');
  process.exit(0);
});

request.setTimeout(3000, () => {
  request.destroy();
  console.log('⚠️  Could not connect to backend (timeout)');
  console.log('   Make sure it\'s running on', BACKEND_URL, '\n');
  process.exit(0);
});

