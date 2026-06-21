#!/usr/bin/env node

/**
 * Open the backend API documentation in the default browser
 */

const { exec } = require('child_process');
const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const DOCS_URL = `${BACKEND_URL}/docs`;

console.log('📚 Opening API documentation...\n');

// First check if server is running
const request = http.get(BACKEND_URL, (res) => {
  if (res.statusCode === 200) {
    console.log('✅ Backend is running');
    console.log(`🌐 Opening ${DOCS_URL}\n`);
    
    // Open in default browser
    const command = process.platform === 'win32' 
      ? `start ${DOCS_URL}`
      : process.platform === 'darwin'
      ? `open ${DOCS_URL}`
      : `xdg-open ${DOCS_URL}`;
    
    exec(command, (error) => {
      if (error) {
        console.log('❌ Could not open browser automatically');
        console.log(`\nPlease open this URL manually: ${DOCS_URL}\n`);
        process.exit(1);
      } else {
        console.log('✅ Documentation opened in browser!\n');
        process.exit(0);
      }
    });
  } else {
    console.log(`❌ Backend responded with status ${res.statusCode}`);
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.log('❌ Backend server is not running!');
  console.log(`\nError: ${err.message}\n`);
  console.log('To start the backend:');
  console.log('  1. cd backend');
  console.log('  2. venv\\Scripts\\activate  (Windows)');
  console.log('     source venv/bin/activate  (Mac/Linux)');
  console.log('  3. uvicorn app.main:app --reload\n');
  console.log(`Then open: ${DOCS_URL}\n`);
  process.exit(1);
});

request.setTimeout(5000, () => {
  request.destroy();
  console.log('❌ Backend server is not responding');
  console.log(`\nPlease start the backend first, then open: ${DOCS_URL}\n`);
  process.exit(1);
});

