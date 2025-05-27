# 🚀 Mock HTTP Server with Multiple Scenarios Support

A comprehensive, ready to use mock http server supporting both SQLite and MongoDB databases with advanced file handling, cross-platform compatibility, response delay simulation, and comprehensive logging.

## 🌟 Features

### Core Capabilities
- **Dual Database Support**: Seamlessly switch between SQLite and MongoDB
- **Binary File Management**: Upload, serve, and manage files (ZIP, TAR.GZ, CSV, images, etc.)
- **Response Delay Simulation**: Configure fixed or random delays to simulate real-world latency
- **Advanced Logging**: Winston-based logging with multiple levels and file rotation
- **Cross-Platform Scripts**: Automated setup for Windows, Linux, and macOS
- **Docker Support**: Complete containerization with MongoDB
- **Performance Optimized**: Lazy loading, compression, and efficient database queries

### Mock Server Features
- **Scenario Management**: Dynamic scenario switching with auto-transitions
- **Rule-Based Matching**: JEXL expression support for conditional responses
- **Request History**: Complete audit trail with performance metrics and delay tracking
- **File Endpoints**: Serve binary files through mock endpoints
- **Response Delays**: Simulate network latency with configurable delays
- **Health Monitoring**: Comprehensive health checks and statistics

## 🚀 Quick Start

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

## 💾 Database Support

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

## ⏱️ Response Delay Configuration

### Overview
Simulate real-world network conditions by adding artificial delays to your mock responses. This feature helps test:
- Loading states in your application
- Timeout handling
- Performance under slow network conditions
- Race condition scenarios

### Delay Types

#### 1. No Delay (Default)
Responses are sent immediately with no artificial delay.

#### 2. Fixed Delay
Responses are delayed by a consistent amount of time.
```javascript
{
  "delayType": "fixed",
  "delayFixed": 500  // Always delays by 500ms
}
```

#### 3. Random Delay
Responses are delayed by a random amount within a specified range.
```javascript
{
  "delayType": "random",
  "delayMin": 100,   // Minimum delay 100ms
  "delayMax": 1000   // Maximum delay 1000ms
}
```

### Configuring Delays

#### Via Web Interface
1. Navigate to http://localhost:3000
2. Create or edit a mock
3. In the "Response Delay Configuration" section:
   - Select delay type (None/Fixed/Random)
   - Enter delay values in milliseconds
   - Save the mock

#### Via API
```bash
# Create mock with fixed delay
curl -X POST http://localhost:3000/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "slow-api",
    "method": "GET",
    "path": "/api/data",
    "response": {"data": "example"},
    "delayType": "fixed",
    "delayFixed": 2000
  }'

# Create mock with random delay
curl -X POST http://localhost:3000/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "unstable-network",
    "method": "GET",
    "path": "/api/users",
    "response": {"users": []},
    "delayType": "random",
    "delayMin": 200,
    "delayMax": 3000
  }'
```

### Delay Examples

#### Testing Loading States
```javascript
// Slow loading user profile
{
  "scenario": "user-profile",
  "method": "GET",
  "path": "/api/profile/:id",
  "response": {
    "id": "123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "delayType": "fixed",
  "delayFixed": 1500  // 1.5 second delay
}
```

#### Simulating Unstable Connection
```javascript
// Variable network conditions
{
  "scenario": "flaky-network",
  "method": "POST",
  "path": "/api/upload",
  "response": {
    "status": "success",
    "fileId": "abc123"
  },
  "delayType": "random",
  "delayMin": 50,
  "delayMax": 5000  // Between 50ms and 5 seconds
}
```

#### Performance Testing Setup
Use the "Setup Delay Examples" button in the UI or run:
```bash
# This creates multiple endpoints with different delay profiles:
# /api/fast - No delay
# /api/normal - 300ms fixed delay
# /api/slow - 2 second fixed delay
# /api/variable - 100-1000ms random delay
# /api/unstable - 50-5000ms random delay
```

## 📁 File Management

### Upload Files
```bash
# Upload via web interface (recommended)
# Go to http://localhost:3000 → File Upload tab

# Upload via API
curl -X POST http://localhost:3000/admin/files/upload \
  -F "files=@example.tar.gz" \
  -F "scenario=production" \
  -F "method=GET"
```

### File Response with Delay
```bash
# Create a file-based mock with delay
curl -X POST http://localhost:3000/admin/mock/file \
  -F "files=@document.pdf" \
  -F "scenario=downloads" \
  -F "method=GET" \
  -F "path=/api/download/contract" \
  -F "delayType=fixed" \
  -F "delayFixed=1000"
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

## 🔌 API Endpoints

### Core Mock Management
- `GET /admin/scenario` - Get current scenario
- `POST /admin/scenario` - Set scenario
- `GET /admin/scenarios` - List all scenarios
- `POST /admin/mock` - Create/update mock response (supports delay configuration)
- `POST /admin/mock/file` - Create file-based mock (supports delay configuration)
- `GET /admin/mocks/summary` - Get mock summaries (shows delay info)
- `GET /admin/mock/:id` - Get mock details (includes delay configuration)
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
- `GET /admin/history` - Request history (includes delay tracking)
- `DELETE /admin/history` - Clear history
- `POST /admin/switch-database` - Switch database type

## 🎯 Advanced Features

### Scenario Auto-Transitions with Delays
```javascript
// Create a mock that automatically switches scenarios after a delay
{
  "scenario": "order_created",
  "method": "POST",
  "path": "/api/orders",
  "response": {
    "statusCode": 201,
    "body": { "orderId": "12345", "status": "created" }
  },
  "nextScenario": "order_processing",
  "delayType": "fixed",
  "delayFixed": 3000  // Wait 3 seconds before switching scenarios
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
  },
  "delayType": "random",
  "delayMin": 200,
  "delayMax": 800  // Simulate variable authentication time
}
```

### File Response Mock with Delay
```javascript
// Serve files through mock endpoints with simulated download time
{
  "scenario": "file_download",
  "method": "GET",
  "path": "/api/download/:fileId",
  "response": {
    "statusCode": 302,
    "headers": { "Location": "/files/data-export.zip" }
  },
  "delayType": "fixed",
  "delayFixed": 2000  // Simulate server processing time
}
```

## 📊 Request History & Performance Tracking

The request history now includes detailed delay information:
- **Total Processing Time**: End-to-end request time
- **Artificial Delay Applied**: The delay added by the mock
- **Actual Server Processing**: Time minus artificial delay
- **Performance Statistics**: Average delays, max delays, etc.

### Filtering by Delay
In the request history UI, you can filter requests by delay category:
- **No Delay**: Immediate responses
- **Fast**: < 100ms
- **Normal**: 100-500ms
- **Slow**: 500-2000ms
- **Very Slow**: > 2000ms

## 📝 Logging

### Log Levels
- **error**: Error conditions
- **warn**: Warning conditions  
- **info**: General information (default)
- **debug**: Detailed debug information (includes delay application logs)

### Log Files
- `logs/app.log` - All application logs
- `logs/error.log` - Error logs only
- `logs/debug.log` - Debug logs (includes delay timing details)

### Configuration
```bash
# Environment variables
LOG_LEVEL=debug              # Application log level
CONSOLE_LOG_LEVEL=info       # Console output level
```

## 🐳 Docker Support

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

## 🔧 Configuration

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

## 🎯 Use Cases

### API Development & Testing
- Mock third-party APIs during development
- Test loading states and spinners with delays
- Simulate slow network conditions
- Test timeout handling with long delays
- Create realistic test data with file uploads

### Performance Testing
- Identify timeout issues in client applications
- Test application behavior under varying network conditions
- Measure application performance with different response times
- Stress test retry mechanisms

### Integration Testing
- Test API workflows with scenario transitions
- Validate request/response handling under latency
- Performance testing with request history
- File upload/download testing with simulated transfer times

### Demo & Prototyping
- Create realistic API demos with natural response times
- Demonstrate loading states and progress indicators
- Prototype complex workflows with timing
- Showcase API behavior under different conditions

## 📈 Monitoring & Analytics

### Health Monitoring
```bash
# Check server health
curl http://localhost:3000/health

# Run comprehensive health check
npm run health
```

### Performance Metrics
- Request processing times (with and without delays)
- Artificial delay vs actual processing time breakdown
- Database operation durations
- File upload/download statistics
- Memory and CPU usage tracking

### Request Analytics
- Complete request/response history with delay tracking
- Delay distribution analysis
- Performance bottleneck identification
- Response time patterns

## ⚡ Performance Tips

1. **Use MongoDB for production** with large datasets (>1000 mocks)
2. **Configure appropriate delays** - avoid excessive delays in production
3. **Monitor delay impact** - check request history for performance issues
4. **Use random delays sparingly** - they can make debugging harder
5. **Set realistic delay ranges** - match your actual API performance
6. **Consider timeout settings** - ensure client timeouts exceed max delays

## 🔒 Security Considerations

- **File validation**: Validate uploaded file types and sizes
- **CORS configuration**: Set appropriate origins for your environment
- **Access control**: Consider implementing authentication for production
- **Environment variables**: Keep sensitive data in .env files
- **Network security**: Use HTTPS in production environments
- **Delay limits**: Set reasonable maximum delays to prevent DoS

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Update documentation
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 💬 Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check README and inline code comments
- **Health Endpoint**: Monitor server status at `/health`
- **Logs**: Check `logs/` directory for troubleshooting
- **Discord/Slack**: Join our community for support

---

## 🎉 Happy Mocking!

This Universal Mock Server provides everything you need for comprehensive API mocking with enterprise-grade features. Whether you're developing, testing, or demonstrating APIs, it adapts to your workflow and scales with your needs.

**Start mocking in seconds, scale to enterprise!** 🚀