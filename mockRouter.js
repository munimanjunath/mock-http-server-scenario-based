const express = require('express');
const { DatabaseAdapter } = require('./db');
const { getScenario, setScenario } = require('./scenarioManager');
const Jexl = require('jexl');
const { match } = require('path-to-regexp');
const url = require('url');
const logger = require('./logger');
const FileManager = require('./fileManager');
const proxyHandler = require('./proxyHandler');

const router = express.Router();

// Use proxy middleware when enabled
if (proxyHandler.isProxyEnabled()) {
  logger.info('Proxy mode enabled', {
    target: proxyHandler.getConfig().target,
    recordMode: proxyHandler.getConfig().recordMode
  });
}

router.use(async (req, res, next) => {
  const startTime = Date.now();
  const requestTimestamp = new Date().toISOString();
  const namedScenario = getScenario();
  const scenarioBefore = namedScenario;
  
  const parsedUrl = url.parse(req.url, true);
  const inputPayload = req.body;
  const headers = req.headers;
  const uri = parsedUrl.pathname;
  const queryparams = parsedUrl.query;
  const requestQuery = new URLSearchParams(queryparams).toString();
  const context = { inputPayload, uri, headers, queryparams };

  logger.info('Mock request received', {
    scenario: namedScenario,
    method: req.method,
    path: uri,
    query: requestQuery,
    userAgent: headers['user-agent'],
    ip: req.ip
  });

  // Function to log the request with response details
  const logRequestHistory = (responseStatus, responseHeaders, responseBody, matchedMockId) => {
    const processingTime = Date.now() - startTime;
    const scenarioAfter = getScenario();
    
    // Log to Winston
    logger.logRequest(req, res, processingTime, matchedMockId);
    
    // Log to database
    DatabaseAdapter.logRequest({
      timestamp: requestTimestamp,
      scenarioBefore,
      scenarioAfter,
      method: req.method,
      path: uri,
      queryString: requestQuery,
      requestHeaders: headers,
      requestBody: inputPayload,
      responseStatus,
      responseHeaders,
      responseBody,
      matchedMockId,
      processingTime
    });
  };

  // Check if this is a file request
  if (uri.startsWith('/files/')) {
    const filename = uri.replace('/files/', '');
    logger.debug('File request detected', { filename, scenario: namedScenario });
    
    try {
      const file = await FileManager.getFile(filename, namedScenario);
      
      if (!file) {
        logger.warn('File not found', { filename, scenario: namedScenario });
        const errorResponse = { error: 'File not found' };
        logRequestHistory(404, {}, errorResponse, null);
        return res.status(404).json(errorResponse);
      }
      
      const responseHeaders = {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Length': file.file_size,
        'Content-Disposition': `attachment; filename="${file.original_name}"`
      };
      
      logger.info('Serving file', {
        filename: file.original_name,
        size: file.file_size,
        mimeType: file.mime_type
      });
      
      res.set(responseHeaders);
      logRequestHistory(200, responseHeaders, 'Binary file content', file.id);
      
      file.stream.pipe(res);
      return;
    } catch (error) {
      logger.error('File serving error', { error: error.message, filename });
      const errorResponse = { error: 'File serving error' };
      logRequestHistory(500, {}, errorResponse, null);
      return res.status(500).json(errorResponse);
    }
  }

  const tryScenario = async (scenario, onFail) => {
    try {
      logger.debug('Trying scenario', { scenario, method: req.method, path: uri });
      
      // Use the enhanced getMocks method that includes file_id, response_headers, and status_code
      const mocks = await DatabaseAdapter.getMocksEnhanced({
        scenario: scenario,
        method: req.method
      });

      logger.debug('Found mocks for scenario', { scenario, count: mocks.length });

      for (const mock of mocks) {
        const isMatch = match(mock.path, { decode: decodeURIComponent });
        const queryMatches = !mock.query || mock.query === requestQuery;
        
        if (!isMatch(uri) || !queryMatches) {
          logger.debug('Mock path/query mismatch', {
            mockPath: mock.path,
            requestPath: uri,
            mockQuery: mock.query,
            requestQuery: requestQuery
          });
          continue;
        }

        try {
          const result = !mock.rule || await Jexl.eval(mock.rule, context);
          if (result) {
            logger.info('Mock matched successfully', {
              mockId: mock.id || mock._id,
              path: mock.path,
              rule: mock.rule,
              scenario: mock.scenario,
              hasFile: !!mock.file_id,
              hasCustomHeaders: !!mock.response_headers,
              statusCode: mock.status_code || 200
            });
            
            // Get the status code (default to 200 if not set)
            const statusCode = mock.status_code || 200;
            
            // Parse custom headers if available
            let customHeaders = {};
            if (mock.response_headers) {
              try {
                customHeaders = typeof mock.response_headers === 'string' 
                  ? JSON.parse(mock.response_headers) 
                  : mock.response_headers;
              } catch (parseError) {
                logger.error('Invalid JSON in response_headers', {
                  mockId: mock.id || mock._id,
                  headers: mock.response_headers,
                  error: parseError.message
                });
              }
            }
            
            // Check if this mock has a file reference
            if (mock.file_id) {
              try {
                // Get the file information
                const file = await DatabaseAdapter.getFileById(mock.file_id);
                
                if (!file) {
                  logger.error('Referenced file not found', { fileId: mock.file_id, mockId: mock.id || mock._id });
                  const errorResponse = { error: 'Referenced file not found' };
                  logRequestHistory(404, {}, errorResponse, mock.id || mock._id);
                  return res.status(404).json(errorResponse);
                }
                
                // Check if file exists on disk
                if (!require('fs').existsSync(file.file_path)) {
                  logger.error('File not found on disk', { filePath: file.file_path, fileId: mock.file_id });
                  const errorResponse = { error: 'File not found' };
                  logRequestHistory(404, {}, errorResponse, mock.id || mock._id);
                  return res.status(404).json(errorResponse);
                }
                
                // Set default headers for file response
                const defaultHeaders = {
                  'Content-Type': file.mime_type || 'application/octet-stream',
                  'Content-Length': file.file_size,
                  'Content-Disposition': `inline; filename="${file.original_name}"`
                };
                
                // Merge custom headers with default headers (custom headers take precedence)
                const responseHeaders = {
                  ...defaultHeaders,
                  ...customHeaders
                };
                
                logger.info('Serving file from mock', {
                  mockId: mock.id || mock._id,
                  filename: file.original_name,
                  size: file.file_size,
                  mimeType: file.mime_type,
                  statusCode: statusCode,
                  headers: responseHeaders
                });
                
                // Check if this mock response should trigger a scenario change
                if (mock.next_scenario) {
                  logger.info('Auto-switching scenario', {
                    from: scenario,
                    to: mock.next_scenario,
                    trigger: 'mock_file_response'
                  });
                  setScenario(mock.next_scenario);
                }
                
                // Log the successful request
                logRequestHistory(statusCode, responseHeaders, 'Binary file content', mock.id || mock._id);
                
                // Set headers and status code, then pipe file
                res.status(statusCode).set(responseHeaders);
                const stream = require('fs').createReadStream(file.file_path);
                stream.pipe(res);
                return;
                
              } catch (fileError) {
                logger.error('Error serving file from mock', { error: fileError.message, mockId: mock.id || mock._id });
                const errorResponse = { error: 'Error serving file' };
                logRequestHistory(500, {}, errorResponse, mock.id || mock._id);
                return res.status(500).json(errorResponse);
              }
            }
            
            // Standard JSON response handling
            let mockResponse;
            try {
              mockResponse = typeof mock.response === 'string' ? JSON.parse(mock.response) : mock.response;
            } catch (parseError) {
              logger.error('Invalid JSON in stored response', {
                mockId: mock.id || mock._id,
                response: mock.response,
                error: parseError.message
              });
              const errorResponse = { error: 'Invalid mock response format' };
              logRequestHistory(500, {}, errorResponse, mock.id || mock._id);
              return res.status(500).json(errorResponse);
            }

            // Handle different response formats
            let responseStatusCode = statusCode; // Use the mock's status code
            let responseHeaders = {};
            let responseBody;

            if (mockResponse && (mockResponse.statusCode !== undefined || mockResponse.body !== undefined || mockResponse.headers !== undefined)) {
              // New format: { statusCode: 200, headers: {}, body: {...} }
              // Mock's status_code field takes precedence over response body's statusCode
              responseStatusCode = statusCode || mockResponse.statusCode || 200;
              responseHeaders = mockResponse.headers || {};
              responseBody = mockResponse.body;
            } else {
              // Legacy format: direct response object
              responseBody = mockResponse;
            }
            
            // Apply custom headers if available (override response headers from JSON)
            if (Object.keys(customHeaders).length > 0) {
              responseHeaders = {
                ...responseHeaders,
                ...customHeaders
              };
              logger.debug('Applied custom headers to JSON response', {
                mockId: mock.id || mock._id,
                headers: responseHeaders
              });
            }

            logger.info('Sending mock response', {
              statusCode: responseStatusCode,
              headers: responseHeaders,
              bodyType: typeof responseBody
            });
            
            // Check if this mock response should trigger a scenario change
            if (mock.next_scenario) {
              logger.info('Auto-switching scenario', {
                from: scenario,
                to: mock.next_scenario,
                trigger: 'mock_response'
              });
              setScenario(mock.next_scenario);
            }
            
            // Log the successful request
            logRequestHistory(responseStatusCode, responseHeaders, responseBody, mock.id || mock._id);
            
            // Set headers and send response with the appropriate status code
            res.set(responseHeaders);
            return res.status(responseStatusCode).json(responseBody);
          } else {
            logger.debug('Mock rule evaluation failed', {
              mockId: mock.id || mock._id,
              rule: mock.rule,
              context: context
            });
          }
        } catch (e) {
          logger.error('Rule evaluation error', {
            mockId: mock.id || mock._id,
            rule: mock.rule,
            error: e.message,
            context: context
          });
        }
      }

      onFail();
    } catch (error) {
      logger.error('Database error in mock matching', {
        scenario,
        error: error.message,
        method: req.method,
        path: uri
      });
      const errorResponse = { error: 'Internal server error' };
      logRequestHistory(500, {}, errorResponse, null);
      return res.status(500).json(errorResponse);
    }
  };

  await tryScenario(namedScenario, async () => {
    if (namedScenario !== 'default') {
      logger.debug('No match in named scenario, trying default', { namedScenario });
      await tryScenario('default', () => {
        // No matching rule found in any scenario
        if (proxyHandler.isProxyEnabled()) {
          // Forward the request to the proxy middleware
          logger.info('No mock found, forwarding to proxy', {
            method: req.method,
            path: uri,
            target: proxyHandler.getConfig().target
          });
          
          // We'll create the proxy middleware on demand
          const proxyMiddleware = proxyHandler.createProxyMiddleware();
          if (proxyMiddleware) {
            // Mark the request as being handled by proxy
            req.isProxied = true;
            return proxyMiddleware(req, res, next);
          }
        }
        
        // If we get here, there's no mock and no proxy
        logger.warn('No matching rule found in any scenario', {
          scenario: namedScenario,
          method: req.method,
          path: uri,
          query: requestQuery
        });
        const errorResponse = { error: 'No matching rule found in scenario or default.' };
        logRequestHistory(404, {}, errorResponse, null);
        res.status(404).json(errorResponse);
      });
    } else {
      // No matching rule in default scenario
      if (proxyHandler.isProxyEnabled()) {
        // Forward the request to the proxy middleware
        logger.info('No mock found in default scenario, forwarding to proxy', {
          method: req.method,
          path: uri,
          target: proxyHandler.getConfig().target
        });
        
        // We'll create the proxy middleware on demand
        const proxyMiddleware = proxyHandler.createProxyMiddleware();
        if (proxyMiddleware) {
          // Mark the request as being handled by proxy
          req.isProxied = true;
          return proxyMiddleware(req, res, next);
        }
      }
      
      // If we get here, there's no mock in default and no proxy
      logger.warn('No matching rule found in default scenario', {
        method: req.method,
        path: uri,
        query: requestQuery
      });
      const errorResponse = { error: 'No matching rule found in default scenario.' };
      logRequestHistory(404, {}, errorResponse, null);
      res.status(404).json(errorResponse);
    }
  });
});

module.exports = router;