const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'hdfc-webhook' },
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // File output for errors
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error'
        }),
        // File output for all logs
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log')
        })
    ]
});

// Add custom log methods
logger.logWebhook = (message, data) => {
    logger.info(`[WEBHOOK] ${message}`, data);
};

logger.logTransaction = (message, data) => {
    logger.info(`[TRANSACTION] ${message}`, data);
};

logger.logError = (message, error) => {
    logger.error(`[ERROR] ${message}`, {
        error: error.message,
        stack: error.stack
    });
};

module.exports = logger;