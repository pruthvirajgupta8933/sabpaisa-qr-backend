const mysql = require('mysql2/promise');
const pg = require('pg');

class DatabaseConnection {
    constructor() {
        this.connection = null;
        this.dbType = process.env.DB_TYPE || 'mysql'; // 'mysql' or 'postgresql'
    }

    async connect() {
        try {
            if (this.dbType === 'postgresql') {
                // PostgreSQL connection
                const pool = new pg.Pool({
                    host: process.env.DB_HOST || 'localhost',
                    port: process.env.DB_PORT || 5432,
                    database: process.env.DB_NAME || 'sabpaisa_qr',
                    user: process.env.DB_USER || 'postgres',
                    password: process.env.DB_PASSWORD || '',
                    max: 20,
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 2000,
                });

                // Test connection
                const client = await pool.connect();
                console.log('✅ PostgreSQL database connected successfully');
                client.release();
                
                this.connection = pool;
            } else {
                // MySQL connection
                const pool = await mysql.createPool({
                    host: process.env.DB_HOST || 'localhost',
                    port: process.env.DB_PORT || 3306,
                    database: process.env.DB_NAME || 'sabpaisa_qr',
                    user: process.env.DB_USER || 'root',
                    password: process.env.DB_PASSWORD || '',
                    waitForConnections: true,
                    connectionLimit: 10,
                    queueLimit: 0,
                    enableKeepAlive: true,
                    keepAliveInitialDelay: 0
                });

                // Test connection
                const connection = await pool.getConnection();
                console.log('✅ MySQL database connected successfully');
                connection.release();
                
                this.connection = pool;
            }

            // Create tables if they don't exist
            await this.initializeTables();
            
            return this.connection;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    async initializeTables() {
        try {
            if (this.dbType === 'postgresql') {
                await this.initializePostgreSQLTables();
            } else {
                await this.initializeMySQLTables();
            }
            console.log('✅ Database tables initialized');
        } catch (error) {
            console.error('❌ Failed to initialize tables:', error);
            throw error;
        }
    }

    async initializeMySQLTables() {
        const queries = [
            // Bulk QR Batches table (new)
            `CREATE TABLE IF NOT EXISTS bulk_qr_batches (
                id INT AUTO_INCREMENT PRIMARY KEY,
                batch_id VARCHAR(50) UNIQUE NOT NULL,
                batch_name VARCHAR(255),
                total_count INT DEFAULT 0,
                successful_count INT DEFAULT 0,
                failed_count INT DEFAULT 0,
                status VARCHAR(50) DEFAULT 'pending',
                created_by VARCHAR(100),
                processing_time_ms INT,
                error_details JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                INDEX idx_batch_id (batch_id),
                INDEX idx_batch_status (status)
            )`,
            
            // Enhanced QR Codes table with bulk QR support
            `CREATE TABLE IF NOT EXISTS qr_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                qr_id VARCHAR(50) UNIQUE NOT NULL,
                merchant_name VARCHAR(255),
                merchant_id VARCHAR(100),
                reference_name VARCHAR(255),
                description TEXT,
                vpa VARCHAR(255),
                amount DECIMAL(10, 2),
                mobile_number VARCHAR(20),
                email VARCHAR(255),
                address TEXT,
                transaction_ref VARCHAR(100),
                qr_image_data MEDIUMTEXT,
                upi_string TEXT,
                vpa_handle VARCHAR(50) DEFAULT 'hdfc',
                batch_id VARCHAR(50),
                metadata JSON,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_qr_id (qr_id),
                INDEX idx_status (status),
                INDEX idx_batch_id (batch_id),
                INDEX idx_merchant_id (merchant_id)
            )`,
            
            // Transactions table
            `CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                transaction_id VARCHAR(100) UNIQUE NOT NULL,
                qr_id VARCHAR(50),
                merchant_txn_id VARCHAR(100),
                bank_rrn VARCHAR(50),
                amount DECIMAL(10, 2),
                status VARCHAR(50),
                payer_vpa VARCHAR(255),
                payer_name VARCHAR(255),
                mobile_number VARCHAR(20),
                transaction_date DATETIME,
                settlement_amount DECIMAL(10, 2),
                settlement_date DATETIME,
                payment_mode VARCHAR(50),
                status_description TEXT,
                checksum VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_transaction_id (transaction_id),
                INDEX idx_qr_id (qr_id),
                INDEX idx_status (status),
                INDEX idx_transaction_date (transaction_date)
            )`,
            
            // Webhook logs table
            `CREATE TABLE IF NOT EXISTS webhook_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                webhook_id VARCHAR(100),
                payload TEXT,
                status VARCHAR(50),
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_webhook_id (webhook_id),
                INDEX idx_created_at (created_at)
            )`,
            
            // QR Validations table (new)
            `CREATE TABLE IF NOT EXISTS qr_validations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                qr_id VARCHAR(50),
                validation_type VARCHAR(50),
                original_value TEXT,
                sanitized_value TEXT,
                is_valid BOOLEAN DEFAULT TRUE,
                validation_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_qr_id (qr_id),
                INDEX idx_validation_type (validation_type)
            )`,
            
            // CSV Upload Logs table (new)
            `CREATE TABLE IF NOT EXISTS csv_upload_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                upload_id VARCHAR(50) UNIQUE NOT NULL,
                file_name VARCHAR(255),
                file_size_bytes BIGINT,
                total_rows INT,
                processed_rows INT DEFAULT 0,
                failed_rows INT DEFAULT 0,
                batch_id VARCHAR(50),
                error_details JSON,
                processing_status VARCHAR(50) DEFAULT 'uploading',
                uploaded_by VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                INDEX idx_upload_id (upload_id),
                INDEX idx_batch_id (batch_id)
            )`
        ];

        for (const query of queries) {
            await this.connection.execute(query);
        }
    }

    async initializePostgreSQLTables() {
        const queries = [
            // QR Codes table
            `CREATE TABLE IF NOT EXISTS qr_codes (
                id SERIAL PRIMARY KEY,
                qr_id VARCHAR(50) UNIQUE NOT NULL,
                merchant_name VARCHAR(255),
                merchant_id VARCHAR(100),
                vpa VARCHAR(255),
                amount DECIMAL(10, 2),
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            `CREATE INDEX IF NOT EXISTS idx_qr_id ON qr_codes(qr_id)`,
            `CREATE INDEX IF NOT EXISTS idx_qr_status ON qr_codes(status)`,
            
            // Transactions table
            `CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                transaction_id VARCHAR(100) UNIQUE NOT NULL,
                qr_id VARCHAR(50),
                merchant_txn_id VARCHAR(100),
                bank_rrn VARCHAR(50),
                amount DECIMAL(10, 2),
                status VARCHAR(50),
                payer_vpa VARCHAR(255),
                payer_name VARCHAR(255),
                mobile_number VARCHAR(20),
                transaction_date TIMESTAMP,
                settlement_amount DECIMAL(10, 2),
                settlement_date TIMESTAMP,
                payment_mode VARCHAR(50),
                status_description TEXT,
                checksum VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            `CREATE INDEX IF NOT EXISTS idx_trans_id ON transactions(transaction_id)`,
            `CREATE INDEX IF NOT EXISTS idx_trans_qr_id ON transactions(qr_id)`,
            `CREATE INDEX IF NOT EXISTS idx_trans_status ON transactions(status)`,
            `CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(transaction_date)`,
            
            // Webhook logs table
            `CREATE TABLE IF NOT EXISTS webhook_logs (
                id SERIAL PRIMARY KEY,
                webhook_id VARCHAR(100),
                payload TEXT,
                status VARCHAR(50),
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            `CREATE INDEX IF NOT EXISTS idx_webhook_id ON webhook_logs(webhook_id)`,
            `CREATE INDEX IF NOT EXISTS idx_webhook_created ON webhook_logs(created_at)`
        ];

        for (const query of queries) {
            await this.connection.query(query);
        }
    }

    async saveTransaction(transactionData) {
        try {
            const query = `
                INSERT INTO transactions (
                    transaction_id, qr_id, merchant_txn_id, bank_rrn,
                    amount, status, payer_vpa, payer_name, mobile_number,
                    transaction_date, settlement_amount, settlement_date,
                    payment_mode, status_description, checksum
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    status_description = VALUES(status_description)
            `;
            
            const values = [
                transactionData.transactionId,
                transactionData.qrId,
                transactionData.merchantTxnId,
                transactionData.bankRRN,
                transactionData.amount,
                transactionData.status,
                transactionData.payerVPA,
                transactionData.payerName,
                transactionData.mobileNumber,
                transactionData.transactionDateTime,
                transactionData.settlementAmount,
                transactionData.settlementDateTime,
                transactionData.paymentMode,
                transactionData.statusDescription,
                transactionData.checksum
            ];

            if (this.dbType === 'postgresql') {
                // PostgreSQL UPSERT syntax
                const pgQuery = query.replace(
                    'ON DUPLICATE KEY UPDATE',
                    'ON CONFLICT (transaction_id) DO UPDATE SET'
                ).replace(/VALUES\((\w+)\)/g, 'EXCLUDED.$1');
                
                await this.connection.query(pgQuery, values);
            } else {
                await this.connection.execute(query, values);
            }
            
            console.log(`✅ Transaction saved: ${transactionData.transactionId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save transaction:', error);
            throw error;
        }
    }

    async logWebhook(webhookId, payload, status, errorMessage = null) {
        try {
            const query = `
                INSERT INTO webhook_logs (webhook_id, payload, status, error_message)
                VALUES (?, ?, ?, ?)
            `;
            
            const values = [
                webhookId,
                JSON.stringify(payload),
                status,
                errorMessage
            ];

            if (this.dbType === 'postgresql') {
                await this.connection.query(query, values);
            } else {
                await this.connection.execute(query, values);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to log webhook:', error);
            return false;
        }
    }

    async getConnection() {
        if (!this.connection) {
            await this.connect();
        }
        return this.connection;
    }

    async close() {
        if (this.connection) {
            if (this.dbType === 'postgresql') {
                await this.connection.end();
            } else {
                await this.connection.end();
            }
            console.log('Database connection closed');
        }
    }
}

// Create singleton instance
const db = new DatabaseConnection();

// Export database instance and helper functions
module.exports = {
    db,
    connect: () => db.connect(),
    getConnection: () => db.getConnection(),
    saveTransaction: (data) => db.saveTransaction(data),
    logWebhook: (id, payload, status, error) => db.logWebhook(id, payload, status, error),
    close: () => db.close()
};