/**
 * Database Adapter for New QR Schema
 * Provides compatibility layer between old code and new database structure
 */

const mysql = require('mysql2/promise');

class DatabaseAdapter {
    constructor(connection) {
        this.connection = connection;
    }

    /**
     * Map old transaction save to new schema
     */
    async saveTransaction(transactionData) {
        try {
            const query = `
                INSERT INTO qr_transactions (
                    transaction_id, qr_id, merchant_txn_id, bank_reference_no,
                    amount, status, payer_vpa, payer_name, payer_mobile,
                    initiated_at, settlement_amount, settlement_date,
                    payment_method, status_description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    status_description = VALUES(status_description),
                    updated_at = NOW()
            `;
            
            const values = [
                transactionData.transactionId || transactionData.transaction_id,
                transactionData.qrId || transactionData.qr_id,
                transactionData.merchantTxnId || transactionData.merchant_txn_id,
                transactionData.bankRRN || transactionData.bank_rrn,
                transactionData.amount,
                transactionData.status || 'INITIATED',
                transactionData.payerVPA || transactionData.payer_vpa,
                transactionData.payerName || transactionData.payer_name,
                transactionData.mobileNumber || transactionData.mobile_number,
                transactionData.transactionDateTime || new Date(),
                transactionData.settlementAmount || transactionData.settlement_amount,
                transactionData.settlementDateTime || transactionData.settlement_date,
                transactionData.paymentMode || 'UPI',
                transactionData.statusDescription || transactionData.status_description
            ];

            await this.connection.execute(query, values);
            
            console.log(`✅ Transaction saved: ${transactionData.transactionId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save transaction:', error);
            throw error;
        }
    }

    /**
     * Create QR Code with new schema
     */
    async createQRCode(qrData) {
        try {
            const qrId = qrData.qr_id || `QR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const query = `
                INSERT INTO qr_codes (
                    qr_id, qr_type, merchant_id, merchant_name, vpa,
                    amount, reference_name, description, mobile_number,
                    email, status, qr_data, upi_string, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const upiString = this.generateUPIString(qrData);
            
            const values = [
                qrId,
                qrData.qr_type || 'DYNAMIC',
                qrData.merchant_id,
                qrData.merchant_name,
                qrData.vpa,
                qrData.amount || null,
                qrData.reference_name || qrData.merchant_name,
                qrData.description,
                qrData.mobile_number,
                qrData.email,
                'ACTIVE',
                upiString,
                upiString,
                JSON.stringify(qrData.metadata || {})
            ];

            await this.connection.execute(query, values);
            
            return {
                qrId,
                qrData: upiString,
                status: 'success'
            };
        } catch (error) {
            console.error('❌ Failed to create QR code:', error);
            throw error;
        }
    }

    /**
     * Generate UPI String
     */
    generateUPIString(data) {
        const params = [];
        params.push(`pa=${data.vpa}`);
        params.push(`pn=${encodeURIComponent(data.merchant_name || 'Merchant')}`);
        
        if (data.amount) {
            params.push(`am=${data.amount}`);
        }
        
        params.push('cu=INR');
        
        if (data.description) {
            params.push(`tn=${encodeURIComponent(data.description)}`);
        }
        
        if (data.transaction_ref) {
            params.push(`tr=${data.transaction_ref}`);
        }
        
        return `upi://pay?${params.join('&')}`;
    }

    /**
     * Get QR Code details
     */
    async getQRCode(qrId) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM qr_codes WHERE qr_id = ?',
                [qrId]
            );
            
            if (rows.length === 0) {
                return null;
            }
            
            // Map to old format for compatibility
            const qr = rows[0];
            return {
                qr_id: qr.qr_id,
                merchant_id: qr.merchant_id,
                merchant_name: qr.merchant_name,
                vpa: qr.vpa,
                amount: qr.amount,
                status: qr.status,
                qr_data: qr.qr_data,
                upi_string: qr.upi_string,
                created_at: qr.created_at,
                usage_count: qr.usage_count
            };
        } catch (error) {
            console.error('❌ Failed to get QR code:', error);
            throw error;
        }
    }

    /**
     * Update QR Code status
     */
    async updateQRStatus(qrId, status) {
        try {
            await this.connection.execute(
                'UPDATE qr_codes SET status = ?, updated_at = NOW() WHERE qr_id = ?',
                [status, qrId]
            );
            
            // Log status change
            await this.connection.execute(
                'INSERT INTO qr_status_history (qr_id, new_status, changed_at) VALUES (?, ?, NOW())',
                [qrId, status]
            );
            
            return true;
        } catch (error) {
            console.error('❌ Failed to update QR status:', error);
            return false;
        }
    }

    /**
     * Log QR scan
     */
    async logQRScan(scanData) {
        try {
            const scanId = `SCAN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            await this.connection.execute(
                `INSERT INTO qr_scan_analytics 
                 (qr_id, scan_id, scan_result, ip_address, device_type, transaction_initiated) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    scanData.qr_id,
                    scanId,
                    scanData.result || 'SUCCESS',
                    scanData.ip_address,
                    scanData.device_type || 'MOBILE',
                    scanData.transaction_initiated || false
                ]
            );
            
            // Update QR usage
            await this.connection.execute(
                'UPDATE qr_codes SET usage_count = usage_count + 1, last_used_at = NOW() WHERE qr_id = ?',
                [scanData.qr_id]
            );
            
            return scanId;
        } catch (error) {
            console.error('❌ Failed to log QR scan:', error);
            return null;
        }
    }

    /**
     * Get transaction by ID
     */
    async getTransaction(transactionId) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM qr_transactions WHERE transaction_id = ?',
                [transactionId]
            );
            
            return rows[0] || null;
        } catch (error) {
            console.error('❌ Failed to get transaction:', error);
            return null;
        }
    }

    /**
     * Update transaction status
     */
    async updateTransactionStatus(transactionId, status, description) {
        try {
            await this.connection.execute(
                `UPDATE qr_transactions 
                 SET status = ?, status_description = ?, updated_at = NOW() 
                 WHERE transaction_id = ?`,
                [status, description, transactionId]
            );
            
            return true;
        } catch (error) {
            console.error('❌ Failed to update transaction:', error);
            return false;
        }
    }

    /**
     * Create bulk QR batch
     */
    async createBulkBatch(batchData) {
        try {
            const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            await this.connection.execute(
                `INSERT INTO qr_bulk_batches 
                 (batch_id, batch_name, merchant_id, total_count, status, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    batchId,
                    batchData.batch_name,
                    batchData.merchant_id,
                    batchData.total_count || 0,
                    'QUEUED',
                    batchData.created_by
                ]
            );
            
            return batchId;
        } catch (error) {
            console.error('❌ Failed to create bulk batch:', error);
            throw error;
        }
    }

    /**
     * Check if tables exist (for migration check)
     */
    async checkNewSchemaExists() {
        try {
            const tables = [
                'qr_codes',
                'qr_transactions',
                'qr_scan_analytics',
                'qr_performance_metrics',
                'qr_status_history',
                'qr_audit_log',
                'qr_bulk_batches',
                'qr_notifications'
            ];
            
            const results = {};
            
            for (const table of tables) {
                const [rows] = await this.connection.execute(
                    'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
                    [table]
                );
                results[table] = rows[0].count > 0;
            }
            
            const allExist = Object.values(results).every(exists => exists);
            
            if (!allExist) {
                console.log('⚠️  Missing tables:', Object.keys(results).filter(t => !results[t]));
            }
            
            return allExist;
        } catch (error) {
            console.error('❌ Failed to check schema:', error);
            return false;
        }
    }

    /**
     * Get database statistics
     */
    async getStats() {
        try {
            const stats = {};
            
            // QR codes count
            const [qrCount] = await this.connection.execute(
                'SELECT COUNT(*) as count, SUM(usage_count) as total_usage FROM qr_codes WHERE status = "ACTIVE"'
            );
            stats.activeQRCodes = qrCount[0].count;
            stats.totalQRUsage = qrCount[0].total_usage || 0;
            
            // Transactions count
            const [txnCount] = await this.connection.execute(
                'SELECT COUNT(*) as count, SUM(amount) as total_amount FROM qr_transactions WHERE status = "SUCCESS" AND DATE(created_at) = CURDATE()'
            );
            stats.todayTransactions = txnCount[0].count;
            stats.todayAmount = txnCount[0].total_amount || 0;
            
            // Scan analytics
            const [scanCount] = await this.connection.execute(
                'SELECT COUNT(*) as count FROM qr_scan_analytics WHERE DATE(scan_timestamp) = CURDATE()'
            );
            stats.todayScans = scanCount[0].count;
            
            return stats;
        } catch (error) {
            console.error('❌ Failed to get stats:', error);
            return {
                activeQRCodes: 0,
                totalQRUsage: 0,
                todayTransactions: 0,
                todayAmount: 0,
                todayScans: 0
            };
        }
    }
}

module.exports = DatabaseAdapter;