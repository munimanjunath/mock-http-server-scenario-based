#  Mock HTTP Server with Multip Scenarios Support

A comprehensive, production-ready mock server supporting both SQLite and MongoDB databases with advanced file handling, cross-platform compatibility, and comprehensive logging.

## ?? Features

### Core Capabilities
- **Dual Database Support**: Seamlessly switch between SQLite and MongoDB
- **Binary File Management**: Upload, serve, and manage files (ZIP, TAR.GZ, CSV, images, etc.)
- **Advanced Logging**: Winston-based logging with multiple levels and file rotation
- **Cross-Platform Scripts**: Automated setup for Windows, Linux, and macOS
- **Docker Support**: Complete containerization with MongoDB
- **Performance Optimized**: Lazy loading, compression, and efficient database queries

### Mock Server Features
- **Scenario Management**: Dynamic scenario switching with auto-transitions
- **Rule-Based Matching**: JEXL expression support for conditional responses
- **Request History**: Complete audit trail with performance metrics
- **File Endpoints**: Serve binary files through mock endpoints
- **Health Monitoring**: Comprehensive health checks and statistics

## ?? Quick Start

### Option 1: Automated Setup (Recommended)

**Windows:**
```batch
npm run setup:windows
```

**Linux/macOS:**
```bash
npm run setup:linux
```

### Option 2: Manual Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Choose database and start:**
   ```bash
   # For SQLite (default)
   npm run switch:sqlite
   npm start
   
   # For MongoDB  
   npm run switch:mongodb
   npm start
   
   # For Docker
   npm run docker:up
   ```

## ??? Database Support

### SQLite (Default)
- **Pros**: Zero setup, portable, perfect for development
- **Use case**: Development, testing, small deployments
- **Storage**: Local file at `./db/mockserver.db`

### MongoDB
- **Pros**: Better performance, scalability, cloud support
- **Use case**: Production, large datasets, distributed systems
- **Options**: Local MongoDB, MongoDB Atlas, Docker

### Switching Databases
```bash
# Switch to SQLite
npm run switch:sqlite

# Switch to MongoDB
npm run switch:mongodb

# Manual switch via API
curl -X POST http://localhost:3000/admin/switch-database \
  -H "Content-Type: application/json" \
  -d '{"type":"mongodb"}'
```

## ?? File Management

### Upload Files
```bash
# Upload via web interface (recommended)
# Go to http://localhost:3000 ? File Upload tab

# Upload via API
curl -X POST http://localhost:3000/admin/files/upload \
  -F "files=@example.tar.gz" \
  -F "scenario=production" \
  -F "method=GET"
```

### Generate CSV Files
```bash
curl -X POST http://localhost:3000/admin/files/generate-csv \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "sample.csv",
    "scenario": "test",
    "data": [
      {"name": "John", "age": 30},
      {"name": "Jane", "age": 25}
    ]
  }'
```

### Access Files
Once uploaded, files are accessible at:
```
GET /files/{filename}
```

## ?? API Endpoints

### Core Mock Management
- `GET /admin/scenario` - Get current scenario
- `POST /admin/scenario` - Set scenario
- `GET /admin/scenarios` - List all scenarios
- `POST /admin/mock` - Create/update mock response
- `GET /admin/mocks/summary` - Get mock summaries (paginated)
- `GET /admin/mock/:id` - Get mock details
- `DELETE /admin/mock/:id` - Delete mock

### File Management
- `POST /admin/files/upload` - Upload files
- `GET /admin/files` - List files
- `DELETE /admin/files/:id` - Delete file
- `POST /admin/files/generate-csv` - Generate CSV
- `GET /admin/files/stats` - File statistics

### Monitoring & Administration
- `GET /health` - Health check
- `GET /admin/stats` - Server statistics
- `GET /admin/history` - Request history
- `DELETE /admin/history` - Clear history
- `POST /admin/switch-database` - Switch database type

## ?? Advanced Features

### Scenario Auto-Transitions
```javascript
// Create a mock that automatically switches scenarios
{
  "scenario": "order_created",
  "method": "POST",
  "path": "/api/orders",
  "response": {
    "statusCode": 201,
    "body": { "orderId": "12345", "status": "created" }
  },
  "nextScenario": "order_processing"  // Auto-switch to this scenario
}
```

### Conditional Mock Responses
```javascript
// Using JEXL expressions for conditional logic
{
  "scenario": "user_auth",
  "method": "POST",
  "path": "/api/login",
  "rule": "inputPayload.username == 'admin' && inputPayload.password == 'secret'",
  "response": {
    "statusCode": 200,
    "body": { "token": "abc123", "role": "admin" }
  }
}
```

### File Response Mock
```javascript
// Serve files through mock endpoints
{
  "scenario": "file_download",
  "method": "GET",
  "path": "/api/download/:fileId",
  "response": {
    "statusCode": 302,
    "headers": { "Location": "/files/data-export.zip" }
  }
}
```

## ?? Logging

### Log Levels
- **error**: Error conditions
- **warn**: Warning conditions  
- **info**: General information (default)
- **debug**: Detailed debug information

### Log Files
- `logs/app.log` - All application logs
- `logs/error.log` - Error logs only
- `logs/debug.log` - Debug logs

### Configuration
```bash
# Environment variables
LOG_LEVEL=debug              # Application log level
CONSOLE_LOG_LEVEL=info       # Console output level
```

## ?? Docker Support

### Quick Start with Docker
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f mockserver

# Stop services
docker-compose down
```

### Services
- **mockserver**: Main application (port 3000)
- **mongodb**: MongoDB database (port 27017)

## ?? Configuration

### Environment Variables

```bash
# Database Configuration
DB_TYPE=sqlite|mongodb                    # Database type
SQLITE_PATH=./db/mockserver.db           # SQLite file path
MONGODB_URL=mongodb://localhost:27017    # MongoDB connection
DB_NAME=mockserver                       # Database name

# Server Configuration
PORT=3000                                # Server port
NODE_ENV=development|production          # Environment
CORS_ORIGIN=*                           # CORS origins

# Logging Configuration
LOG_LEVEL=info|debug|warn|error         # Application log level
CONSOLE_LOG_LEVEL=info                  # Console log level

# File Upload Configuration
MAX_FILE_SIZE=104857600                 # Max file size (100MB)
```

## ?? Use Cases

### API Development & Testing
- Mock third-party APIs during development
- Test different response scenarios
- Simulate network failures and edge cases
- Create realistic test data with file uploads

### Integration Testing
- Test API workflows with scenario transitions
- Validate request/response handling
- Performance testing with request history
- File upload/download testing

### Demo & Prototyping
- Create interactive API demos
- Prototype complex workflows
- Generate sample data files
- Showcase API behavior

## ?? Monitoring & Analytics

### Health Monitoring
```bash
# Check server health
curl http://localhost:3000/health

# Run comprehensive health check
npm run health
```

### Performance Metrics
- Request processing times
- Database operation durations
- File upload/download statistics
- Memory and CPU usage tracking

### Request Analytics
- Complete request/response history
- Scenario transition tracking
- Performance bottleneck identification
- Usage pattern analysis

## ??? Development

### Available Scripts
```bash
npm start                    # Start server
npm run dev                  # Development mode with auto-reload
npm run health               # Run health checks
npm run test:connection      # Test database connection
npm run docker:up            # Start with Docker
npm run switch:sqlite        # Switch to SQLite
npm run switch:mongodb       # Switch to MongoDB
```

### Project Structure
```
+-- server.js              # Main application server
+-- db.js                  # Universal database abstraction
+-- mockRouter.js          # Request routing and matching
+-- fileManager.js         # File upload/download handling
+-- logger.js              # Advanced logging system
+-- scenarioManager.js     # Scenario state management
+-- healthcheck.js         # Health monitoring
+-- public/                # Web interface files
+-- scripts/               # Setup and utility scripts
+-- logs/                  # Application logs
```

## ?? Troubleshooting

### Common Issues

**Database Connection Errors:**
```bash
# Check database status
npm run test:connection

# For MongoDB, ensure service is running
# Windows: net start MongoDB
# macOS: brew services start mongodb/brew/mongodb-community
# Linux: systemctl start mongod

# Check logs
tail -f logs/error.log
```

**File Upload Issues:**
```bash
# Check disk space
df -h

# Check directory permissions
ls -la uploads/ files/

# Verify file size limits
grep MAX_FILE_SIZE .env
```

**Performance Issues:**
```bash
# Check system resources
npm run health

# Monitor logs
tail -f logs/debug.log

# Database optimization
# For MongoDB: check indexes in logs
# For SQLite: check database file size
```

## ?? Performance Tips

1. **Use MongoDB for production** with large datasets (>1000 mocks)
2. **Enable compression** for better network performance
3. **Monitor log files** and rotate regularly
4. **Use appropriate file storage** for large binary files
5. **Implement proper indexing** for custom database queries
6. **Set appropriate log levels** (info for production, debug for development)

## ?? Security Considerations

- **File validation**: Validate uploaded file types and sizes
- **CORS configuration**: Set appropriate origins for your environment
- **Access control**: Consider implementing authentication for production
- **Environment variables**: Keep sensitive data in .env files
- **Network security**: Use HTTPS in production environments

## ?? Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Update documentation
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Submit a pull request

## ?? License

MIT License - see LICENSE file for details.

## ?? Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check README and inline code comments
- **Health Endpoint**: Monitor server status at `/health`
- **Logs**: Check `logs/` directory for troubleshooting
- **Discord/Slack**: Join our community for support

---

## ?? Happy Mocking!

This Universal Mock Server provides everything you need for comprehensive API mocking with enterprise-grade features. Whether you're developing, testing, or demonstrating APIs, it adapts to your workflow and scales with your needs.

**Start mocking in seconds, scale to enterprise!** ??
