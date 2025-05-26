#!/usr/bin/env node

/**
 * Database Switching Utility
 * Helps switch between SQLite and MongoDB configurations
 */

const fs = require('fs');
const path = require('path');

const DB_TYPE = process.argv[2];

if (!DB_TYPE || !['sqlite', 'mongodb'].includes(DB_TYPE.toLowerCase())) {
  console.log('❌ Usage: node switch-db.js <sqlite|mongodb>');
  process.exit(1);
}

const dbType = DB_TYPE.toLowerCase();
const envPath = path.join(__dirname, '..', '.env');

console.log(`🔄 Switching to ${dbType.toUpperCase()}...\n`);

try {
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  // Update or add DB_TYPE
  if (envContent.includes('DB_TYPE=')) {
    envContent = envContent.replace(/^DB_TYPE=.*/m, `DB_TYPE=${dbType}`);
  } else {
    envContent += `\nDB_TYPE=${dbType}\n`;
  }
  
  if (dbType === 'mongodb') {
    // Ensure MongoDB URL is set
    if (!envContent.includes('MONGODB_URL=')) {
      envContent += 'MONGODB_URL=mongodb://localhost:27017\n';
    }
    
    console.log('📝 Configuration updated for MongoDB');
    console.log('');
    console.log('🔧 MongoDB Setup Requirements:');
    console.log('  1. Install MongoDB locally or use MongoDB Atlas');
    console.log('  2. Update MONGODB_URL in .env if needed');
    console.log('  3. Ensure MongoDB is running');
    console.log('');
    console.log('🧪 Test connection with: npm run test:connection');
  } else {
    console.log('📝 Configuration updated for SQLite');
    console.log('');
    console.log('✅ SQLite Setup:');
    console.log('  • No additional setup required');
    console.log('  • Database will be created automatically');
    console.log('  • File location: ./db/mockserver.db');
  }
  
  fs.writeFileSync(envPath, envContent);
  
  console.log('');
  console.log(`✅ Successfully switched to ${dbType.toUpperCase()}`);
  console.log('');
  console.log('🚀 Start the server with: npm start');
  console.log('📊 Check health with: npm run health');
  
} catch (error) {
  console.error('❌ Error switching database configuration:', error.message);
  process.exit(1);
}