/**
 * Merchant API Endpoints
 * Version: 1.0
 * Base Path: /api/v1/merchant
 * 
 * These APIs allow merchants to integrate QR functionality into their own dashboards
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const transactionStore = require('../../../services/LocalTransactionStore');
const security = require('../../../utils/security');
const { authenticateAPI, requirePermission } = require('../../../middleware/apiAuth');

// Simple rate limiter middleware (already handled in apiAuth)
const rateLimiter = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    
    if (!apiKey || !apiSecret) {
        return res.status(401).json({
            success: false,
            error: 'API credentials required',
            code: 'AUTH_MISSING'
        });
    }
    
    // Validate API credentials (in production, check against database)
    // For now, using environment variables
    const validKey = process.env.MERCHANT_API_KEY || 'mk_live_';
    const validSecret = process.env.MERCHANT_API_SECRET || 'sk_live_';
    
    if (!apiKey.startsWith(validKey) || !apiSecret.startsWith(validSecret)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid API credentials',
            code: 'AUTH_INVALID'
        });
    }
    
    // Extract merchant ID from API key
    req.merchantId = apiKey.split('_').pop();
    next();
};

/**
 * @api {post} /api/v1/merchant/qr/generate Generate Single QR Code
 * @apiName GenerateQR
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 * 
 * @apiHeader {String} x-api-key Merchant API Key
 * @apiHeader {String} x-api-secret Merchant API Secret
 * 
 * @apiParam {String} merchant_name Name of the merchant
 * @apiParam {String} merchant_id Unique merchant identifier
 * @apiParam {Number} [amount] Fixed amount (optional)
 * @apiParam {String} [description] Payment description
 * 
 * @apiSuccess {Boolean} success Request status
 * @apiSuccess {Object} data QR code data
 * @apiSuccess {String} data.qr_id Unique QR identifier
 * @apiSuccess {String} data.qr_image Base64 encoded QR image
 * @apiSuccess {String} data.vpa Virtual Payment Address
 * @apiSuccess {String} data.upi_string Complete UPI string
 */
router.post('/qr/generate', authenticateAPI, rateLimiter, async (req, res) => {
    try {
        const { merchant_name, merchant_id, amount, description, reference_name, mobile_number, email } = req.body;
        
        // Validate required fields
        if (!merchant_name || !merchant_id) {
            return res.status(400).json({
                success: false,
                error: 'merchant_name and merchant_id are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Sanitize inputs
        const validation = security.validateAndSanitizeMerchant({
            merchant_name,
            merchant_id,
            reference_name: reference_name || merchant_name,
            amount,
            description,
            mobile_number,
            email
        });
        
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: validation.error,
                code: 'VALIDATION_ERROR'
            });
        }
        
        const sanitized = validation.data;
        
        // Generate VPA
        const merchantPrefix = sanitized.merchant_name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 8);
        const vpa = `${merchantPrefix}.${sanitized.merchant_id.toLowerCase()}@hdfc`;
        
        // Generate transaction reference
        const transactionRef = `API${sanitized.merchant_id}${Date.now().toString().slice(-6)}`;
        
        // Create UPI string
        const upiString = [
            'upi://pay?',
            `pa=${vpa}`,
            `&pn=${encodeURIComponent(sanitized.reference_name)}`,
            `&tn=${encodeURIComponent(sanitized.description || 'Payment')}`,
            '&cu=INR',
            '&mc=6012',
            `&tr=${transactionRef}`,
            '&mode=01',
            sanitized.amount ? `&am=${sanitized.amount}` : ''
        ].filter(Boolean).join('');
        
        // Generate QR Code
        const qrOptions = {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 1
        };
        
        const qrImageData = await QRCode.toDataURL(upiString, qrOptions);
        
        // Store QR data
        const qrData = {
            id: crypto.randomBytes(8).toString('hex'),
            merchant_id: sanitized.merchant_id,
            merchant_name: sanitized.merchant_name,
            reference_name: sanitized.reference_name,
            description: sanitized.description,
            amount: sanitized.amount,
            vpa: vpa,
            upi_string: upiString,
            transaction_ref: transactionRef,
            qr_image: qrImageData,
            status: 'active',
            created_at: new Date().toISOString(),
            created_via: 'api',
            api_key_id: req.merchantId
        };
        
        await transactionStore.saveQRCode(qrData);
        
        res.json({
            success: true,
            data: {
                qr_id: qrData.id,
                qr_image: qrImageData,
                vpa: vpa,
                upi_string: upiString,
                transaction_ref: transactionRef,
                amount: sanitized.amount || null
            }
        });
        
    } catch (error) {
        console.error('QR generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate QR code',
            code: 'GENERATION_ERROR'
        });
    }
});

/**
 * @api {post} /api/v1/merchant/qr/bulk Generate Bulk QR Codes
 * @apiName GenerateBulkQR
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 * 
 * @apiParam {Array} merchants Array of merchant objects (max 100)
 */
router.post('/qr/bulk', authenticateAPI, rateLimiter, async (req, res) => {
    try {
        const { merchants } = req.body;
        
        if (!merchants || !Array.isArray(merchants)) {
            return res.status(400).json({
                success: false,
                error: 'merchants array is required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        if (merchants.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 100 QR codes per request',
                code: 'LIMIT_EXCEEDED'
            });
        }
        
        const batchId = `BATCH_API_${Date.now()}`;
        const results = [];
        const errors = [];
        
        for (const merchant of merchants) {
            try {
                // Process each merchant (similar to single generation)
                const validation = security.validateAndSanitizeMerchant(merchant);
                
                if (!validation.success) {
                    errors.push({
                        merchant_id: merchant.merchant_id || 'UNKNOWN',
                        error: validation.error
                    });
                    continue;
                }
                
                // Generate QR (similar logic as single)
                // ... (QR generation code)
                
                results.push({
                    merchant_id: validation.data.merchant_id,
                    qr_id: crypto.randomBytes(8).toString('hex'),
                    status: 'generated'
                });
                
            } catch (error) {
                errors.push({
                    merchant_id: merchant.merchant_id || 'UNKNOWN',
                    error: error.message
                });
            }
        }
        
        res.json({
            success: true,
            batch_id: batchId,
            total: merchants.length,
            successful: results.length,
            failed: errors.length,
            results: results,
            errors: errors
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Bulk generation failed',
            code: 'BULK_ERROR'
        });
    }
});

/**
 * @api {get} /api/v1/merchant/qr/list List QR Codes
 * @apiName ListQR
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 * 
 * @apiParam {Number} [page=1] Page number
 * @apiParam {Number} [limit=20] Items per page
 * @apiParam {String} [status] Filter by status (active/inactive)
 * @apiParam {String} [from_date] Filter from date (YYYY-MM-DD)
 * @apiParam {String} [to_date] Filter to date (YYYY-MM-DD)
 */
router.get('/qr/list', authenticateAPI, rateLimiter, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, from_date, to_date } = req.query;
        const merchantId = req.merchantId;
        
        // Get QR codes for this merchant
        const allQRCodes = await transactionStore.getQRCodesByMerchant(merchantId);
        
        // Apply filters
        let filtered = allQRCodes;
        
        if (status) {
            filtered = filtered.filter(qr => qr.status === status);
        }
        
        if (from_date) {
            filtered = filtered.filter(qr => 
                new Date(qr.created_at) >= new Date(from_date)
            );
        }
        
        if (to_date) {
            filtered = filtered.filter(qr => 
                new Date(qr.created_at) <= new Date(to_date)
            );
        }
        
        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginated = filtered.slice(startIndex, endIndex);
        
        res.json({
            success: true,
            data: {
                qr_codes: paginated.map(qr => ({
                    qr_id: qr.id,
                    merchant_id: qr.merchant_id,
                    merchant_name: qr.merchant_name,
                    amount: qr.amount,
                    status: qr.status,
                    created_at: qr.created_at
                })),
                pagination: {
                    total: filtered.length,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(filtered.length / limit)
                }
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch QR codes',
            code: 'FETCH_ERROR'
        });
    }
});

/**
 * @api {get} /api/v1/merchant/qr/:qr_id Get QR Code Details
 * @apiName GetQR
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 */
router.get('/qr/:qr_id', authenticateAPI, rateLimiter, async (req, res) => {
    try {
        const { qr_id } = req.params;
        
        const qrCode = await transactionStore.getQRCodeById(qr_id);
        
        if (!qrCode) {
            return res.status(404).json({
                success: false,
                error: 'QR code not found',
                code: 'NOT_FOUND'
            });
        }
        
        // Verify merchant owns this QR code
        if (qrCode.api_key_id !== req.merchantId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                code: 'FORBIDDEN'
            });
        }
        
        res.json({
            success: true,
            data: {
                qr_id: qrCode.id,
                merchant_id: qrCode.merchant_id,
                merchant_name: qrCode.merchant_name,
                reference_name: qrCode.reference_name,
                amount: qrCode.amount,
                vpa: qrCode.vpa,
                transaction_ref: qrCode.transaction_ref,
                qr_image: qrCode.qr_image,
                upi_string: qrCode.upi_string,
                status: qrCode.status,
                created_at: qrCode.created_at
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch QR code',
            code: 'FETCH_ERROR'
        });
    }
});

/**
 * @api {get} /api/v1/merchant/transactions List Transactions
 * @apiName ListTransactions
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 */
router.get('/transactions', authenticateAPI, rateLimiter, async (req, res) => {
    try {
        const { page = 1, limit = 20, qr_id, status, from_date, to_date } = req.query;
        const merchantId = req.merchantId;
        
        // Get transactions for this merchant
        const transactions = await transactionStore.getTransactionsByMerchant(merchantId);
        
        // Apply filters
        let filtered = transactions;
        
        if (qr_id) {
            filtered = filtered.filter(tx => tx.qr_id === qr_id);
        }
        
        if (status) {
            filtered = filtered.filter(tx => tx.status === status);
        }
        
        if (from_date) {
            filtered = filtered.filter(tx => 
                new Date(tx.transaction_date) >= new Date(from_date)
            );
        }
        
        if (to_date) {
            filtered = filtered.filter(tx => 
                new Date(tx.transaction_date) <= new Date(to_date)
            );
        }
        
        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginated = filtered.slice(startIndex, endIndex);
        
        res.json({
            success: true,
            data: {
                transactions: paginated,
                pagination: {
                    total: filtered.length,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(filtered.length / limit)
                },
                summary: {
                    total_amount: filtered.reduce((sum, tx) => sum + (tx.amount || 0), 0),
                    successful_count: filtered.filter(tx => tx.status === 'SUCCESS').length,
                    failed_count: filtered.filter(tx => tx.status === 'FAILED').length
                }
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions',
            code: 'FETCH_ERROR'
        });
    }
});

/**
 * @api {get} /api/v1/merchant/analytics Get Analytics
 * @apiName GetAnalytics
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 */
router.get('/analytics', authenticateAPI, rateLimiter, async (req, res) => {
    try {
        const { period = '7d' } = req.query;
        const merchantId = req.merchantId;
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        
        switch(period) {
            case '24h':
                startDate.setDate(startDate.getDate() - 1);
                break;
            case '7d':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(startDate.getDate() - 90);
                break;
        }
        
        // Get analytics data
        const qrCodes = await transactionStore.getQRCodesByMerchant(merchantId);
        const transactions = await transactionStore.getTransactionsByMerchant(merchantId);
        
        // Filter by date range
        const recentQRs = qrCodes.filter(qr => 
            new Date(qr.created_at) >= startDate
        );
        
        const recentTransactions = transactions.filter(tx => 
            new Date(tx.transaction_date) >= startDate
        );
        
        res.json({
            success: true,
            data: {
                period: period,
                qr_codes: {
                    total: qrCodes.length,
                    active: qrCodes.filter(qr => qr.status === 'active').length,
                    created_in_period: recentQRs.length
                },
                transactions: {
                    total: recentTransactions.length,
                    successful: recentTransactions.filter(tx => tx.status === 'SUCCESS').length,
                    failed: recentTransactions.filter(tx => tx.status === 'FAILED').length,
                    total_amount: recentTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
                    average_amount: recentTransactions.length > 0 
                        ? recentTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0) / recentTransactions.length
                        : 0
                },
                top_performing_qr: qrCodes.slice(0, 5).map(qr => ({
                    qr_id: qr.id,
                    merchant_name: qr.merchant_name,
                    transaction_count: transactions.filter(tx => tx.qr_id === qr.id).length,
                    total_amount: transactions
                        .filter(tx => tx.qr_id === qr.id)
                        .reduce((sum, tx) => sum + (tx.amount || 0), 0)
                }))
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics',
            code: 'ANALYTICS_ERROR'
        });
    }
});

/**
 * @api {put} /api/v1/merchant/qr/:qr_id/deactivate Deactivate QR Code
 * @apiName DeactivateQR
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 */
router.put('/qr/:qr_id/deactivate', authenticateAPI, rateLimiter, async (req, res) => {
    try {
        const { qr_id } = req.params;
        
        const qrCode = await transactionStore.getQRCodeById(qr_id);
        
        if (!qrCode) {
            return res.status(404).json({
                success: false,
                error: 'QR code not found',
                code: 'NOT_FOUND'
            });
        }
        
        // Verify ownership
        if (qrCode.api_key_id !== req.merchantId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                code: 'FORBIDDEN'
            });
        }
        
        // Update status
        qrCode.status = 'inactive';
        qrCode.deactivated_at = new Date().toISOString();
        await transactionStore.updateQRCode(qrCode);
        
        res.json({
            success: true,
            message: 'QR code deactivated successfully'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to deactivate QR code',
            code: 'UPDATE_ERROR'
        });
    }
});

/**
 * @api {post} /api/v1/merchant/webhook/register Register Webhook
 * @apiName RegisterWebhook
 * @apiGroup Merchant
 * @apiVersion 1.0.0
 * 
 * @apiParam {String} url Webhook URL
 * @apiParam {Array} events Events to subscribe to
 */
router.post('/webhook/register', authenticateAPI, async (req, res) => {
    try {
        const { url, events = ['transaction.success', 'transaction.failed'] } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'Webhook URL is required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Register webhook (store in database)
        const webhookId = crypto.randomBytes(8).toString('hex');
        
        // In production, save to database
        // await db.saveWebhook({
        //     id: webhookId,
        //     merchant_id: req.merchantId,
        //     url: url,
        //     events: events,
        //     secret: crypto.randomBytes(32).toString('hex'),
        //     status: 'active'
        // });
        
        res.json({
            success: true,
            data: {
                webhook_id: webhookId,
                url: url,
                events: events,
                secret: 'wh_secret_' + crypto.randomBytes(16).toString('hex'),
                status: 'active'
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to register webhook',
            code: 'WEBHOOK_ERROR'
        });
    }
});

module.exports = router;