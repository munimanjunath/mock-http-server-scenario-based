// migrate-db.js - Run this script to add file support to existing databases
const { getDB, getDatabaseType } = require('./db');
const logger = require('./logger');

async function migrateDatabase() {
  console.log('🔄 Starting database migration for file-based mock support...');
  
  try {
    const db = await getDB();
    const dbType = getDatabaseType();
    
    if (dbType === 'mongodb') {
      console.log('📊 Migrating MongoDB database...');
      
      // Add file_id field to existing documents if not present
      const mockCollection = db.collection('mock_responses');
      const result = await mockCollection.updateMany(
        { file_id: { $exists: false } },
        { $set: { file_id: null } }
      );
      
      // Create index for file_id
      await mockCollection.createIndex({ file_id: 1 });
      
      console.log(`✅ MongoDB migration complete. Updated ${result.modifiedCount} documents.`);
    } else {
      console.log('📊 Migrating SQLite database...');
      
      // Check if file_id column exists
      const checkColumn = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(mock_responses)", (error, columns) => {
          if (error) reject(error);
          else resolve(columns);
        });
      });
      
      const hasFileId = checkColumn.some(col => col.name === 'file_id');
      
      if (!hasFileId) {
        // Add file_id column
        await new Promise((resolve, reject) => {
          db.run(`
            ALTER TABLE mock_responses 
            ADD COLUMN file_id INTEGER REFERENCES files(id)
          `, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        
        // Create index
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_mock_responses_file_id 
            ON mock_responses(file_id)
          `, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        
        console.log('✅ SQLite migration complete. Added file_id column and index.');
      } else {
        console.log('ℹ️ SQLite database already has file_id column. No migration needed.');
      }
    }
    
    console.log('🎉 Database migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    logger.error('Database migration failed', { error: error.message });
    process.exit(1);
  }
}

// Run migration
migrateDatabase();