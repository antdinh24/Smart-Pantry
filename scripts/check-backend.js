#!/usr/bin/env node

/**
 * Check if the backend server is running
 */

const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const HEALTH_ENDPOINT = `${BACKEND_URL}/`;

console.log('🔍 Checking backend server...\n');

const request = http.get(HEALTH_ENDPOINT, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Backend server is running!');
      console.log(`📍 URL: ${BACKEND_URL}`);
      console.log(`📚 Docs: ${BACKEND_URL}/docs\n`);
      
      try {
        const json = JSON.parse(data);
        console.log('Server response:', json);
      } catch (e) {
        console.log('Server response:', data);
      }
      
      process.exit(0);
    } else {
      console.log(`❌ Backend responded with status ${res.statusCode}`);
      process.exit(1);
    }
  });
});

request.on('error', (err) => {
  console.log('❌ Backend server is not running!');
  console.log(`\nError: ${err.message}\n`);
  console.log('To start the backend:');
  console.log('  1. cd backend');
  console.log('  2. venv\\Scripts\\activate  (Windows)');
  console.log('     source venv/bin/activate  (Mac/Linux)');
  console.log('  3. uvicorn app.main:app --reload\n');
  process.exit(1);
});

request.setTimeout(5000, () => {
  request.destroy();
  console.log('❌ Backend server is not responding (timeout)');
  console.log('\nMake sure the backend is running on', BACKEND_URL);
  process.exit(1);
});

