/**
 * Enhanced Server Configuration with Health Checks
 * SabPaisa QR Backend
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Import health check routes
const healthRoutes = require('./routes/health');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// IMPORTANT: Health check routes BEFORE authentication
// This ensures health checks work without authentication
app.use('/', healthRoutes);

// === EXISTING APPLICATION ROUTES ===
// Add your existing routes here after health checks

// Example: Merchant API routes (if they exist)
// const merchantRoutes = require('./routes/merchant');
// app.use('/api/v1/merchant', authenticateAPI, merchantRoutes);

// HDFC Webhook endpoint (from original implementation)
app.post('/api/hdfc/webhook', (req, res) => {
    console.log('Webhook received:', req.body);
    
    // Process webhook (existing logic)
    try {
        // Your existing webhook processing logic here
        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully'
        });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Webhook processing failed'
        });
    }
});

// QR Code API endpoints (placeholder - add your existing routes)
app.get('/api/v1/merchant/qr/list', (req, res) => {
    // Your existing QR list logic
    res.json({
        success: true,
        data: {
            qr_codes: [],
            pagination: {
                page: 1,
                limit: 10,
                total: 0
            }
        }
    });
});

// === END OF EXISTING ROUTES ===

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(isDevelopment && { stack: err.stack }),
        timestamp: new Date().toISOString()
    });
});

// Server startup
const server = app.listen(PORT, () => {
    console.log('===========================================');
    console.log('SabPaisa QR Backend Server');
    console.log('===========================================');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Port: ${PORT}`);
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('===========================================');
    console.log('Health Check Endpoints:');
    console.log(`  GET  http://localhost:${PORT}/health`);
    console.log(`  GET  http://localhost:${PORT}/health/detailed`);
    console.log(`  GET  http://localhost:${PORT}/live`);
    console.log(`  GET  http://localhost:${PORT}/ready`);
    console.log(`  GET  http://localhost:${PORT}/startup`);
    console.log(`  GET  http://localhost:${PORT}/metrics`);
    console.log('===========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        // Close database connections if any
        if (global.dbConnection) {
            global.dbConnection.end(() => {
                console.log('Database connection closed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        if (global.dbConnection) {
            global.dbConnection.end(() => {
                console.log('Database connection closed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Log the error but keep the process running
    // In production, you might want to restart the process
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Log the error but keep the process running
});

module.exports = app;