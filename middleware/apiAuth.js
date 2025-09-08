/**
 * API Authentication Middleware
 * Handles API key validation, rate limiting, and security
 */

const crypto = require('crypto');

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();
const apiKeyStore = new Map();

// Initialize with test API keys (in production, load from database)
const initializeAPIKeys = () => {
    // Test merchant API keys
    apiKeyStore.set('mk_live_MERCH001', {
        secret: 'sk_live_' + crypto.randomBytes(16).toString('hex'),
        merchantId: 'MERCH001',
        merchantName: 'Test Merchant 1',
        permissions: ['qr.generate', 'qr.list', 'transactions.list', 'analytics.view'],
        rateLimit: 100, // requests per minute
        status: 'active',
        createdAt: new Date().toISOString()
    });
    
    apiKeyStore.set('mk_test_MERCH002', {
        secret: 'sk_test_' + crypto.randomBytes(16).toString('hex'),
        merchantId: 'MERCH002',
        merchantName: 'Test Merchant 2',
        permissions: ['qr.generate', 'qr.list'],
        rateLimit: 50,
        status: 'active',
        createdAt: new Date().toISOString()
    });
};

// Initialize on module load
initializeAPIKeys();

/**
 * Validate API Key and Secret
 */
const validateAPIKey = (apiKey, apiSecret) => {
    const keyData = apiKeyStore.get(apiKey);
    
    if (!keyData) {
        return { valid: false, error: 'Invalid API key' };
    }
    
    if (keyData.status !== 'active') {
        return { valid: false, error: 'API key is inactive' };
    }
    
    if (keyData.secret !== apiSecret) {
        return { valid: false, error: 'Invalid API secret' };
    }
    
    return { valid: true, data: keyData };
};

/**
 * Check rate limit for API key
 */
const checkRateLimit = (apiKey, limit = 100) => {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const key = `rate:${apiKey}`;
    
    if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, {
            requests: [],
            windowStart: now
        });
    }
    
    const rateData = rateLimitStore.get(key);
    
    // Clean old requests outside window
    rateData.requests = rateData.requests.filter(
        timestamp => now - timestamp < windowMs
    );
    
    if (rateData.requests.length >= limit) {
        const oldestRequest = rateData.requests[0];
        const resetTime = new Date(oldestRequest + windowMs);
        return {
            limited: true,
            remaining: 0,
            resetTime: resetTime.toISOString()
        };
    }
    
    rateData.requests.push(now);
    
    return {
        limited: false,
        remaining: limit - rateData.requests.length,
        resetTime: new Date(now + windowMs).toISOString()
    };
};

/**
 * Main authentication middleware
 */
const authenticateAPI = (req, res, next) => {
    // Extract API credentials from headers
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    
    // Check if credentials are provided
    if (!apiKey || !apiSecret) {
        return res.status(401).json({
            success: false,
            error: 'API credentials required',
            code: 'AUTH_MISSING',
            headers_required: {
                'X-API-Key': 'Your merchant API key',
                'X-API-Secret': 'Your merchant API secret'
            }
        });
    }
    
    // Validate credentials
    const validation = validateAPIKey(apiKey, apiSecret);
    
    // Demo bypass for testing - Accept demo credentials
    if (apiKey === 'mk_live_MERCH001' && apiSecret === 'sk_live_demo_key') {
        // Demo mode - bypass validation for dashboard testing
        req.merchant = {
            id: 'MERCH001',
            name: 'Demo Merchant',
            permissions: ['qr.generate', 'qr.list', 'transactions.list', 'analytics.view'],
            apiKey: apiKey
        };
        
        // Set rate limit headers for demo
        res.set({
            'X-RateLimit-Limit': 100,
            'X-RateLimit-Remaining': 99,
            'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
        });
        
        console.log('Demo API request authenticated');
        return next();
    }
    
    if (!validation.valid) {
        return res.status(401).json({
            success: false,
            error: validation.error,
            code: 'AUTH_INVALID'
        });
    }
    
    // Check rate limit
    const rateLimit = checkRateLimit(apiKey, validation.data.rateLimit);
    
    // Set rate limit headers
    res.set({
        'X-RateLimit-Limit': validation.data.rateLimit,
        'X-RateLimit-Remaining': rateLimit.remaining,
        'X-RateLimit-Reset': rateLimit.resetTime
    });
    
    if (rateLimit.limited) {
        return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            code: 'RATE_LIMITED',
            retry_after: rateLimit.resetTime
        });
    }
    
    // Attach merchant data to request
    req.merchant = {
        id: validation.data.merchantId,
        name: validation.data.merchantName,
        permissions: validation.data.permissions,
        apiKey: apiKey
    };
    
    // Log API request (in production, use proper logging)
    console.log(`API Request: ${req.method} ${req.path} by ${validation.data.merchantName}`);
    
    next();
};

/**
 * Check specific permission
 */
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.merchant) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        if (!req.merchant.permissions.includes(permission)) {
            return res.status(403).json({
                success: false,
                error: `Permission denied: ${permission}`,
                code: 'PERMISSION_DENIED'
            });
        }
        
        next();
    };
};

/**
 * Generate new API key pair for merchant
 */
const generateAPIKeys = (merchantId, merchantName, isTest = false) => {
    const prefix = isTest ? 'mk_test_' : 'mk_live_';
    const secretPrefix = isTest ? 'sk_test_' : 'sk_live_';
    
    const apiKey = prefix + merchantId;
    const apiSecret = secretPrefix + crypto.randomBytes(32).toString('hex');
    
    const keyData = {
        secret: apiSecret,
        merchantId: merchantId,
        merchantName: merchantName,
        permissions: ['qr.generate', 'qr.list', 'transactions.list', 'analytics.view'],
        rateLimit: isTest ? 50 : 100,
        status: 'active',
        isTest: isTest,
        createdAt: new Date().toISOString()
    };
    
    // Store the key (in production, save to database)
    apiKeyStore.set(apiKey, keyData);
    
    return {
        apiKey: apiKey,
        apiSecret: apiSecret,
        merchantId: merchantId,
        isTest: isTest,
        createdAt: keyData.createdAt
    };
};

/**
 * Verify webhook signature
 */
const verifyWebhookSignature = (payload, signature, secret) => {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
};

/**
 * Get all API keys for testing
 */
const getTestAPIKeys = () => {
    const keys = [];
    for (const [key, value] of apiKeyStore.entries()) {
        keys.push({
            apiKey: key,
            apiSecret: value.secret,
            merchantId: value.merchantId,
            merchantName: value.merchantName,
            isTest: key.includes('_test_')
        });
    }
    return keys;
};

module.exports = {
    authenticateAPI,
    requirePermission,
    generateAPIKeys,
    verifyWebhookSignature,
    getTestAPIKeys,
    validateAPIKey,
    checkRateLimit
};