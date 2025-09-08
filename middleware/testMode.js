/**
 * Test Mode Middleware
 * Provides mock responses when database is not connected
 */

const mockData = {
    qrCodes: [
        {
            qr_id: 'qr_test_001',
            merchant_id: 'MERCH001',
            merchant_name: 'Test Merchant 1',
            amount: 1000.00,
            vpa: 'test1.merch001@hdfc',
            status: 'active',
            created_at: new Date().toISOString()
        },
        {
            qr_id: 'qr_test_002',
            merchant_id: 'MERCH002',
            merchant_name: 'Test Merchant 2',
            amount: 2000.00,
            vpa: 'test2.merch002@hdfc',
            status: 'active',
            created_at: new Date().toISOString()
        }
    ],
    transactions: [
        {
            transaction_id: 'TXN001',
            qr_id: 'qr_test_001',
            amount: 1000.00,
            status: 'success',
            payer_vpa: 'customer1@upi',
            timestamp: new Date().toISOString()
        },
        {
            transaction_id: 'TXN002',
            qr_id: 'qr_test_002',
            amount: 2000.00,
            status: 'success',
            payer_vpa: 'customer2@upi',
            timestamp: new Date().toISOString()
        }
    ],
    analytics: {
        total_transactions: 25,
        total_amount: 45000.00,
        success_rate: 92.5,
        daily_transactions: 5,
        weekly_transactions: 25,
        top_merchants: [
            { merchant_id: 'MERCH001', transactions: 15, amount: 25000 },
            { merchant_id: 'MERCH002', transactions: 10, amount: 20000 }
        ]
    }
};

const testModeMiddleware = (req, res, next) => {
    // Check if database is connected
    const dbConnected = global.dbConnection && global.dbConnection.state === 'authenticated';
    
    if (!dbConnected && process.env.NODE_ENV !== 'production') {
        // Attach mock data to request for use in controllers
        req.mockData = mockData;
        req.isTestMode = true;
    }
    
    next();
};

module.exports = { testModeMiddleware, mockData };