/**
 * Mock Database Implementation
 * Provides in-memory database functionality when MySQL is unavailable
 * Ensures the application always works, even without a real database
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class MockDatabase {
    constructor() {
        this.data = {
            qr_codes: new Map(),
            qr_transactions: new Map(),
            transactions: new Map(),
            webhook_logs: new Map(),
            qr_bulk_batches: new Map(),
            qr_notifications: new Map()
        };
        
        // Initialize with test data
        this.initializeTestData();
        
        console.log('📦 Mock database initialized (in-memory storage)');
    }
    
    initializeTestData() {
        // Add test QR codes
        const testQR = {
            id: 1,
            qr_id: 'QR_TEST_001',
            merchant_name: 'Test Merchant',
            merchant_id: 'MERCH001',
            vpa: 'test@sabpaisa',
            amount: null,
            status: 'ACTIVE',
            qr_type: 'DYNAMIC',
            created_at: new Date(),
            updated_at: new Date()
        };
        
        this.data.qr_codes.set(testQR.qr_id, testQR);
        
        // Add test transaction
        const testTxn = {
            id: 1,
            transaction_id: 'TXN_TEST_001',
            qr_id: 'QR_TEST_001',
            amount: 100,
            status: 'SUCCESS',
            payer_vpa: 'customer@upi',
            created_at: new Date()
        };
        
        this.data.qr_transactions.set(testTxn.transaction_id, testTxn);
    }
    
    async connect() {
        // Mock connection always succeeds
        return this;
    }
    
    async getConnection() {
        // Return a mock connection object
        return {
            execute: (query, params) => this.execute(query, params),
            query: (query, params) => this.query(query, params),
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {}
        };
    }
    
    async execute(query, params = []) {
        // Parse query and return mock data
        const queryLower = query.toLowerCase();
        
        // Handle SELECT queries
        if (queryLower.includes('select')) {
            if (queryLower.includes('from qr_codes')) {
                return this.selectFromTable('qr_codes', query, params);
            }
            if (queryLower.includes('from qr_transactions')) {
                return this.selectFromTable('qr_transactions', query, params);
            }
            if (queryLower.includes('from transactions')) {
                return this.selectFromTable('transactions', query, params);
            }
            if (queryLower.includes('from information_schema')) {
                // Return mock schema information
                return [[{ count: 2 }]];
            }
            if (queryLower.includes('count(*)')) {
                // Return mock count
                return [[{ count: this.data.qr_codes.size, total: this.data.qr_codes.size }]];
            }
        }
        
        // Handle INSERT queries
        if (queryLower.includes('insert into')) {
            return this.insertIntoTable(query, params);
        }
        
        // Handle UPDATE queries
        if (queryLower.includes('update')) {
            return this.updateTable(query, params);
        }
        
        // Handle CREATE queries
        if (queryLower.includes('create')) {
            // Mock successful creation
            return [{ affectedRows: 0 }];
        }
        
        // Default response
        return [[]];
    }
    
    async query(query, params = []) {
        return this.execute(query, params);
    }
    
    selectFromTable(tableName, query, params) {
        const table = this.data[tableName];
        if (!table) return [[]];
        
        // Return all records as array
        const records = Array.from(table.values());
        
        // Simple WHERE clause handling
        if (query.toLowerCase().includes('where')) {
            // This is a simplified implementation
            if (params.length > 0 && records.length > 0) {
                const filtered = records.filter(record => {
                    // Check if any field matches the first parameter
                    return Object.values(record).some(value => 
                        value && value.toString() === params[0].toString()
                    );
                });
                return [filtered];
            }
        }
        
        return [records];
    }
    
    insertIntoTable(query, params) {
        const queryLower = query.toLowerCase();
        
        if (queryLower.includes('qr_codes')) {
            const qrCode = {
                id: this.data.qr_codes.size + 1,
                qr_id: params[0] || `QR_${Date.now()}_${uuidv4().substring(0, 8)}`,
                qr_type: params[1] || 'DYNAMIC',
                merchant_id: params[3] || 'MERCH001',
                merchant_name: params[4] || 'Test Merchant',
                vpa: params[5] || 'test@sabpaisa',
                amount: params[6] || null,
                status: 'ACTIVE',
                created_at: new Date(),
                updated_at: new Date()
            };
            this.data.qr_codes.set(qrCode.qr_id, qrCode);
            return [{ insertId: qrCode.id, affectedRows: 1 }];
        }
        
        if (queryLower.includes('qr_transactions') || queryLower.includes('transactions')) {
            const transaction = {
                id: this.data.qr_transactions.size + 1,
                transaction_id: params[0] || `TXN_${Date.now()}_${uuidv4().substring(0, 8)}`,
                qr_id: params[1],
                merchant_txn_id: params[2],
                amount: params[4] || 0,
                status: params[6] || 'PENDING',
                payer_vpa: params[7],
                created_at: new Date()
            };
            this.data.qr_transactions.set(transaction.transaction_id, transaction);
            return [{ insertId: transaction.id, affectedRows: 1 }];
        }
        
        if (queryLower.includes('qr_notifications') || queryLower.includes('webhook_logs')) {
            const log = {
                id: this.data.webhook_logs.size + 1,
                webhook_id: params[0],
                payload: params[1],
                status: params[2],
                created_at: new Date()
            };
            this.data.webhook_logs.set(log.webhook_id, log);
            return [{ insertId: log.id, affectedRows: 1 }];
        }
        
        return [{ insertId: 1, affectedRows: 1 }];
    }
    
    updateTable(query, params) {
        const queryLower = query.toLowerCase();
        
        if (queryLower.includes('qr_codes')) {
            // Find and update QR code
            const qrId = params[params.length - 1];
            const qrCode = this.data.qr_codes.get(qrId);
            if (qrCode) {
                qrCode.updated_at = new Date();
                if (queryLower.includes('status')) {
                    qrCode.status = params[0];
                }
                return [{ affectedRows: 1 }];
            }
        }
        
        if (queryLower.includes('qr_transactions')) {
            // Find and update transaction
            const txnId = params[params.length - 1];
            const txn = this.data.qr_transactions.get(txnId);
            if (txn) {
                if (queryLower.includes('status')) {
                    txn.status = params[0];
                }
                return [{ affectedRows: 1 }];
            }
        }
        
        return [{ affectedRows: 0 }];
    }
    
    async saveTransaction(transactionData) {
        const transaction = {
            id: this.data.qr_transactions.size + 1,
            transaction_id: transactionData.transactionId || `TXN_${Date.now()}`,
            qr_id: transactionData.qrId,
            amount: transactionData.amount,
            status: transactionData.status || 'PENDING',
            payer_vpa: transactionData.payerVPA,
            created_at: new Date()
        };
        
        this.data.qr_transactions.set(transaction.transaction_id, transaction);
        console.log(`✅ Mock: Transaction saved: ${transaction.transaction_id}`);
        return true;
    }
    
    async logWebhook(webhookId, payload, status, errorMessage = null) {
        const log = {
            id: this.data.webhook_logs.size + 1,
            webhook_id: webhookId,
            payload: JSON.stringify(payload),
            status: status,
            error_message: errorMessage,
            created_at: new Date()
        };
        
        this.data.webhook_logs.set(webhookId, log);
        console.log(`✅ Mock: Webhook logged: ${webhookId}`);
        return true;
    }
    
    async generateQRCode(merchantId, vpa, amount, description) {
        const qrId = `QR_${Date.now()}_${uuidv4().substring(0, 8)}`;
        
        // Generate mock QR data
        const upiString = `upi://pay?pa=${vpa}&pn=Test%20Merchant&am=${amount || ''}&cu=INR&tn=${encodeURIComponent(description || '')}&tr=${qrId}`;
        
        // Generate mock QR image (base64)
        const mockQRImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        
        const qrCode = {
            id: this.data.qr_codes.size + 1,
            qr_id: qrId,
            merchant_id: merchantId,
            merchant_name: 'Test Merchant',
            vpa: vpa,
            amount: amount,
            description: description,
            qr_image_url: mockQRImage,
            upi_string: upiString,
            status: 'ACTIVE',
            created_at: new Date()
        };
        
        this.data.qr_codes.set(qrId, qrCode);
        
        return {
            qr_id: qrId,
            qr_code: mockQRImage,
            upi_string: upiString
        };
    }
    
    async getStats() {
        return {
            total_qr_codes: this.data.qr_codes.size,
            active_qr_codes: Array.from(this.data.qr_codes.values()).filter(q => q.status === 'ACTIVE').length,
            total_transactions: this.data.qr_transactions.size,
            successful_transactions: Array.from(this.data.qr_transactions.values()).filter(t => t.status === 'SUCCESS').length,
            total_amount: Array.from(this.data.qr_transactions.values())
                .filter(t => t.status === 'SUCCESS')
                .reduce((sum, t) => sum + (t.amount || 0), 0)
        };
    }
    
    async close() {
        console.log('Mock database connection closed');
    }
}

// Create singleton instance
const mockDb = new MockDatabase();

module.exports = {
    db: mockDb,
    connect: () => mockDb.connect(),
    getConnection: () => mockDb.getConnection(),
    execute: (query, params) => mockDb.execute(query, params),
    query: (query, params) => mockDb.query(query, params),
    saveTransaction: (data) => mockDb.saveTransaction(data),
    logWebhook: (id, payload, status, error) => mockDb.logWebhook(id, payload, status, error),
    generateQRCode: (merchantId, vpa, amount, desc) => mockDb.generateQRCode(merchantId, vpa, amount, desc),
    getStats: () => mockDb.getStats(),
    close: () => mockDb.close()
};