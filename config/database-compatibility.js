/**
 * Database Compatibility Layer
 * Provides seamless integration between old code and new database schema
 */

const mysql = require('mysql2/promise');
const pg = require('pg');

class DatabaseCompatibility {
    constructor() {
        this.pool = null;
        this.dbType = process.env.DB_TYPE || 'mysql';
        this.isNewSchema = false;
        this.schemaMapping = this.initializeSchemaMapping();
    }

    initializeSchemaMapping() {
        return {
            // Old table names -> New table names
            tables: {
                'transactions': 'qr_transactions',
                'qr_codes': 'qr_codes',
                'webhook_logs': 'qr_notifications',
                'bulk_qr_batches': 'qr_bulk_batches',
                'csv_upload_logs': 'qr_batch_queue'
            },
            
            // Old field names -> New field names
            fields: {
                qr_transactions: {
                    'transaction_id': 'transaction_id',
                    'qr_code_id': 'qr_id',
                    'merchant_transaction_id': 'merchant_txn_id',
                    'bank_rrn': 'bank_reference_no',
                    'amount': 'amount',
                    'status': 'status',
                    'payer_vpa': 'payer_vpa',
                    'payer_name': 'payer_name',
                    'mobile_number': 'payer_mobile',
                    'transaction_date': 'initiated_at',
                    'settlement_amount': 'settlement_amount',
                    'settlement_date': 'settlement_date',
                    'payment_mode': 'payment_method',
                    'status_description': 'status_description'
                },
                qr_codes: {
                    'qr_id': 'qr_id',
                    'qr_identifier': 'qr_id',
                    'merchant_name': 'merchant_name',
                    'merchant_id': 'merchant_id',
                    'reference_name': 'reference_name',
                    'description': 'description',
                    'vpa': 'vpa',
                    'amount': 'amount',
                    'mobile_number': 'merchant_mobile',
                    'email': 'merchant_email',
                    'address': 'location_address',
                    'qr_image_data': 'qr_image_url',
                    'upi_string': 'upi_string',
                    'status': 'status'
                }
            }
        };
    }

    async connect() {
        try {
            // Try real database first
            if (this.dbType === 'mysql') {
                try {
                    this.pool = await mysql.createPool({
                        host: process.env.DB_HOST || 'localhost',
                        port: process.env.DB_PORT || 3306,
                        database: process.env.DB_NAME || 'sabpaisa_qr',
                        user: process.env.DB_USER || 'sabpaisa',
                        password: process.env.DB_PASSWORD || 'sabpaisa123',
                        waitForConnections: true,
                        connectionLimit: 10,
                        queueLimit: 0,
                        enableKeepAlive: true,
                        keepAliveInitialDelay: 0
                    });

                    // Test connection
                    const connection = await this.pool.getConnection();
                    
                    // Check if new schema exists
                    const [tables] = await connection.execute(
                        `SELECT COUNT(*) as count FROM information_schema.tables 
                         WHERE table_schema = DATABASE() 
                         AND table_name IN ('qr_codes', 'qr_transactions')`
                    );
                    
                    this.isNewSchema = tables[0].count >= 2;
                    
                    if (this.isNewSchema) {
                        console.log('✅ Using new QR-optimized database schema');
                        await this.createCompatibilityViews(connection);
                    } else {
                        console.log('⚠️  Using legacy database schema');
                    }
                    
                    connection.release();
                    return this.pool;
                    
                } catch (dbError) {
                    if (dbError.code === 'ER_ACCESS_DENIED_ERROR' || dbError.code === 'ER_BAD_DB_ERROR' || dbError.code === 'ECONNREFUSED') {
                        console.warn('⚠️  MySQL connection failed, using mock database');
                        console.log('📦 Falling back to in-memory mock database');
                        // Fall back to mock database
                        const mockDb = require('./database-mock');
                        await mockDb.connect();
                        this.pool = mockDb;
                        this.isNewSchema = true; // Mock uses new schema
                        return this.pool;
                    }
                    throw dbError;
                }
            }
            
            return this.pool;
        } catch (error) {
            console.error('Database connection failed:', error);
            // Fall back to mock database
            const mockDb = require('./database-mock');
            await mockDb.connect();
            this.pool = mockDb;
            this.isNewSchema = true;
            return this.pool;
        }
    }

    async createCompatibilityViews(connection) {
        try {
            // Drop existing views first
            const dropViews = [
                'DROP VIEW IF EXISTS transactions',
                'DROP VIEW IF EXISTS webhook_logs',
                'DROP VIEW IF EXISTS bulk_qr_batches_old',
                'DROP VIEW IF EXISTS csv_upload_logs_old'
            ];

            for (const drop of dropViews) {
                await connection.execute(drop).catch(() => {});
            }

            // Create compatibility views for old code
            const views = [
                // transactions view - maps new qr_transactions to old structure
                `CREATE OR REPLACE VIEW transactions AS 
                 SELECT 
                    id,
                    transaction_id,
                    qr_id as qr_code_id,
                    merchant_txn_id as merchant_transaction_id,
                    bank_reference_no as bank_rrn,
                    amount,
                    currency,
                    status,
                    payer_vpa,
                    payer_name,
                    payer_mobile as mobile_number,
                    initiated_at as transaction_date,
                    settlement_amount,
                    settlement_date,
                    payment_method as payment_mode,
                    status_description,
                    created_at
                 FROM qr_transactions`,
                
                // webhook_logs view - maps new qr_notifications
                `CREATE OR REPLACE VIEW webhook_logs AS
                 SELECT 
                    id,
                    notification_id as webhook_id,
                    content as payload,
                    CASE 
                        WHEN status = 'SENT' THEN 'success'
                        WHEN status = 'FAILED' THEN 'failed'
                        ELSE status
                    END as status,
                    error_message,
                    created_at
                 FROM qr_notifications
                 WHERE notification_type = 'WEBHOOK'`,
                
                // bulk_qr_batches_old view for compatibility
                `CREATE OR REPLACE VIEW bulk_qr_batches_old AS
                 SELECT 
                    id,
                    batch_id,
                    batch_name,
                    total_count,
                    processed_count as successful_count,
                    failed_count,
                    status,
                    created_by,
                    processing_time_ms,
                    error_details,
                    created_at,
                    completed_at
                 FROM qr_bulk_batches`,
                
                // csv_upload_logs_old view
                `CREATE OR REPLACE VIEW csv_upload_logs_old AS
                 SELECT 
                    id,
                    queue_id as upload_id,
                    JSON_UNQUOTE(JSON_EXTRACT(queue_data, '$.fileName')) as file_name,
                    JSON_UNQUOTE(JSON_EXTRACT(queue_data, '$.fileSize')) as file_size_bytes,
                    JSON_UNQUOTE(JSON_EXTRACT(queue_data, '$.totalRows')) as total_rows,
                    processed_count as processed_rows,
                    failed_count as failed_rows,
                    batch_id,
                    error_message as error_details,
                    status as processing_status,
                    created_by as uploaded_by,
                    created_at,
                    completed_at
                 FROM qr_batch_queue
                 WHERE queue_type = 'CSV_UPLOAD'`
            ];

            for (const view of views) {
                await connection.execute(view).catch((err) => {
                    console.warn(`Could not create view: ${err.message}`);
                });
            }

            console.log('✅ Compatibility views created for legacy code');
        } catch (error) {
            console.error('Error creating compatibility views:', error);
        }
    }

    translateQuery(query, params) {
        if (!this.isNewSchema) {
            return { query, params };
        }

        let translatedQuery = query;
        
        // Replace old table names with new ones
        Object.entries(this.schemaMapping.tables).forEach(([oldTable, newTable]) => {
            const regex = new RegExp(`\\b${oldTable}\\b`, 'gi');
            translatedQuery = translatedQuery.replace(regex, newTable);
        });

        return { query: translatedQuery, params };
    }

    async execute(query, params = []) {
        if (!this.pool) {
            throw new Error('Database not connected');
        }

        const { query: translatedQuery, params: translatedParams } = this.translateQuery(query, params);
        
        try {
            const [results] = await this.pool.execute(translatedQuery, translatedParams);
            return [results];
        } catch (error) {
            // If query fails, try with original query (for compatibility)
            try {
                const [results] = await this.pool.execute(query, params);
                return [results];
            } catch (originalError) {
                throw error; // Throw the translated query error
            }
        }
    }

    async query(query, params = []) {
        return this.execute(query, params);
    }

    async getConnection() {
        if (!this.pool) {
            await this.connect();
        }
        
        // If pool is a mock database, use its getConnection
        if (this.pool && this.pool.getConnection) {
            return this.pool.getConnection();
        }
        
        if (!this.pool) {
            // Return a mock connection that won't break the app
            const mockDb = require('./database-mock');
            return mockDb.getConnection();
        }
        
        // Check if this is already a mock connection
        if (this.pool.execute && !this.pool.getConnection) {
            // This is already a mock, return a wrapped connection
            return {
                execute: async () => [[]],
                query: async () => [[]],
                release: () => {},
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {}
            };
        }
        
        const connection = await this.pool.getConnection();
        
        // Wrap connection methods to handle translation
        const wrappedConnection = {
            ...connection,
            execute: async (query, params = []) => {
                const { query: translatedQuery, params: translatedParams } = 
                    this.translateQuery(query, params);
                return connection.execute(translatedQuery, translatedParams);
            },
            query: async (query, params = []) => {
                const { query: translatedQuery, params: translatedParams } = 
                    this.translateQuery(query, params);
                return connection.query(translatedQuery, translatedParams);
            },
            release: () => connection.release(),
            beginTransaction: () => connection.beginTransaction(),
            commit: () => connection.commit(),
            rollback: () => connection.rollback()
        };
        
        return wrappedConnection;
    }

    async saveTransaction(transactionData) {
        const connection = await this.getConnection();
        
        try {
            if (this.isNewSchema) {
                // Use new schema
                const query = `
                    INSERT INTO qr_transactions (
                        transaction_id, qr_id, merchant_txn_id, bank_reference_no,
                        amount, currency, status, payer_vpa, payer_name, payer_mobile,
                        payment_method, initiated_at, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        bank_reference_no = VALUES(bank_reference_no),
                        updated_at = NOW()
                `;
                
                await connection.execute(query, [
                    transactionData.transactionId || transactionData.transaction_id,
                    transactionData.qrId || transactionData.qr_code_id,
                    transactionData.merchantTxnId || transactionData.merchant_transaction_id,
                    transactionData.bankRRN || transactionData.bank_rrn,
                    transactionData.amount,
                    transactionData.currency || 'INR',
                    transactionData.status,
                    transactionData.payerVPA || transactionData.payer_vpa,
                    transactionData.payerName || transactionData.payer_name,
                    transactionData.mobileNumber || transactionData.mobile_number,
                    transactionData.paymentMode || transactionData.payment_mode || 'UPI',
                    transactionData.transactionDateTime || new Date(),
                    JSON.stringify(transactionData.metadata || {})
                ]);
            } else {
                // Use old schema
                const query = `
                    INSERT INTO transactions (
                        transaction_id, qr_code_id, merchant_transaction_id, bank_rrn,
                        amount, status, payer_vpa, payer_name, mobile_number,
                        transaction_date, payment_mode
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        bank_rrn = VALUES(bank_rrn)
                `;
                
                await connection.execute(query, [
                    transactionData.transactionId || transactionData.transaction_id,
                    transactionData.qrId || transactionData.qr_code_id,
                    transactionData.merchantTxnId || transactionData.merchant_transaction_id,
                    transactionData.bankRRN || transactionData.bank_rrn,
                    transactionData.amount,
                    transactionData.status,
                    transactionData.payerVPA || transactionData.payer_vpa,
                    transactionData.payerName || transactionData.payer_name,
                    transactionData.mobileNumber || transactionData.mobile_number,
                    transactionData.transactionDateTime || new Date(),
                    transactionData.paymentMode || transactionData.payment_mode || 'UPI'
                ]);
            }
            
            return true;
        } catch (error) {
            console.error('Failed to save transaction:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    async logWebhook(webhookId, payload, status, errorMessage = null) {
        const connection = await this.getConnection();
        
        try {
            if (this.isNewSchema) {
                const query = `
                    INSERT INTO qr_notifications (
                        notification_id, notification_type, channel, 
                        recipient, content, status, error_message
                    ) VALUES (?, 'WEBHOOK', 'WEBHOOK', 'system', ?, ?, ?)
                `;
                
                await connection.execute(query, [
                    webhookId,
                    JSON.stringify(payload),
                    status === 'success' ? 'SENT' : 'FAILED',
                    errorMessage
                ]);
            } else {
                const query = `
                    INSERT INTO webhook_logs (
                        webhook_id, payload, status, error_message
                    ) VALUES (?, ?, ?, ?)
                `;
                
                await connection.execute(query, [
                    webhookId,
                    JSON.stringify(payload),
                    status,
                    errorMessage
                ]);
            }
            
            return true;
        } catch (error) {
            console.error('Failed to log webhook:', error);
            return false;
        } finally {
            connection.release();
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('Database connection closed');
        }
    }
}

// Create singleton instance
const dbCompat = new DatabaseCompatibility();

// Export compatibility layer
module.exports = {
    db: dbCompat,
    connect: () => dbCompat.connect(),
    getConnection: () => dbCompat.getConnection(),
    execute: (query, params) => dbCompat.execute(query, params),
    query: (query, params) => dbCompat.query(query, params),
    saveTransaction: (data) => dbCompat.saveTransaction(data),
    logWebhook: (id, payload, status, error) => dbCompat.logWebhook(id, payload, status, error),
    close: () => dbCompat.close()
};