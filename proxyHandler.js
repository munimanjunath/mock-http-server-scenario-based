const { createProxyMiddleware } = require('http-proxy-middleware');
const { DatabaseAdapter } = require('./db/db');
const { getScenario } = require('./scenarioManager');
const logger = require('./logger');

/**
 * Proxy configuration manager
 */
class ProxyHandler {
  constructor() {
    this.proxyConfig = {
      enabled: process.env.PROXY_ENABLED === 'true',
      target: process.env.PROXY_TARGET || '',
      recordMode: process.env.PROXY_RECORD_MODE === 'true',
      recordScenario: process.env.PROXY_RECORD_SCENARIO || 'recorded',
      changeOrigin: true,
      pathRewrite: process.env.PROXY_PATH_REWRITE ? JSON.parse(process.env.PROXY_PATH_REWRITE) : null
    };
    
    this.middlewareCache = null;
    
    logger.info('Proxy handler initialized', {
      enabled: this.proxyConfig.enabled,
      target: this.proxyConfig.target,
      recordMode: this.proxyConfig.recordMode
    });
  }
  
  /**
   * Check if proxy is enabled and properly configured
   */
  isProxyEnabled() {
    return this.proxyConfig.enabled && this.proxyConfig.target;
  }
  
  /**
   * Create proxy middleware with current configuration
   */
  createProxyMiddleware() {
    if (!this.isProxyEnabled()) {
      return null;
    }
    
    if (this.middlewareCache) {
      return this.middlewareCache;
    }
    
    const self = this;
    
    logger.info('Creating proxy middleware', {
      target: this.proxyConfig.target,
      recordMode: this.proxyConfig.recordMode
    });
    
    this.middlewareCache = createProxyMiddleware({
      target: this.proxyConfig.target,
      changeOrigin: this.proxyConfig.changeOrigin,
      pathRewrite: this.proxyConfig.pathRewrite,
      logLevel: 'silent', // We'll handle logging ourselves
      
      onProxyReq: (proxyReq, req, res) => {
        // Add X-Forwarded headers if not already present
        if (!proxyReq.getHeader('X-Forwarded-For') && req.ip) {
          proxyReq.setHeader('X-Forwarded-For', req.ip);
        }
        
        if (!proxyReq.getHeader('X-Forwarded-Proto')) {
          proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
        }
        
        if (!proxyReq.getHeader('X-Forwarded-Host')) {
          proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
        }
        
        logger.debug('Proxying request', {
          method: req.method,
          url: req.originalUrl,
          target: self.proxyConfig.target
        });
      },
      
      onProxyRes: async (proxyRes, req, res) => {
        // Record response as a mock if record mode is enabled
        if (self.proxyConfig.recordMode) {
          try {
            const chunks = [];
            
            proxyRes.on('data', (chunk) => {
              chunks.push(chunk);
            });
            
            proxyRes.on('end', async () => {
              const body = Buffer.concat(chunks).toString('utf8');
              let responseBody;
              
              try {
                responseBody = JSON.parse(body);
              } catch (e) {
                // If not JSON, store as string
                responseBody = body;
              }
              
              const parsedUrl = new URL(req.originalUrl, `http://${req.headers.host}`);
              const path = parsedUrl.pathname;
              const query = parsedUrl.search ? parsedUrl.search.substring(1) : '';
              
              const mockData = {
                scenario: self.proxyConfig.recordScenario,
                method: req.method,
                path: path,
                query: query,
                response: {
                  statusCode: proxyRes.statusCode,
                  headers: proxyRes.headers,
                  body: responseBody
                }
              };
              
              try {
                await DatabaseAdapter.createMock(mockData);
                logger.info('Recorded proxy response as mock', {
                  scenario: self.proxyConfig.recordScenario,
                  method: req.method,
                  path: path,
                  statusCode: proxyRes.statusCode
                });
              } catch (error) {
                logger.error('Failed to record proxy response', {
                  error: error.message,
                  path: path
                });
              }
            });
          } catch (error) {
            logger.error('Error in proxy response recording', {
              error: error.message,
              path: req.originalUrl
            });
          }
        }
        
        logger.info('Proxied response received', {
          method: req.method,
          url: req.originalUrl,
          statusCode: proxyRes.statusCode,
          contentType: proxyRes.headers['content-type'],
          contentLength: proxyRes.headers['content-length']
        });
      },
      
      onError: (err, req, res) => {
        logger.error('Proxy error', {
          error: err.message,
          method: req.method,
          url: req.originalUrl
        });
        
        res.status(502).json({
          error: 'Proxy error',
          message: err.message,
          target: self.proxyConfig.target
        });
      }
    });
    
    return this.middlewareCache;
  }
  
  /**
   * Update proxy configuration
   */
  updateConfig(newConfig) {
    this.proxyConfig = {
      ...this.proxyConfig,
      ...newConfig
    };
    
    // Clear middleware cache to force recreation with new config
    this.middlewareCache = null;
    
    logger.info('Proxy configuration updated', {
      enabled: this.proxyConfig.enabled,
      target: this.proxyConfig.target,
      recordMode: this.proxyConfig.recordMode
    });
    
    return this.proxyConfig;
  }
  
  /**
   * Get current proxy configuration
   */
  getConfig() {
    return this.proxyConfig;
  }
}

module.exports = new ProxyHandler();