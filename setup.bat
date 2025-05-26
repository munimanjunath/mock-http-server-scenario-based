@echo off
REM Enhanced Universal Mock Server Setup Script for Windows
echo ========================================
echo Universal Mock Server Setup (Windows)
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js found: 
node --version
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ package.json not found. Please run this script from the project root directory.
    pause
    exit /b 1
)

echo 📦 Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ⚙️  Setting up environment...

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo 📄 Creating .env file...
    copy .env.example .env
    echo ✅ .env file created. Please edit it with your configuration.
) else (
    echo ℹ️  .env file already exists
)

echo.
echo 🗂️  Creating required directories...
if not exist "uploads" mkdir uploads
if not exist "files" mkdir files
if not exist "logs" mkdir logs
if not exist "db" mkdir db
if not exist "backups" mkdir backups

echo.
echo 🔧 Setup Options:
echo [1] Use SQLite (Default - No additional setup required)
echo [2] Use MongoDB (Requires MongoDB installation)
echo [3] Use Docker (Requires Docker Desktop)
echo.

set /p choice="Choose setup option (1-3): "

if "%choice%"=="1" (
    echo.
    echo 🔧 Configuring for SQLite...
    echo DB_TYPE=sqlite >> .env 2>nul
    echo ✅ SQLite configuration completed
    echo.
    echo 🚀 Starting server...
    call npm start
) else if "%choice%"=="2" (
    echo.
    echo 🔧 Configuring for MongoDB...
    echo.
    echo Please ensure MongoDB is installed and running.
    echo Default connection: mongodb://localhost:27017
    echo.
    set /p mongourl="Enter MongoDB URL (or press Enter for default): "
    if "%mongourl%"=="" set mongourl=mongodb://localhost:27017
    
    echo DB_TYPE=mongodb >> .env 2>nul
    echo MONGODB_URL=%mongourl% >> .env 2>nul
    
    echo ✅ MongoDB configuration completed
    echo.
    echo 🧪 Testing MongoDB connection...
    call npm run test:connection
    if %errorlevel% equ 0 (
        echo ✅ MongoDB connection successful
        echo.
        echo 🚀 Starting server...
        call npm start
    ) else (
        echo ❌ MongoDB connection failed. Please check your MongoDB installation and configuration.
        pause
    )
) else if "%choice%"=="3" (
    echo.
    echo 🐳 Starting with Docker...
    echo.
    docker --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo ❌ Docker is not installed or not in PATH
        echo Please install Docker Desktop from https://docker.com/
        pause
        exit /b 1
    )
    
    echo ✅ Docker found
    echo 🚀 Starting services with Docker Compose...
    call docker-compose up -d
    
    if %errorlevel% equ 0 (
        echo ✅ Services started successfully
        echo.
        echo 📊 Service Status:
        call docker-compose ps
        echo.
        echo 🌐 Server should be available at: http://localhost:3000
        echo 📊 MongoDB available at: localhost:27017
        echo.
        echo Use 'docker-compose logs -f' to view logs
        echo Use 'docker-compose down' to stop services
    ) else (
        echo ❌ Failed to start Docker services
        pause
    )
) else (
    echo ❌ Invalid choice. Please run the script again.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Setup completed successfully! 🎉
echo.
echo 📚 Quick Start:
echo   • Server: http://localhost:3000
echo   • Health: http://localhost:3000/health
echo   • Logs: check ./logs/ directory
echo.
echo 🔧 Management Commands:
echo   • npm start          - Start server
echo   • npm run dev        - Start with auto-reload
echo   • npm run health     - Check server health
echo   • npm run docker:up  - Start with Docker
echo.
echo 📖 Check README.md for detailed documentation
echo ========================================
pause