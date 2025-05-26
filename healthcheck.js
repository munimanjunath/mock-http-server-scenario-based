#!/usr/bin/env node

/**
 * Health Check Utility
 * Tests server health and database connectivity
 */

const http = require('http');
const { getDB, getDatabaseType } = require('./db');

async function checkHealth() {
  console.log('🔍 Running health checks...\n');
  
  let allChecksPass = true;
  
  // Check 1: Database connectivity
  try {
    console.log('📊 Checking database connectivity...');
    const db = await getDB();
    const dbType = getDatabaseType();
    
    if (dbType === 'mongodb') {
      await db.admin().ping();
    } else {
      // For SQLite, just check if we can query
      await new Promise((resolve, reject) => {
        db.get('SELECT 1', [], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    console.log(`✅ Database (${dbType}) is healthy`);
  } catch (error) {
    console.log(`❌ Database check failed: ${error.message}`);
    allChecksPass = false;
  }
  
  // Check 2: HTTP server
  try {
    console.log('🌐 Checking HTTP server...');
    
    const healthCheck = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3000/health', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const healthData = JSON.parse(data);
            resolve({ statusCode: res.statusCode, data: healthData });
          } catch (parseError) {
            reject(new Error(`Invalid JSON response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });
    });
    
    if (healthCheck.statusCode === 200) {
      console.log('✅ HTTP server is healthy');
      console.log(`   Version: ${healthCheck.data.version}`);
      console.log(`   Database: ${healthCheck.data.database_type}`);
      console.log(`   Uptime: ${Math.round(healthCheck.data.uptime)}s`);
    } else {
      throw new Error(`HTTP health check failed with status ${healthCheck.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ HTTP server check failed: ${error.message}`);
    allChecksPass = false;
  }
  
  // Check 3: File system permissions
  try {
    console.log('📁 Checking file system permissions...');
    const fs = require('fs');
    const path = require('path');
    
    const directories = ['uploads', 'files', 'logs', 'db'];
    for (const dir of directories) {
      const dirPath = path.join(__dirname, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Test write permissions
      const testFile = path.join(dirPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    }
    
    console.log('✅ File system permissions are correct');
  } catch (error) {
    console.log(`❌ File system check failed: ${error.message}`);
    allChecksPass = false;
  }
  
  console.log();
  
  if (allChecksPass) {
    console.log('🎉 All health checks passed!');
    process.exit(0);
  } else {
    console.log('💥 Some health checks failed!');
    process.exit(1);
  }
}

// Run health check if this script is called directly
if (require.main === module) {
  checkHealth().catch(error => {
    console.error('❌ Health check script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { checkHealth };