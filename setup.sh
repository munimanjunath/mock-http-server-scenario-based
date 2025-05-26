#!/bin/bash
# Enhanced Universal Mock Server Setup Script for Linux/macOS

set -e  # Exit on any error

echo "========================================"
echo "Universal Mock Server Setup (Linux/macOS)"
echo "========================================"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "❌ ${RED}Node.js is not installed or not in PATH${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "✅ ${GREEN}Node.js found:${NC} $(node --version)"
echo

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "❌ ${RED}package.json not found. Please run this script from the project root directory.${NC}"
    exit 1
fi

echo -e "📦 ${BLUE}Installing dependencies...${NC}"
npm install
echo

echo -e "⚙️  ${BLUE}Setting up environment...${NC}"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "📄 ${YELLOW}Creating .env file...${NC}"
    cp .env.example .env
    echo -e "✅ ${GREEN}.env file created. Please edit it with your configuration.${NC}"
else
    echo -e "ℹ️  ${YELLOW}.env file already exists${NC}"
fi

echo
echo -e "🗂️  ${BLUE}Creating required directories...${NC}"
mkdir -p uploads files logs db backups scripts

# Make scripts executable
chmod +x scripts/setup.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

echo
echo -e "🔧 ${BLUE}Setup Options:${NC}"
echo "[1] Use SQLite (Default - No additional setup required)"
echo "[2] Use MongoDB (Requires MongoDB installation)"
echo "[3] Use Docker (Requires Docker)"
echo

read -p "Choose setup option (1-3): " choice

case $choice in
    1)
        echo
        echo -e "🔧 ${BLUE}Configuring for SQLite...${NC}"
        
        # Add or update DB_TYPE in .env
        if grep -q "DB_TYPE=" .env; then
            sed -i.bak 's/^DB_TYPE=.*/DB_TYPE=sqlite/' .env
        else
            echo "DB_TYPE=sqlite" >> .env
        fi
        
        echo -e "✅ ${GREEN}SQLite configuration completed${NC}"
        echo
        echo -e "🚀 ${BLUE}Starting server...${NC}"
        npm start
        ;;
    2)
        echo
        echo -e "🔧 ${BLUE}Configuring for MongoDB...${NC}"
        echo
        echo "Please ensure MongoDB is installed and running."
        echo "Default connection: mongodb://localhost:27017"
        echo
        read -p "Enter MongoDB URL (or press Enter for default): " mongourl
        mongourl=${mongourl:-mongodb://localhost:27017}
        
        # Add or update DB_TYPE and MONGODB_URL in .env
        if grep -q "DB_TYPE=" .env; then
            sed -i.bak 's/^DB_TYPE=.*/DB_TYPE=mongodb/' .env
        else
            echo "DB_TYPE=mongodb" >> .env
        fi
        
        if grep -q "MONGODB_URL=" .env; then
            sed -i.bak "s|^MONGODB_URL=.*|MONGODB_URL=$mongourl|" .env
        else
            echo "MONGODB_URL=$mongourl" >> .env
        fi
        
        echo -e "✅ ${GREEN}MongoDB configuration completed${NC}"
        echo
        echo -e "🧪 ${BLUE}Testing MongoDB connection...${NC}"
        
        if npm run test:connection; then
            echo -e "✅ ${GREEN}MongoDB connection successful${NC}"
            echo
            echo -e "🚀 ${BLUE}Starting server...${NC}"
            npm start
        else
            echo -e "❌ ${RED}MongoDB connection failed. Please check your MongoDB installation and configuration.${NC}"
            exit 1
        fi
        ;;
    3)
        echo
        echo -e "🐳 ${BLUE}Starting with Docker...${NC}"
        echo
        
        if ! command -v docker &> /dev/null; then
            echo -e "❌ ${RED}Docker is not installed or not in PATH${NC}"
            echo "Please install Docker from https://docker.com/"
            exit 1
        fi
        
        if ! command -v docker-compose &> /dev/null; then
            echo -e "❌ ${RED}Docker Compose is not installed or not in PATH${NC}"
            echo "Please install Docker Compose"
            exit 1
        fi
        
        echo -e "✅ ${GREEN}Docker found${NC}"
        echo -e "🚀 ${BLUE}Starting services with Docker Compose...${NC}"
        
        docker-compose up -d
        
        echo -e "✅ ${GREEN}Services started successfully${NC}"
        echo
        echo -e "📊 ${BLUE}Service Status:${NC}"
        docker-compose ps
        echo
        echo -e "🌐 ${GREEN}Server should be available at: http://localhost:3000${NC}"
        echo -e "📊 ${GREEN}MongoDB available at: localhost:27017${NC}"
        echo
        echo "Use 'docker-compose logs -f' to view logs"
        echo "Use 'docker-compose down' to stop services"
        ;;
    *)
        echo -e "❌ ${RED}Invalid choice. Please run the script again.${NC}"
        exit 1
        ;;
esac

echo
echo "========================================"
echo -e "🎉 ${GREEN}Setup completed successfully!${NC}"
echo
echo -e "📚 ${BLUE}Quick Start:${NC}"
echo "  • Server: http://localhost:3000"
echo "  • Health: http://localhost:3000/health"
echo "  • Logs: check ./logs/ directory"
echo
echo -e "🔧 ${BLUE}Management Commands:${NC}"
echo "  • npm start          - Start server"
echo "  • npm run dev        - Start with auto-reload"
echo "  • npm run health     - Check server health"
echo "  • npm run docker:up  - Start with Docker"
echo
echo -e "📖 ${BLUE}Check README.md for detailed documentation${NC}"
echo "=========================================="