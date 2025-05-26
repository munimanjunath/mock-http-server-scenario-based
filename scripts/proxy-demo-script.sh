#!/bin/bash

# Universal Mock Server - Proxy-Like Demo Setup
# This script demonstrates proxy-like behavior using the mock server

echo "🚀 Setting up proxy-like mock server demo..."

# Base URL
BASE_URL="http://localhost:3000"

# 1. Create a mock that simulates proxying to an external API with caching
echo "1️⃣ Creating cached proxy mock..."
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "proxy-cache",
    "method": "GET",
    "path": "/proxy/api/weather/:city",
    "rule": "!headers[\"cache-control\"] || headers[\"cache-control\"] != \"no-cache\"",
    "response": {
      "statusCode": 200,
      "headers": {
        "X-Cache": "HIT",
        "X-Cache-TTL": "300",
        "X-Proxied-From": "weather-service.internal"
      },
      "body": {
        "city": "{{path.city}}",
        "temperature": 72,
        "conditions": "Sunny",
        "cached": true,
        "cachedAt": "2025-01-20T10:00:00Z"
      }
    }
  }'

# 2. Create a mock for cache bypass
echo "2️⃣ Creating cache bypass mock..."
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "proxy-cache",
    "method": "GET",
    "path": "/proxy/api/weather/:city",
    "rule": "headers[\"cache-control\"] == \"no-cache\"",
    "response": {
      "statusCode": 200,
      "headers": {
        "X-Cache": "MISS",
        "X-Proxied-From": "weather-service.internal",
        "X-Response-Time": "245ms"
      },
      "body": {
        "city": "{{path.city}}",
        "temperature": 75,
        "conditions": "Partly Cloudy",
        "cached": false,
        "timestamp": "2025-01-20T10:15:00Z"
      }
    }
  }'

# 3. Create load balancer simulation
echo "3️⃣ Creating load balancer mocks..."

# Backend 1
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "loadbalancer",
    "method": "GET",
    "path": "/proxy/backend/health",
    "rule": "parseInt(headers[\"x-request-id\"]) % 2 == 0",
    "response": {
      "headers": {
        "X-Backend-Server": "backend-1",
        "X-Backend-IP": "10.0.1.10"
      },
      "body": {
        "server": "backend-1",
        "status": "healthy",
        "load": 45
      }
    }
  }'

# Backend 2
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "loadbalancer",
    "method": "GET",
    "path": "/proxy/backend/health",
    "rule": "parseInt(headers[\"x-request-id\"]) % 2 == 1",
    "response": {
      "headers": {
        "X-Backend-Server": "backend-2",
        "X-Backend-IP": "10.0.1.11"
      },
      "body": {
        "server": "backend-2",
        "status": "healthy",
        "load": 62
      }
    }
  }'

# 4. Create authentication proxy mock
echo "4️⃣ Creating auth proxy mock..."

# Valid token passes through
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "auth-proxy",
    "method": "GET",
    "path": "/proxy/secure/data",
    "rule": "headers.authorization && headers.authorization.startsWith(\"Bearer \")",
    "response": {
      "headers": {
        "X-Auth-Status": "valid",
        "X-User-ID": "user-123"
      },
      "body": {
        "data": "Sensitive information",
        "user": "user-123",
        "permissions": ["read", "write"]
      }
    }
  }'

# Invalid/missing token blocked
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "auth-proxy",
    "method": "GET",
    "path": "/proxy/secure/data",
    "rule": "!headers.authorization || !headers.authorization.startsWith(\"Bearer \")",
    "response": {
      "statusCode": 401,
      "headers": {
        "WWW-Authenticate": "Bearer realm=\"api\""
      },
      "body": {
        "error": "Unauthorized",
        "message": "Valid authentication required"
      }
    }
  }'

# 5. Create retry proxy mock (simulates intermittent failures)
echo "5️⃣ Creating retry simulation mock..."

# First attempt fails
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "retry-scenario-fail",
    "method": "POST",
    "path": "/proxy/unstable/api",
    "response": {
      "statusCode": 503,
      "headers": {
        "Retry-After": "2"
      },
      "body": {
        "error": "Service temporarily unavailable",
        "retry": true
      }
    },
    "nextScenario": "retry-scenario-success"
  }'

# Retry succeeds
curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "retry-scenario-success",
    "method": "POST",
    "path": "/proxy/unstable/api",
    "response": {
      "statusCode": 200,
      "body": {
        "success": true,
        "message": "Operation completed on retry"
      }
    },
    "nextScenario": "retry-scenario-fail"
  }'

# 6. Create request/response transformation mock
echo "6️⃣ Creating transformation proxy mock..."

curl -X POST $BASE_URL/admin/mock \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "transform-proxy",
    "method": "POST",
    "path": "/proxy/legacy/api",
    "rule": "inputPayload.firstName && inputPayload.lastName",
    "response": {
      "statusCode": 200,
      "headers": {
        "X-Transformed": "true",
        "X-Original-Format": "legacy"
      },
      "body": {
        "full_name": "{{inputPayload.firstName}} {{inputPayload.lastName}}",
        "transformed_at": "2025-01-20T10:30:00Z",
        "legacy_id": "USR_12345"
      }
    }
  }'

echo "✅ Setup complete! Setting active scenarios..."

# Set scenarios
curl -X POST $BASE_URL/admin/scenario \
  -H "Content-Type: application/json" \
  -d '{"scenario": "proxy-cache"}'

echo ""
echo "📋 Test Examples:"
echo ""
echo "1. Cached proxy request:"
echo "   curl $BASE_URL/proxy/api/weather/newyork"
echo ""
echo "2. Bypass cache:"
echo "   curl $BASE_URL/proxy/api/weather/newyork -H 'Cache-Control: no-cache'"
echo ""
echo "3. Load balancer (alternate between backends):"
echo "   curl $BASE_URL/proxy/backend/health -H 'X-Request-ID: 1'"
echo "   curl $BASE_URL/proxy/backend/health -H 'X-Request-ID: 2'"
echo ""
echo "4. Auth proxy (with token):"
echo "   curl $BASE_URL/proxy/secure/data -H 'Authorization: Bearer my-token'"
echo ""
echo "5. Retry simulation (first fails, retry succeeds):"
echo "   curl -X POST $BASE_URL/admin/scenario -d '{\"scenario\":\"retry-scenario-fail\"}'"
echo "   curl -X POST $BASE_URL/proxy/unstable/api"
echo "   curl -X POST $BASE_URL/proxy/unstable/api  # This will succeed"
echo ""
echo "6. Transform proxy:"
echo "   curl -X POST $BASE_URL/proxy/legacy/api -H 'Content-Type: application/json' \\"
echo "        -d '{\"firstName\":\"John\",\"lastName\":\"Doe\"}'"