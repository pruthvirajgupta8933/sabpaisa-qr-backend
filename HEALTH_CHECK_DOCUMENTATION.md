# Health Check Implementation Documentation
## SabPaisa QR Backend - Production Ready

### Overview
This is a complete, production-ready health check implementation for the SabPaisa QR Backend service. It provides comprehensive monitoring endpoints that DevOps teams can use for load balancers, Kubernetes probes, and monitoring systems.

## 🚀 Quick Start

### Installation
```bash
cd backend-health-check
npm install
```

### Running the Server
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev

# Test health endpoints
npm run test
```

## 📍 Health Check Endpoints

### 1. Basic Health Check
**URL:** `/health`  
**Method:** `GET`  
**Purpose:** Quick health verification for load balancers  
**Response Time:** < 10ms  

**Success Response (200):**
```json
{
  "status": "healthy",
  "service": "SabPaisa QR Backend",
  "version": "1.0.0",
  "timestamp": "2025-01-12T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

### 2. Detailed Health Check
**URL:** `/health/detailed`  
**Method:** `GET`  
**Purpose:** Comprehensive system and dependency checks  
**Response Time:** < 100ms  

**Success Response (200):**
```json
{
  "status": "healthy",
  "service": "SabPaisa QR Backend",
  "version": "1.0.0",
  "timestamp": "2025-01-12T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection successful",
      "responseTime": "< 10ms"
    },
    "externalAPIs": {
      "status": "healthy",
      "message": "External APIs reachable",
      "services": {
        "hdfc": "reachable"
      }
    },
    "system": {
      "status": "healthy",
      "memory": {
        "system": {
          "total": "16.00 GB",
          "free": "8.50 GB",
          "used": "7.50 GB",
          "percentage": "46.88%"
        },
        "process": {
          "rss": "45.23 MB",
          "heapTotal": "20.45 MB",
          "heapUsed": "12.34 MB",
          "heapUsedPercent": "60.34%"
        }
      },
      "cpu": {
        "cores": 8,
        "loadAverage": [1.2, 1.5, 1.8]
      }
    }
  },
  "metadata": {
    "node_version": "v18.0.0",
    "pid": 12345,
    "hostname": "prod-server-01"
  }
}
```

### 3. Kubernetes Liveness Probe
**URL:** `/live`  
**Method:** `GET`  
**Purpose:** Indicates if the application is running  
**Response Time:** < 5ms  

**Success Response (200):**
```json
{
  "alive": true,
  "timestamp": "2025-01-12T10:30:00.000Z"
}
```

### 4. Kubernetes Readiness Probe
**URL:** `/ready`  
**Method:** `GET`  
**Purpose:** Indicates if the application is ready to receive traffic  
**Response Time:** < 50ms  

**Success Response (200):**
```json
{
  "ready": true,
  "timestamp": "2025-01-12T10:30:00.000Z",
  "checks": {
    "database": "healthy"
  }
}
```

### 5. Kubernetes Startup Probe
**URL:** `/startup`  
**Method:** `GET`  
**Purpose:** Used during application startup  
**Response Time:** < 5ms  

**Success Response (200):**
```json
{
  "started": true,
  "uptime": 15,
  "timestamp": "2025-01-12T10:30:00.000Z"
}
```

### 6. Prometheus Metrics
**URL:** `/metrics`  
**Method:** `GET`  
**Purpose:** Detailed metrics for monitoring systems  
**Response Time:** < 20ms  

**Success Response (200):**
```json
{
  "timestamp": "2025-01-12T10:30:00.000Z",
  "service": "sabpaisa_qr_backend",
  "uptime_seconds": 3600,
  "memory_heap_used_bytes": 12345678,
  "memory_heap_total_bytes": 20456789,
  "memory_rss_bytes": 45234567,
  "system_load_average": [1.2, 1.5, 1.8],
  "nodejs_version": "v18.0.0",
  "nodejs_active_handles": 5,
  "nodejs_active_requests": 2
}
```

### 7. Root Redirect
**URL:** `/`  
**Method:** `GET`  
**Purpose:** Redirects to `/health` for convenience  
**Response:** 302 Redirect to `/health`

## 🔧 DevOps Configuration

### Load Balancer Configuration (AWS ALB/ELB)
```yaml
Health Check Settings:
  Protocol: HTTP
  Path: /health
  Port: 3001
  Healthy Threshold: 2
  Unhealthy Threshold: 3
  Timeout: 5 seconds
  Interval: 30 seconds
  Success Codes: 200
```

### Kubernetes Configuration
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sabpaisa-qr-backend
spec:
  containers:
  - name: backend
    image: sabpaisa/qr-backend:latest
    ports:
    - containerPort: 3001
    
    # Liveness Probe
    livenessProbe:
      httpGet:
        path: /live
        port: 3001
      initialDelaySeconds: 30
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
    
    # Readiness Probe
    readinessProbe:
      httpGet:
        path: /ready
        port: 3001
      initialDelaySeconds: 10
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 3
    
    # Startup Probe (K8s 1.16+)
    startupProbe:
      httpGet:
        path: /startup
        port: 3001
      initialDelaySeconds: 0
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 30
```

### Docker Compose Configuration
```yaml
version: '3.8'
services:
  backend:
    image: sabpaisa/qr-backend:latest
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s
```

### Nginx Configuration
```nginx
upstream backend {
    server backend1:3001 max_fails=3 fail_timeout=30s;
    server backend2:3001 max_fails=3 fail_timeout=30s;
}

location /health {
    access_log off;
    proxy_pass http://backend/health;
    proxy_read_timeout 5s;
}
```

## 📊 Monitoring Integration

### Prometheus Configuration
```yaml
scrape_configs:
  - job_name: 'sabpaisa-qr-backend'
    static_configs:
      - targets: ['backend:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Grafana Dashboard Queries
```promql
# Uptime
sabpaisa_qr_backend_uptime_seconds

# Memory Usage
rate(sabpaisa_qr_backend_memory_heap_used_bytes[5m])

# Request Rate
rate(http_requests_total{job="sabpaisa-qr-backend"}[5m])
```

### CloudWatch Alarms (AWS)
```json
{
  "AlarmName": "SabPaisa-Backend-Health",
  "MetricName": "HealthCheckStatus",
  "Namespace": "AWS/ELB",
  "Statistic": "Average",
  "Period": 300,
  "EvaluationPeriods": 2,
  "Threshold": 1,
  "ComparisonOperator": "LessThanThreshold"
}
```

## 🚨 Status Codes

| Status Code | Meaning | Action Required |
|-------------|---------|-----------------|
| 200 | Healthy | None |
| 503 | Service Unavailable | Check dependencies, may be starting up or shutting down |
| 500 | Internal Error | Check logs, possible application error |
| 404 | Not Found | Check endpoint URL |

## 🔄 Graceful Shutdown

The service implements graceful shutdown:
1. Receives SIGTERM/SIGINT signal
2. Stops accepting new connections
3. Health checks return 503 status
4. Waits for existing requests to complete (10s timeout)
5. Closes database connections
6. Exits cleanly

## 🛠️ Environment Variables

```bash
# Required
PORT=3001
NODE_ENV=production

# Optional
APP_VERSION=1.0.0
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=sabpaisa_qr
HDFC_API_URL=https://upitestv2.hdfcbank.com
WEBHOOK_BASE_URL=https://your-domain.com
HEALTH_CHECK_CACHE_DURATION=5000
GRACEFUL_SHUTDOWN_TIMEOUT=10000
```

## 📝 Testing

### Manual Testing
```bash
# Test all endpoints
npm test

# Individual endpoint tests
curl http://localhost:3001/health
curl http://localhost:3001/health/detailed | jq .
curl http://localhost:3001/live
curl http://localhost:3001/ready
curl http://localhost:3001/metrics
```

### Automated Testing
```bash
# Run test script
node test-health.js

# CI/CD pipeline check
npm run health:check
```

## 🔍 Troubleshooting

### Health Check Failing
1. Check if service is running: `ps aux | grep node`
2. Check logs: `tail -f /var/log/sabpaisa/backend.log`
3. Test locally: `curl localhost:3001/health`
4. Check dependencies: `curl localhost:3001/health/detailed`

### High Memory Usage
- Check `/health/detailed` for memory metrics
- Review `/metrics` endpoint for detailed breakdown
- Consider increasing heap size: `NODE_OPTIONS="--max-old-space-size=4096"`

### Database Connection Issues
- Check `/ready` endpoint for database status
- Verify database credentials in environment variables
- Test database connectivity separately

## 📌 Best Practices Implemented

✅ **No Authentication Required** - Health checks bypass authentication  
✅ **Fast Response Times** - Basic health check < 10ms  
✅ **Caching** - Expensive checks cached for 5 seconds  
✅ **Graceful Degradation** - Service can run without database  
✅ **Detailed Metrics** - Comprehensive system information  
✅ **Standard Formats** - JSON responses, standard HTTP codes  
✅ **Kubernetes Native** - Separate liveness/readiness/startup probes  
✅ **Production Ready** - Error handling, logging, monitoring  

## 📞 Support

For issues or questions about health check implementation:
1. Check this documentation first
2. Review logs at `/var/log/sabpaisa/`
3. Contact DevOps team with health check response details

---

**Version:** 1.0.0  
**Last Updated:** January 2025  
**Maintained By:** SabPaisa Development Team