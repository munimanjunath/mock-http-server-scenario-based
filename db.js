const logger = require('./logger');

// Database abstraction layer supporting both SQLite and MongoDB
let dbType = process.env.DB_TYPE || 'sqlite'; // Default to SQLite for simplicity
let db = null;
let client = null;

// SQLite specific imports and setup
let sqlite3 = null;
let sqliteDb = null;

// MongoDB specific imports and setup
let MongoClient = null;
let mongodb = null;

const DB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'mockserver';
const SQLITE_PATH = process.env.SQLITE_PATH || '../db/mockserver.db';

// Main connection function used by test:connection script
async function connectDB() {
  console.log(dbType);
  logger.info('Initializing database', { type: dbType });
  
  if (dbType === 'mongodb') {
    try {
      MongoClient = require('mongodb').MongoClient;
      mongodb = await connectMongoDB();
      return mongodb;
    } catch (error) {
      logger.error('MongoDB connection failed', { error: error.message });
      throw error;
    }
  } else {
    return await connectSQLite();
  }
}

async function initializeDatabase() {
  logger.info('Initializing database', { type: dbType });
  
  if (dbType === 'mongodb') {
    try {
      MongoClient = require('mongodb').MongoClient;
      const db = await connectMongoDB();
      await updateDatabaseSchema();
      return db;
    } catch (error) {
      logger.error('MongoDB module not found, falling back to SQLite', { error: error.message });
      dbType = 'sqlite';
      const db = await connectSQLite();
      await updateDatabaseSchema();
      return db;
    }
  } else {
    const db = await connectSQLite();
    await updateDatabaseSchema();
    return db;
  }
}

async function connectMongoDB() {
  try {
    logger.info('Connecting to MongoDB', { url: DB_URL.replace(/:[^:@]*@/, ':***@') });
    
    if (mongodb) return mongodb;
    
    client = new MongoClient(DB_URL);
    await client.connect();
    mongodb = client.db(DB_NAME);
    
    // Create indexes for better performance
    await mongodb.collection('mock_responses').createIndex({ scenario: 1, method: 1, path: 1 });
    await mongodb.collection('mock_responses').createIndex({ scenario: 1, method: 1, path: 1, query: 1, rule: 1 }, { unique: true });
    await mongodb.collection('request_history').createIndex({ timestamp: -1 });
    await mongodb.collection('request_history').createIndex({ scenario_before: 1 });
    await mongodb.collection('files').createIndex({ filename: 1, scenario: 1 });
    await mongodb.collection('mock_responses').createIndex({ file_id: 1 });
    
    logger.info('Connected to MongoDB successfully');
    return mongodb;
  } catch (error) {
    logger.error('MongoDB connection failed', { error: error.message });
    throw error;
  }
}

async function connectSQLite() {
  try {
    logger.info('Connecting to SQLite', { path: SQLITE_PATH });
    
    if (sqliteDb) return sqliteDb;
    
    sqlite3 = require('sqlite3').verbose();
    
    // Ensure directory exists
    const dbDir = require('path').dirname(SQLITE_PATH);
    if (!require('fs').existsSync(dbDir)) {
      require('fs').mkdirSync(dbDir, { recursive: true });
      logger.info('Created SQLite database directory', { path: dbDir });
    }
    
    sqliteDb = new sqlite3.Database(SQLITE_PATH);
    
    // Initialize tables
    await initializeSQLiteTables();
    
    logger.info('Connected to SQLite successfully');
    return sqliteDb;
  } catch (error) {
    logger.error('SQLite connection failed', { error: error.message });
    throw error;
  }
}

async function initializeSQLiteTables() {
  return new Promise((resolve, reject) => {
    const schema = `
      CREATE TABLE IF NOT EXISTS mock_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        query TEXT,
        rule TEXT,
        response TEXT,
        response_headers TEXT,
        status_code INTEGER DEFAULT 200,
        file_id INTEGER REFERENCES files(id),
        next_scenario TEXT,
        delay_type TEXT DEFAULT 'none',
        delay_fixed INTEGER DEFAULT 0,
        delay_min INTEGER DEFAULT 0,
        delay_max INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scenario, method, path, query, rule)
      );
      
      CREATE TABLE IF NOT EXISTS request_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        scenario_before TEXT,
        scenario_after TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        query_string TEXT,
        request_headers TEXT,
        request_body TEXT,
        response_status INTEGER,
        response_headers TEXT,
        response_body TEXT,
        matched_mock_id TEXT,
        processing_time_ms INTEGER,
        delay_applied_ms INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        scenario TEXT,
        method TEXT DEFAULT 'GET',
        endpoint_path TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(filename, scenario)
      );
      
      CREATE INDEX IF NOT EXISTS idx_mock_responses_scenario_method_path 
        ON mock_responses(scenario, method, path);
      CREATE INDEX IF NOT EXISTS idx_request_history_timestamp 
        ON request_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_files_scenario_filename 
        ON files(scenario, filename);
      CREATE INDEX IF NOT EXISTS idx_mock_responses_file_id 
        ON mock_responses(file_id);
    `;
    
    sqliteDb.exec(schema, (error) => {
      if (error) {
        logger.error('Failed to initialize SQLite tables', { error: error.message });
        reject(error);
      } else {
        logger.info('SQLite tables initialized successfully');
        resolve();
      }
    });
  });
}

async function updateDatabaseSchema() {
  if (dbType === 'mongodb') {
    try {
      const database = await getDB();
      // MongoDB is schemaless, but we can create indexes
      await database.collection('mock_responses').createIndex({ file_id: 1 });
      logger.info('MongoDB schema updated for file support');
    } catch (error) {
      logger.error('Failed to update MongoDB schema', { error: error.message });
    }
  } else {
    // SQLite schema update - check if columns exist first
    const database = await getDB();
    
    // Check and add file_id column
    await new Promise((resolve) => {
      database.all("PRAGMA table_info(mock_responses)", (error, columns) => {
        if (error) {
          logger.error('Failed to get table info', { error: error.message });
          resolve();
          return;
        }
        
        const hasFileId = columns.some(col => col.name === 'file_id');
        if (!hasFileId) {
          database.run(`
            ALTER TABLE mock_responses 
            ADD COLUMN file_id INTEGER REFERENCES files(id)
          `, (alterError) => {
            if (alterError) {
              logger.error('Failed to add file_id column', { error: alterError.message });
            } else {
              logger.info('Added file_id column to mock_responses');
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
    
    // Check and add response_headers column
    await new Promise((resolve) => {
      database.all("PRAGMA table_info(mock_responses)", (error, columns) => {
        if (error) {
          logger.error('Failed to get table info', { error: error.message });
          resolve();
          return;
        }
        
        const hasResponseHeaders = columns.some(col => col.name === 'response_headers');
        if (!hasResponseHeaders) {
          database.run(`
            ALTER TABLE mock_responses 
            ADD COLUMN response_headers TEXT
          `, (alterError) => {
            if (alterError) {
              logger.error('Failed to add response_headers column', { error: alterError.message });
            } else {
              logger.info('Added response_headers column to mock_responses');
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
    
    // Check and add status_code column
    await new Promise((resolve) => {
      database.all("PRAGMA table_info(mock_responses)", (error, columns) => {
        if (error) {
          logger.error('Failed to get table info', { error: error.message });
          resolve();
          return;
        }
        
        const hasStatusCode = columns.some(col => col.name === 'status_code');
        if (!hasStatusCode) {
          database.run(`
            ALTER TABLE mock_responses 
            ADD COLUMN status_code INTEGER DEFAULT 200
          `, (alterError) => {
            if (alterError) {
              logger.error('Failed to add status_code column', { error: alterError.message });
            } else {
              logger.info('Added status_code column to mock_responses');
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
    
    // Check and add delay columns
    const delayColumns = ['delay_type', 'delay_fixed', 'delay_min', 'delay_max'];
    for (const columnName of delayColumns) {
      await new Promise((resolve) => {
        database.all("PRAGMA table_info(mock_responses)", (error, columns) => {
          if (error) {
            logger.error('Failed to get table info', { error: error.message });
            resolve();
            return;
          }
          
          const hasColumn = columns.some(col => col.name === columnName);
          if (!hasColumn) {
            let columnDef = '';
            switch(columnName) {
              case 'delay_type':
                columnDef = "ALTER TABLE mock_responses ADD COLUMN delay_type TEXT DEFAULT 'none'";
                break;
              case 'delay_fixed':
                columnDef = "ALTER TABLE mock_responses ADD COLUMN delay_fixed INTEGER DEFAULT 0";
                break;
              case 'delay_min':
                columnDef = "ALTER TABLE mock_responses ADD COLUMN delay_min INTEGER DEFAULT 0";
                break;
              case 'delay_max':
                columnDef = "ALTER TABLE mock_responses ADD COLUMN delay_max INTEGER DEFAULT 0";
                break;
            }
            
            database.run(columnDef, (alterError) => {
              if (alterError) {
                logger.error(`Failed to add ${columnName} column`, { error: alterError.message });
              } else {
                logger.info(`Added ${columnName} column to mock_responses`);
              }
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    }
    
    // Check and add delay_applied_ms to request_history
    await new Promise((resolve) => {
      database.all("PRAGMA table_info(request_history)", (error, columns) => {
        if (error) {
          logger.error('Failed to get table info', { error: error.message });
          resolve();
          return;
        }
        
        const hasDelayApplied = columns.some(col => col.name === 'delay_applied_ms');
        if (!hasDelayApplied) {
          database.run(`
            ALTER TABLE request_history 
            ADD COLUMN delay_applied_ms INTEGER DEFAULT 0
          `, (alterError) => {
            if (alterError) {
              logger.error('Failed to add delay_applied_ms column', { error: alterError.message });
            } else {
              logger.info('Added delay_applied_ms column to request_history');
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }
}

async function getDB() {
  if (!db && !mongodb && !sqliteDb) {
    db = await initializeDatabase();
  }
  return dbType === 'mongodb' ? mongodb : sqliteDb;
}

// Universal database operations
class DatabaseAdapter {
  static async createMock(mockData) {
    return this.createMockWithFile({
      ...mockData,
      fileId: null
    });
  }
  
  static async createMockWithFile(mockData) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('mock_responses');
        
        const filter = {
          scenario: mockData.scenario,
          method: mockData.method,
          path: mockData.path,
          query: mockData.query || '',
          rule: mockData.rule || null
        };
        
        const document = {
          ...filter,
          response: mockData.response ? (typeof mockData.response === 'string' ? mockData.response : JSON.stringify(mockData.response)) : null,
          response_headers: mockData.responseHeaders ? (typeof mockData.responseHeaders === 'string' ? mockData.responseHeaders : JSON.stringify(mockData.responseHeaders)) : null,
          status_code: mockData.statusCode || 200,
          file_id: mockData.fileId || null,
          next_scenario: mockData.nextScenario || null,
          delay_type: mockData.delayType || 'none',
          delay_fixed: mockData.delayFixed || 0,
          delay_min: mockData.delayMin || 0,
          delay_max: mockData.delayMax || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const result = await collection.replaceOne(filter, document, { upsert: true });
        logger.logDBOperation('createMockWithFile', { 
          scenario: mockData.scenario, 
          method: mockData.method, 
          path: mockData.path, 
          hasFile: !!mockData.fileId,
          hasHeaders: !!mockData.responseHeaders,
          statusCode: mockData.statusCode || 200,
          delayType: mockData.delayType || 'none'
        }, Date.now() - startTime);
        
        return { id: result.upsertedId || 'updated', success: true };
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          const stmt = database.prepare(`
            INSERT OR REPLACE INTO mock_responses 
            (scenario, method, path, query, rule, response, response_headers, status_code, file_id, next_scenario, delay_type, delay_fixed, delay_min, delay_max, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run([
            mockData.scenario,
            mockData.method,
            mockData.path,
            mockData.query || '',
            mockData.rule || null,
            mockData.response ? (typeof mockData.response === 'string' ? mockData.response : JSON.stringify(mockData.response)) : null,
            mockData.responseHeaders ? (typeof mockData.responseHeaders === 'string' ? mockData.responseHeaders : JSON.stringify(mockData.responseHeaders)) : null,
            mockData.statusCode || 200,
            mockData.fileId || null,
            mockData.nextScenario || null,
            mockData.delayType || 'none',
            mockData.delayFixed || 0,
            mockData.delayMin || 0,
            mockData.delayMax || 0,
            new Date().toISOString()
          ], function(error) {
            if (error) {
              logger.error('SQLite createMockWithFile failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('createMockWithFile', { 
                scenario: mockData.scenario, 
                method: mockData.method, 
                path: mockData.path, 
                hasFile: !!mockData.fileId,
                hasHeaders: !!mockData.responseHeaders,
                statusCode: mockData.statusCode || 200,
                delayType: mockData.delayType || 'none'
              }, Date.now() - startTime);
              resolve({ id: this.lastID, success: true });
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database createMockWithFile operation failed', { error: error.message, mockData });
      throw error;
    }
  }
  
  static async getMocks(filters = {}) {
    return this.getMocksEnhanced(filters);
  }
  
  static async getMocksEnhanced(filters = {}) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('mock_responses');
        
        let query = {};
        if (filters.scenario) query.scenario = filters.scenario;
        if (filters.method) query.method = filters.method;
        
        const options = {
          sort: { scenario: 1, path: 1, method: 1 },
          limit: filters.limit || 100,
          skip: filters.offset || 0
        };
        
        if (filters.summary) {
          options.projection = {
            _id: 1, scenario: 1, method: 1, path: 1, query: 1,
            next_scenario: 1, rule: 1, created_at: 1, updated_at: 1, 
            file_id: 1, response_headers: 1, status_code: 1,
            delay_type: 1, delay_fixed: 1, delay_min: 1, delay_max: 1
          };
        }
        
        const mocks = await collection.find(query, options).toArray();
        logger.logDBOperation('getMocksEnhanced', { filters, count: mocks.length }, Date.now() - startTime);
        
        return mocks;
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          let sql = 'SELECT ';
          if (filters.summary) {
            sql += 'id, scenario, method, path, query, next_scenario, rule, file_id, response_headers, status_code, delay_type, delay_fixed, delay_min, delay_max, created_at, updated_at ';
          } else {
            sql += '* ';
          }
          sql += 'FROM mock_responses WHERE 1=1';
          
          const params = [];
          if (filters.scenario) {
            sql += ' AND scenario = ?';
            params.push(filters.scenario);
          }
          if (filters.method) {
            sql += ' AND method = ?';
            params.push(filters.method);
          }
          
          sql += ' ORDER BY scenario, path, method';
          
          if (filters.limit) {
            sql += ` LIMIT ${filters.limit}`;
          }
          if (filters.offset) {
            sql += ` OFFSET ${filters.offset}`;
          }
          
          database.all(sql, params, (error, rows) => {
            if (error) {
              logger.error('SQLite getMocksEnhanced failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('getMocksEnhanced', { filters, count: rows.length }, Date.now() - startTime);
              resolve(rows);
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database getMocksEnhanced operation failed', { error: error.message, filters });
      throw error;
    }
  }
  
  static async getMockById(id) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('mock_responses');
        const { ObjectId } = require('mongodb');
        
        const mock = await collection.findOne({ _id: new ObjectId(id) });
        logger.logDBOperation('getMockById', { id, found: !!mock }, Date.now() - startTime);
        
        return mock;
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          database.get('SELECT * FROM mock_responses WHERE id = ?', [id], (error, row) => {
            if (error) {
              logger.error('SQLite getMockById failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('getMockById', { id, found: !!row }, Date.now() - startTime);
              resolve(row);
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database getMockById operation failed', { error: error.message, id });
      throw error;
    }
  }
  
  static async deleteMock(id) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('mock_responses');
        const { ObjectId } = require('mongodb');
        
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        logger.logDBOperation('deleteMock', { id, deletedCount: result.deletedCount }, Date.now() - startTime);
        
        return { deletedCount: result.deletedCount };
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          database.run('DELETE FROM mock_responses WHERE id = ?', [id], function(error) {
            if (error) {
              logger.error('SQLite deleteMock failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('deleteMock', { id, deletedCount: this.changes }, Date.now() - startTime);
              resolve({ deletedCount: this.changes });
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database deleteMock operation failed', { error: error.message, id });
      throw error;
    }
  }
  
  static async getScenarios() {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('mock_responses');
        
        const scenarios = await collection.distinct('scenario');
        logger.logDBOperation('getScenarios', { count: scenarios.length }, Date.now() - startTime);
        
        return scenarios.sort();
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          database.all('SELECT DISTINCT scenario FROM mock_responses ORDER BY scenario', [], (error, rows) => {
            if (error) {
              logger.error('SQLite getScenarios failed', { error: error.message });
              reject(error);
            } else {
              const scenarios = rows.map(row => row.scenario);
              logger.logDBOperation('getScenarios', { count: scenarios.length }, Date.now() - startTime);
              resolve(scenarios);
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database getScenarios operation failed', { error: error.message });
      throw error;
    }
  }
  
  static async logRequest(requestData) {
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('request_history');
        
        const document = {
          timestamp: requestData.timestamp,
          scenario_before: requestData.scenarioBefore,
          scenario_after: requestData.scenarioAfter,
          method: requestData.method,
          path: requestData.path,
          query_string: requestData.queryString,
          request_headers: requestData.requestHeaders,
          request_body: requestData.requestBody,
          response_status: requestData.responseStatus,
          response_headers: requestData.responseHeaders,
          response_body: requestData.responseBody,
          matched_mock_id: requestData.matchedMockId,
          processing_time_ms: requestData.processingTime,
          delay_applied_ms: requestData.delayApplied || 0
        };
        
        await collection.insertOne(document);
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          const stmt = database.prepare(`
            INSERT INTO request_history 
            (timestamp, scenario_before, scenario_after, method, path, query_string,
             request_headers, request_body, response_status, response_headers, 
             response_body, matched_mock_id, processing_time_ms, delay_applied_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run([
            requestData.timestamp,
            requestData.scenarioBefore,
            requestData.scenarioAfter,
            requestData.method,
            requestData.path,
            requestData.queryString,
            JSON.stringify(requestData.requestHeaders),
            JSON.stringify(requestData.requestBody),
            requestData.responseStatus,
            JSON.stringify(requestData.responseHeaders),
            JSON.stringify(requestData.responseBody),
            requestData.matchedMockId,
            requestData.processingTime,
            requestData.delayApplied || 0
          ], function(error) {
            if (error) {
              logger.error('SQLite logRequest failed', { error: error.message });
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }
    } catch (error) {
      logger.error('Failed to log request', { error: error.message });
    }
  }
  
  static async getRequestHistory(filters = {}) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('request_history');
        
        const options = {
          sort: { timestamp: -1 },
          limit: filters.limit || 100,
          skip: filters.offset || 0
        };
        
        const history = await collection.find({}, options).toArray();
        const total = await collection.countDocuments();
        
        logger.logDBOperation('getRequestHistory', { count: history.length, total }, Date.now() - startTime);
        
        return { history, total };
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          const limit = filters.limit || 100;
          const offset = filters.offset || 0;
          
          database.all(
            'SELECT * FROM request_history ORDER BY timestamp DESC LIMIT ? OFFSET ?',
            [limit, offset],
            (error, rows) => {
              if (error) {
                logger.error('SQLite getRequestHistory failed', { error: error.message });
                reject(error);
              } else {
                // Parse JSON fields
                const history = rows.map(row => ({
                  ...row,
                  request_headers: JSON.parse(row.request_headers || '{}'),
                  request_body: JSON.parse(row.request_body || 'null'),
                  response_headers: JSON.parse(row.response_headers || '{}'),
                  response_body: JSON.parse(row.response_body || 'null'),
                  delay_applied_ms: row.delay_applied_ms || 0
                }));
                
                // Get total count
                database.get('SELECT COUNT(*) as total FROM request_history', [], (countError, countRow) => {
                  if (countError) {
                    reject(countError);
                  } else {
                    logger.logDBOperation('getRequestHistory', { count: history.length, total: countRow.total }, Date.now() - startTime);
                    resolve({ history, total: countRow.total });
                  }
                });
              }
            }
          );
        });
      }
    } catch (error) {
      logger.error('Database getRequestHistory operation failed', { error: error.message, filters });
      throw error;
    }
  }
  
  static async clearRequestHistory() {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('request_history');
        
        const result = await collection.deleteMany({});
        logger.logDBOperation('clearRequestHistory', { deletedCount: result.deletedCount }, Date.now() - startTime);
        
        return { deletedCount: result.deletedCount };
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          database.run('DELETE FROM request_history', [], function(error) {
            if (error) {
              logger.error('SQLite clearRequestHistory failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('clearRequestHistory', { deletedCount: this.changes }, Date.now() - startTime);
              resolve({ deletedCount: this.changes });
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database clearRequestHistory operation failed', { error: error.message });
      throw error;
    }
  }
  
  static async saveFileInfo(fileInfo) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('files');
        
        const document = {
          filename: fileInfo.filename,
          original_name: fileInfo.originalName,
          file_path: fileInfo.filePath,
          mime_type: fileInfo.mimeType,
          file_size: fileInfo.fileSize,
          scenario: fileInfo.scenario,
          method: fileInfo.method || 'GET',
          endpoint_path: fileInfo.endpointPath,
          created_at: new Date().toISOString()
        };
        
        const result = await collection.replaceOne(
          { filename: fileInfo.filename, scenario: fileInfo.scenario },
          document,
          { upsert: true }
        );
        
        logger.logDBOperation('saveFileInfo', { filename: fileInfo.filename, scenario: fileInfo.scenario }, Date.now() - startTime);
        
        return { id: result.upsertedId || 'updated', success: true };
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          const stmt = database.prepare(`
            INSERT OR REPLACE INTO files 
            (filename, original_name, file_path, mime_type, file_size, scenario, method, endpoint_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run([
            fileInfo.filename,
            fileInfo.originalName,
            fileInfo.filePath,
            fileInfo.mimeType,
            fileInfo.fileSize,
            fileInfo.scenario,
            fileInfo.method || 'GET',
            fileInfo.endpointPath
          ], function(error) {
            if (error) {
              logger.error('SQLite saveFileInfo failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('saveFileInfo', { filename: fileInfo.filename, scenario: fileInfo.scenario }, Date.now() - startTime);
              resolve({ id: this.lastID, success: true });
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database saveFileInfo operation failed', { error: error.message, fileInfo });
      throw error;
    }
  }
  
  static async getFiles(filters = {}) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('files');
        
        let query = {};
        if (filters.scenario) query.scenario = filters.scenario;
        if (filters.filename) query.filename = new RegExp(filters.filename, 'i');
        if (filters.id) {
          const { ObjectId } = require('mongodb');
          query._id = new ObjectId(filters.id);
        }
        
        const files = await collection.find(query).sort({ created_at: -1 }).toArray();
        logger.logDBOperation('getFiles', { filters, count: files.length }, Date.now() - startTime);
        
        return files;
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          let sql = 'SELECT * FROM files WHERE 1=1';
          const params = [];
          
          if (filters.scenario) {
            sql += ' AND scenario = ?';
            params.push(filters.scenario);
          }
          
          if (filters.filename) {
            sql += ' AND filename LIKE ?';
            params.push(`%${filters.filename}%`);
          }
          
          if (filters.id) {
            sql += ' AND id = ?';
            params.push(filters.id);
          }
          
          sql += ' ORDER BY created_at DESC';
          
          database.all(sql, params, (error, rows) => {
            if (error) {
              logger.error('SQLite getFiles failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('getFiles', { filters, count: rows.length }, Date.now() - startTime);
              resolve(rows);
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database getFiles operation failed', { error: error.message, filters });
      throw error;
    }
  }
  
  static async getFileById(id) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('files');
        const { ObjectId } = require('mongodb');
        
        const file = await collection.findOne({ _id: new ObjectId(id) });
        logger.logDBOperation('getFileById', { id, found: !!file }, Date.now() - startTime);
        
        return file;
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          database.get('SELECT * FROM files WHERE id = ?', [id], (error, row) => {
            if (error) {
              logger.error('SQLite getFileById failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('getFileById', { id, found: !!row }, Date.now() - startTime);
              resolve(row);
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database getFileById operation failed', { error: error.message, id });
      throw error;
    }
  }
  
  static async deleteFile(id) {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const collection = database.collection('files');
        const { ObjectId } = require('mongodb');
        
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        logger.logDBOperation('deleteFile', { id, deletedCount: result.deletedCount }, Date.now() - startTime);
        
        return { deletedCount: result.deletedCount };
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          database.run('DELETE FROM files WHERE id = ?', [id], function(error) {
            if (error) {
              logger.error('SQLite deleteFile failed', { error: error.message });
              reject(error);
            } else {
              logger.logDBOperation('deleteFile', { id, deletedCount: this.changes }, Date.now() - startTime);
              resolve({ deletedCount: this.changes });
            }
          });
        });
      }
    } catch (error) {
      logger.error('Database deleteFile operation failed', { error: error.message, id });
      throw error;
    }
  }
  
  static async getStats() {
    const startTime = Date.now();
    
    try {
      if (dbType === 'mongodb') {
        const database = await getDB();
        const mockCollection = database.collection('mock_responses');
        const historyCollection = database.collection('request_history');
        const filesCollection = database.collection('files');
        
        const [scenarios, mockCount, requestCount, fileCount] = await Promise.all([
          mockCollection.distinct('scenario'),
          mockCollection.countDocuments(),
          historyCollection.countDocuments(),
          filesCollection.countDocuments()
        ]);
        
        const stats = {
          database_type: 'MongoDB',
          scenario_count: scenarios.length,
          mock_count: mockCount,
          request_count: requestCount,
          file_count: fileCount
        };
        
        logger.logDBOperation('getStats', stats, Date.now() - startTime);
        return stats;
      } else {
        const database = await getDB();
        
        return new Promise((resolve, reject) => {
          const queries = [
            'SELECT COUNT(DISTINCT scenario) as scenario_count FROM mock_responses',
            'SELECT COUNT(*) as mock_count FROM mock_responses',
            'SELECT COUNT(*) as request_count FROM request_history',
            'SELECT COUNT(*) as file_count FROM files'
          ];
          
          Promise.all(queries.map(query => 
            new Promise((res, rej) => {
              database.get(query, [], (error, row) => {
                if (error) rej(error);
                else res(row);
              });
            })
          )).then(results => {
            const stats = {
              database_type: 'SQLite',
              scenario_count: results[0].scenario_count,
              mock_count: results[1].mock_count,
              request_count: results[2].request_count,
              file_count: results[3].file_count
            };
            
            logger.logDBOperation('getStats', stats, Date.now() - startTime);
            resolve(stats);
          }).catch(error => {
            logger.error('SQLite getStats failed', { error: error.message });
            reject(error);
          });
        });
      }
    } catch (error) {
      logger.error('Database getStats operation failed', { error: error.message });
      throw error;
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down database connections...');
  
  if (client) {
    await client.close();
    logger.info('MongoDB connection closed');
  }
  
  if (sqliteDb) {
    sqliteDb.close();
    logger.info('SQLite connection closed');
  }
  
  process.exit(0);
});

module.exports = { 
  getDB, 
  DatabaseAdapter, 
  getDatabaseType: () => dbType,
  connectDB,
  switchDatabase: (newType) => {
    dbType = newType;
    db = null;
    mongodb = null;
    sqliteDb = null;
    logger.info('Database type switched', { newType });
  }
};