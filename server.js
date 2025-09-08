const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import routes
const hdfcWebhookRoutes = require('./routes/hdfc.webhook');
const bulkQRRoutes = require('./routes/bulkQR');
const merchantAPIRoutes = require('./routes/api/v1/merchant');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io for real-time updates
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
});

// Make io globally available for webhook handlers
global.io = io;

// Middleware - Allow all origins for API testing
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-API-Secret']
}));

// Regular body parser for all routes (webhook needs JSON too)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        next();
    });
}

// API Routes
app.use('/api', hdfcWebhookRoutes);
app.use('/api/bulk-qr', bulkQRRoutes);
app.use('/api/v1/merchant', merchantAPIRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'HDFC Webhook Server',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        webhookUrl: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3001'}/api/hdfc/webhook`
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Join room for specific client/merchant
    socket.on('join', (data) => {
        if (data.clientId) {
            socket.join(`client_${data.clientId}`);
            console.log(`Socket ${socket.id} joined room: client_${data.clientId}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
            status: err.status || 500
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: {
            message: 'Endpoint not found',
            status: 404
        }
    });
});

// Start server
const PORT = process.env.WEBHOOK_PORT || 3001;
server.listen(PORT, () => {
    console.log('===========================================');
    console.log(`HDFC Webhook Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Webhook URL: ${process.env.WEBHOOK_BASE_URL || 'http://localhost:' + PORT}/api/hdfc/webhook`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log('===========================================');
    
    // Log webhook registration info for HDFC
    console.log('\nHDFC Webhook Registration Info:');
    console.log('--------------------------------');
    console.log('Callback URL to provide to HDFC:');
    console.log(`${process.env.WEBHOOK_BASE_URL || 'https://api.sabpaisa.in'}/api/hdfc/webhook`);
    console.log('--------------------------------');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

module.exports = { app, server, io };