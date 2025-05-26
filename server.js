// Add this at the very beginning of server.js, before any other requires
const fs = require('fs');
const path = require('path');

console.log('========== ENVIRONMENT DEBUGGING ==========');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
console.log(`Checking for .env file at: ${envPath}`);
if (fs.existsSync(envPath)) {
  console.log('.env file found');
  // Print file content (be careful with sensitive info in production)
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('ENV file content:');
    console.log(envContent);
  } catch (err) {
    console.log('Error reading .env file:', err.message);
  }
} else {
  console.log('❌ ERROR: .env file not found!');
}

// Try to load .env file with dotenv
try {
  console.log('Attempting to load .env with dotenv...');
  require('dotenv').config();
  console.log('dotenv.config() executed');
} catch (err) {
  console.log('❌ ERROR loading dotenv:', err.message);
  console.log('Installing dotenv package may be required: npm install dotenv');
}

// Log environment variables
console.log('Current Environment Variables:');
console.log('DB_TYPE =', process.env.DB_TYPE);
console.log('MONGODB_URL =', process.env.MONGODB_URL ? '(set)' : '(not set)');
console.log('NODE_ENV =', process.env.NODE_ENV);
console.log('===========================================');



const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const { getDB, DatabaseAdapter, getDatabaseType } = require('./db');
const { setScenario, getScenario } = require('./scenarioManager');
const mockRouter = require('./mockRouter');
const url = require('url');
const logger = require('./logger');
const FileManager = require('./fileManager');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

logger.info('Starting Universal Mock Server', {
  version: '3.2.0',
  nodeVersion: process.version,
  platform: process.platform,
  databaseType: getDatabaseType()
});

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for development
}));
app.use(compression());

// Enhanced middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));


// Add CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});


app.use('/files', express.static(path.join(__dirname, 'uploads')));


// Enhanced request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log request start
  logger.debug('Request started', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length')
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const processingTime = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      processingTime: `${processingTime}ms`,
      responseSize: res.get('Content-Length') || (chunk ? chunk.length : 0)
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

// Initialize database connection
getDB().then(() => {
  logger.info('Database initialized successfully', { type: getDatabaseType() });
}).catch(error => {
  logger.error('Database initialization failed', { error: error.message });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const db = await getDB();
    const dbType = getDatabaseType();
    
    // Test database connection
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
    
    const stats = await DatabaseAdapter.getStats();
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '3.2.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ...stats
    };
    
    logger.info('Health check passed', healthData);
    res.json(healthData);
  } catch (error) {
    const healthData = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
      version: '3.2.0'
    };
    
    logger.error('Health check failed', healthData);
    res.status(503).json(healthData);
  }
});

// Get current scenario
app.get('/admin/scenario', (req, res) => {
  const scenario = getScenario();
  logger.debug('Current scenario requested', { scenario });
  res.json({ scenario });
});

// Get all unique scenarios from the database
app.get('/admin/scenarios', async (req, res) => {
  try {
    logger.debug('Fetching all scenarios');
    const scenarios = await DatabaseAdapter.getScenarios();
    logger.info('Scenarios fetched successfully', { count: scenarios.length });
    res.json({ scenarios });
  } catch (error) {
    logger.error('Error fetching scenarios', { error: error.message });
    res.status(500).json({ error: 'Database query error' });
  }
});

// Set scenario manually
app.post('/admin/scenario', (req, res) => {
  const { scenario } = req.body;
  if (!scenario) {
    logger.warn('Scenario change attempted without scenario name');
    return res.status(400).json({ error: 'Scenario is required' });
  }
  
  const previousScenario = getScenario();
  setScenario(scenario);
  
  logger.info('Scenario changed via API', { from: previousScenario, to: scenario });
  res.json({ message: `Scenario set to ${scenario}` });
});

// Create mock with file upload, custom headers, and status code
app.post('/admin/mock/file', FileManager.getUploadMiddleware(), async (req, res) => {
  try {
    const { scenario, method, path: fullPath, rule, nextScenario, responseHeaders, statusCode } = req.body;
    
    logger.debug('File-based mock creation requested', {
      scenario,
      method,
      path: fullPath,
      hasRule: !!rule,
      hasNextScenario: !!nextScenario,
      hasResponseHeaders: !!responseHeaders,
      statusCode: statusCode || 200,
      fileCount: req.files?.length || 0
    });
    
    if (!scenario || !method || !fullPath) {
      logger.warn('File-based mock creation failed - missing required fields', req.body);
      return res.status(400).json({ error: 'Scenario, method, and path are required' });
    }
    
    if (!req.files || req.files.length === 0) {
      logger.warn('File-based mock creation failed - no file provided');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Take only the first file
    const uploadedFile = req.files[0];
    
    try {
      const parsed = url.parse(fullPath, true);
      const cleanPath = parsed.pathname;
      const query = new URLSearchParams(parsed.query).toString();
      
      // Save file info to database first
      const fileInfo = {
        filename: uploadedFile.filename,
        originalName: uploadedFile.originalname,
        filePath: uploadedFile.path,
        mimeType: uploadedFile.mimetype,
        fileSize: uploadedFile.size,
        scenario: scenario,
        method: method,
        endpointPath: cleanPath
      };
      
      const fileResult = await DatabaseAdapter.saveFileInfo(fileInfo);
      const fileId = fileResult.id;
      
      // Parse response headers if provided
      let parsedResponseHeaders = null;
      if (responseHeaders) {
        try {
          parsedResponseHeaders = typeof responseHeaders === 'string' 
            ? JSON.parse(responseHeaders) 
            : responseHeaders;
        } catch (parseError) {
          logger.warn('Invalid response headers format, ignoring', { 
            headers: responseHeaders, 
            error: parseError.message 
          });
        }
      }
      
      // Parse status code
      const parsedStatusCode = statusCode ? parseInt(statusCode) : 200;
      
      // Create mock with file reference, headers, and status code
      const mockData = {
        scenario,
        method,
        path: cleanPath,
        query,
        rule: rule || null,
        response: null, // No JSON response when using file
        responseHeaders: parsedResponseHeaders,
        statusCode: parsedStatusCode,
        fileId: fileId,
        nextScenario: nextScenario || null
      };
      
      const result = await DatabaseAdapter.createMockWithFile(mockData);
      
      logger.info('File-based mock created successfully', {
        id: result.id,
        scenario,
        method,
        path: cleanPath,
        fileId: fileId,
        filename: uploadedFile.originalname,
        statusCode: parsedStatusCode,
        hasCustomHeaders: !!parsedResponseHeaders,
        nextScenario
      });
      
      res.json({
        message: 'File-based mock response saved',
        id: result.id,
        fileId: fileId,
        filename: uploadedFile.originalname,
        fileSize: uploadedFile.size,
        mimeType: uploadedFile.mimetype,
        statusCode: parsedStatusCode,
        customHeaders: parsedResponseHeaders ? 'Custom headers applied' : 'Using default headers',
        nextScenario: nextScenario ? `Will auto-switch to "${nextScenario}" when triggered` : 'No auto-scenario switching'
      });
    } catch (error) {
      logger.error('Error creating file-based mock', { error: error.message, requestBody: req.body });
      res.status(500).json({ error: 'Database insert error' });
    }
  } catch (error) {
    logger.error('File-based mock creation error', { error: error.message });
    res.status(500).json({ error: 'Failed to create file-based mock' });
  }
});

// Enhanced mock endpoint creation with response headers and status code support
app.post('/admin/mock', async (req, res) => {
  const { scenario, method, path: fullPath, rule, response, responseHeaders, statusCode, nextScenario } = req.body;
  
  logger.debug('Mock creation requested', {
    scenario,
    method,
    path: fullPath,
    hasRule: !!rule,
    hasResponseHeaders: !!responseHeaders,
    statusCode: statusCode || 200,
    hasNextScenario: !!nextScenario
  });
  
  if (!scenario || !method || !fullPath || !response) {
    logger.warn('Mock creation failed - missing required fields', req.body);
    return res.status(400).json({ error: 'Scenario, method, path, and response are required' });
  }

  try {
    const parsed = url.parse(fullPath, true);
    const cleanPath = parsed.pathname;
    const query = new URLSearchParams(parsed.query).toString();
    
    // Parse response headers if provided
    let parsedResponseHeaders = null;
    if (responseHeaders) {
      try {
        parsedResponseHeaders = typeof responseHeaders === 'string' 
          ? JSON.parse(responseHeaders) 
          : responseHeaders;
      } catch (parseError) {
        logger.warn('Invalid response headers format, ignoring', { 
          headers: responseHeaders, 
          error: parseError.message 
        });
      }
    }
    
    // Parse status code
    const parsedStatusCode = statusCode ? parseInt(statusCode) : 200;

    const mockData = {
      scenario,
      method,
      path: cleanPath,
      query,
      rule: rule || null,
      response: typeof response === 'string' ? response : JSON.stringify(response),
      responseHeaders: parsedResponseHeaders,
      statusCode: parsedStatusCode,
      fileId: null, // No file for JSON responses
      nextScenario: nextScenario || null
    };

    const result = await DatabaseAdapter.createMockWithFile(mockData);

    logger.info('Mock created successfully', {
      id: result.id,
      scenario,
      method,
      path: cleanPath,
      statusCode: parsedStatusCode,
      hasCustomHeaders: !!parsedResponseHeaders,
      nextScenario
    });

    res.json({
      message: 'Mock response saved',
      id: result.id,
      statusCode: parsedStatusCode,
      customHeaders: parsedResponseHeaders ? 'Custom headers applied' : 'Using headers from response body',
      nextScenario: nextScenario ? `Will auto-switch to "${nextScenario}" when triggered` : 'No auto-scenario switching'
    });
  } catch (error) {
    logger.error('Error creating mock', { error: error.message, requestBody: req.body });
    res.status(500).json({ error: 'Database insert error' });
  }
});

// Get mock summaries for a scenario (performance optimized)
app.get('/admin/mocks/:scenario/summary', async (req, res) => {
  try {
    const { scenario } = req.params;
    logger.debug('Mock summaries requested for scenario', { scenario });
    
    const mocks = await DatabaseAdapter.getMocks({
      scenario,
      summary: true
    });
    
    logger.info('Mock summaries fetched', { scenario, count: mocks.length });
    res.json({ scenario, mocks });
  } catch (error) {
    logger.error('Error fetching mock summaries', { error: error.message, scenario: req.params.scenario });
    res.status(500).json({ error: 'Database query error' });
  }
});

// Get all mock summaries (performance optimized)
app.get('/admin/mocks/summary', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const scenario = req.query.scenario;
    const method = req.query.method;
    
    logger.debug('All mock summaries requested', { limit, offset, scenario, method });
    
    const filters = { limit, offset, summary: true };
    if (scenario) filters.scenario = scenario;
    if (method) filters.method = method;
    
    const mocks = await DatabaseAdapter.getMocks(filters);
    
    logger.info('All mock summaries fetched', { count: mocks.length, filters });
    res.json({
      mocks,
      total: mocks.length,
      limit,
      offset,
      filter: scenario || method ? { scenario, method } : undefined
    });
  } catch (error) {
    logger.error('Error fetching all mock summaries', { error: error.message });
    res.status(500).json({ error: 'Database query error' });
  }
});

// Get detailed mock data by ID with file info
app.get('/admin/mock/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.debug('Mock details requested', { id });
    
    const mock = await DatabaseAdapter.getMockById(id);
    
    if (!mock) {
      logger.warn('Mock not found', { id });
      return res.status(404).json({ error: 'Mock not found' });
    }
    
    // If mock has a file reference, get file details
    if (mock.file_id) {
      try {
        const file = await DatabaseAdapter.getFileById(mock.file_id);
        if (file) {
          mock.file = {
            id: file.id || file._id,
            filename: file.filename,
            originalName: file.original_name,
            mimeType: file.mime_type,
            fileSize: file.file_size,
            formattedSize: FileManager.formatFileSize(file.file_size)
          };
        }
      } catch (error) {
        logger.error('Error fetching file details for mock', { error: error.message, fileId: mock.file_id });
      }
    }
    
    // Parse response headers if they exist
    if (mock.response_headers) {
      try {
        mock.responseHeaders = typeof mock.response_headers === 'string' 
          ? JSON.parse(mock.response_headers) 
          : mock.response_headers;
        delete mock.response_headers; // Remove the raw field
      } catch (parseError) {
        logger.error('Error parsing response headers', { 
          mockId: id, 
          error: parseError.message 
        });
      }
    }
    
    // Include status code
    mock.statusCode = mock.status_code || 200;
    
    logger.info('Mock details fetched', { 
      id, 
      scenario: mock.scenario, 
      hasFile: !!mock.file_id,
      hasCustomHeaders: !!mock.responseHeaders,
      statusCode: mock.statusCode 
    });
    res.json({ mock });
  } catch (error) {
    logger.error('Error fetching mock details', { error: error.message, id: req.params.id });
    res.status(500).json({ error: 'Database query error' });
  }
});

// Delete a specific mock
app.delete('/admin/mock/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.debug('Mock deletion requested', { id });
    
    const result = await DatabaseAdapter.deleteMock(id);
    
    if (result.deletedCount === 0) {
      logger.warn('Mock deletion failed - not found', { id });
      return res.status(404).json({ error: 'Mock not found' });
    }
    
    logger.info('Mock deleted successfully', { id });
    res.json({ message: 'Mock deleted successfully' });
  } catch (error) {
    logger.error('Error deleting mock', { error: error.message, id: req.params.id });
    res.status(500).json({ error: 'Database delete error' });
  }
});

// File upload endpoint
app.post('/admin/files/upload', FileManager.getUploadMiddleware(), async (req, res) => {
  try {
    const { scenario, method = 'GET', basePath = '/files' } = req.body;
    
    logger.info('File upload requested', {
      scenario,
      method,
      basePath,
      fileCount: req.files?.length || 0
    });
    
    if (!req.files || req.files.length === 0) {
      logger.warn('File upload failed - no files provided');
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    if (!scenario) {
      logger.warn('File upload failed - no scenario provided');
      return res.status(400).json({ error: 'Scenario is required' });
    }
    
    const savedFiles = await FileManager.saveUploadedFiles(req.files, scenario, method, basePath);
    
    logger.info('Files uploaded successfully', {
      scenario,
      count: savedFiles.length,
      totalSize: savedFiles.reduce((sum, f) => sum + f.fileSize, 0)
    });
    
    res.json({
      message: 'Files uploaded successfully',
      files: savedFiles
    });
  } catch (error) {
    logger.error('File upload error', { error: error.message });
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get files
app.get('/admin/files', async (req, res) => {
  try {
    const { scenario, filename } = req.query;
    
    logger.debug('Files list requested', { scenario, filename });
    
    const filters = {};
    if (scenario) filters.scenario = scenario;
    if (filename) filters.filename = filename;
    
    const files = await DatabaseAdapter.getFiles(filters);
    
    logger.info('Files list fetched', { count: files.length, filters });
    res.json({ files });
  } catch (error) {
    logger.error('Error fetching files', { error: error.message });
    res.status(500).json({ error: 'Database query error' });
  }
});

// Delete file
app.delete('/admin/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.debug('File deletion requested', { id });
    
    const result = await FileManager.deleteFile(id);
    
    if (result.deletedCount === 0) {
      logger.warn('File deletion failed - not found', { id });
      return res.status(404).json({ error: 'File not found' });
    }
    
    logger.info('File deleted successfully', { id });
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Error deleting file', { error: error.message, id: req.params.id });
    res.status(500).json({ error: 'File deletion failed' });
  }
});

// Generate sample CSV
app.post('/admin/files/generate-csv', async (req, res) => {
  try {
    const { filename, data, scenario = 'default' } = req.body;
    
    logger.info('CSV generation requested', { filename, scenario, rowCount: data?.length });
    
    if (!filename || !data) {
      logger.warn('CSV generation failed - missing filename or data');
      return res.status(400).json({ error: 'Filename and data are required' });
    }
    
    const csvFile = await FileManager.generateCSV(data, filename);
    
    // Save file info to database
    const fileInfo = {
      filename: csvFile.filename,
      originalName: csvFile.filename,
      filePath: csvFile.filePath,
      mimeType: 'text/csv',
      fileSize: csvFile.size,
      scenario: scenario,
      method: 'GET',
      endpointPath: `/files/${csvFile.filename}`
    };
    
    await DatabaseAdapter.saveFileInfo(fileInfo);
    
    logger.info('CSV generated successfully', {
      filename: csvFile.filename,
      size: csvFile.size,
      scenario
    });
    
    res.json({
      message: 'CSV file generated successfully',
      file: {
        ...fileInfo,
        formattedSize: FileManager.formatFileSize(csvFile.size)
      }
    });
  } catch (error) {
    logger.error('CSV generation error', { error: error.message });
    res.status(500).json({ error: 'CSV generation failed' });
  }
});

// Get file statistics
app.get('/admin/files/stats', async (req, res) => {
  try {
    logger.debug('File statistics requested');
    
    const stats = await FileManager.getFileStats();
    
    logger.info('File statistics fetched', stats);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching file statistics', { error: error.message });
    res.status(500).json({ error: 'Failed to get file statistics' });
  }
});

// Get request history
app.get('/admin/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    logger.debug('Request history requested', { limit, offset });
    
    const result = await DatabaseAdapter.getRequestHistory({ limit, offset });
    
    logger.info('Request history fetched', {
      count: result.history.length,
      total: result.total,
      limit,
      offset
    });
    
    res.json({
      history: result.history,
      total: result.total,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Error fetching history', { error: error.message });
    res.status(500).json({ error: 'Database query error' });
  }
});

// Clear request history
app.delete('/admin/history', async (req, res) => {
  try {
    logger.info('Request history clear requested');
    
    const result = await DatabaseAdapter.clearRequestHistory();
    
    logger.info('Request history cleared', { deletedCount: result.deletedCount });
    res.json({ message: `Deleted ${result.deletedCount} history entries` });
  } catch (error) {
    logger.error('Error clearing history', { error: error.message });
    res.status(500).json({ error: 'Database delete error' });
  }
});

// Get statistics
app.get('/admin/stats', async (req, res) => {
  try {
    logger.debug('Statistics requested');
    
    const stats = await DatabaseAdapter.getStats();
    
    logger.info('Statistics fetched', stats);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching stats', { error: error.message });
    res.status(500).json({ error: 'Database query error' });
  }
});

// Switch database type
app.post('/admin/switch-database', (req, res) => {
  const { type } = req.body;
  
  if (!type || !['sqlite', 'mongodb'].includes(type.toLowerCase())) {
    logger.warn('Invalid database switch request', { type });
    return res.status(400).json({ error: 'Database type must be either "sqlite" or "mongodb"' });
  }
  
  const { switchDatabase } = require('./db');
  switchDatabase(type.toLowerCase());
  
  logger.info('Database type switched', { type });
  res.json({ message: `Database switched to ${type}`, restart_required: true });
});

app.use(mockRouter);

app.listen(PORT, () => {
  logger.info('Universal Mock Server started successfully', {
    port: PORT,
    database: getDatabaseType(),
    environment: process.env.NODE_ENV || 'development',
    version: '3.2.0'
  });
  console.log(`🚀 Enhanced Universal Mock Server running at http://localhost:${PORT}`);
});