const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!require('fs').existsSync(logsDir)) {
  require('fs').mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const serviceStr = service ? `[${service}]` : '';
    return `${timestamp} ${level} ${serviceStr} ${message} ${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'mock-server' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.CONSOLE_LOG_LEVEL || 'info'
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // File transport for debug logs
    new winston.transports.File({
      filename: path.join(logsDir, 'debug.log'),
      level: 'debug',
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 3
    })
  ]
});

// Add request logging helper
logger.logRequest = (req, res, processingTime, matchedMock = null) => {
  const logData = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode: res.statusCode,
    processingTime: `${processingTime}ms`,
    timestamp: new Date().toISOString()
  };
  
  if (matchedMock) {
    logData.matchedMock = matchedMock;
  }
  
  if (res.statusCode >= 400) {
    logger.warn('Request completed with error', logData);
  } else {
    logger.info('Request completed successfully', logData);
  }
};

// Add database operation logging
logger.logDBOperation = (operation, details, duration = null) => {
  const logData = {
    operation,
    details,
    timestamp: new Date().toISOString()
  };
  
  if (duration !== null) {
    logData.duration = `${duration}ms`;
  }
  
  logger.debug('Database operation', logData);
};

// Add file operation logging
logger.logFileOperation = (operation, filename, size = null, error = null) => {
  const logData = {
    operation,
    filename,
    timestamp: new Date().toISOString()
  };
  
  if (size !== null) {
    logData.size = `${size} bytes`;
  }
  
  if (error) {
    logData.error = error.message;
    logger.error('File operation failed', logData);
  } else {
    logger.info('File operation completed', logData);
  }
};

module.exports = logger;