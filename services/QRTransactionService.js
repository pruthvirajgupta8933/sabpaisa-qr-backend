/**
 * QR Transaction Service Layer
 * Handles all business logic for QR transactions
 */

const db = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

class QRTransactionService {
    /**
     * Get paginated transaction list with filters
     */
    async getTransactions(merchantId, filters = {}, pagination = {}) {
        try {
            const {
                from_date = moment().subtract(30, 'days').format('YYYY-MM-DD'),
                to_date = moment().format('YYYY-MM-DD'),
                qr_code,
                status,
                payment_method,
                min_amount,
                max_amount,
                customer_vpa,
                reference_number,
                settlement_status
            } = filters;

            const {
                page = 1,
                limit = 50,
                sort_by = 'initiated_at',
                sort_order = 'DESC'
            } = pagination;

            const offset = (page - 1) * limit;

            // Build dynamic query
            let whereConditions = ['t.merchant_id = ?'];
            let queryParams = [merchantId];

            // Add date range
            whereConditions.push('DATE(t.initiated_at) BETWEEN ? AND ?');
            queryParams.push(from_date, to_date);

            // Add optional filters
            if (qr_code && qr_code !== 'all') {
                whereConditions.push('q.qr_identifier = ?');
                queryParams.push(qr_code);
            }

            if (status && status !== 'all') {
                whereConditions.push('t.status = ?');
                queryParams.push(status);
            }

            if (payment_method && payment_method !== 'all') {
                whereConditions.push('t.payment_method = ?');
                queryParams.push(payment_method);
            }

            if (min_amount) {
                whereConditions.push('t.amount >= ?');
                queryParams.push(min_amount);
            }

            if (max_amount) {
                whereConditions.push('t.amount <= ?');
                queryParams.push(max_amount);
            }

            if (customer_vpa) {
                whereConditions.push('t.customer_vpa LIKE ?');
                queryParams.push(`%${customer_vpa}%`);
            }

            if (reference_number) {
                whereConditions.push('(t.reference_number = ? OR t.bank_reference_number = ?)');
                queryParams.push(reference_number, reference_number);
            }

            if (settlement_status && settlement_status !== 'all') {
                whereConditions.push('t.settlement_status = ?');
                queryParams.push(settlement_status);
            }

            const whereClause = whereConditions.join(' AND ');

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM qr_transactions t
                LEFT JOIN qr_codes q ON t.qr_code_id = q.id
                WHERE ${whereClause}
            `;

            const [countResult] = await db.query(countQuery, queryParams);
            const total = countResult[0].total;

            // Get transactions
            const dataQuery = `
                SELECT 
                    t.transaction_id,
                    t.amount,
                    t.currency,
                    t.status,
                    t.payment_method,
                    t.customer_vpa,
                    t.customer_name,
                    t.reference_number,
                    t.bank_reference_number,
                    t.initiated_at,
                    t.completed_at,
                    t.settlement_status,
                    t.settlement_date,
                    t.refund_amount,
                    q.qr_identifier,
                    q.reference_name as qr_name,
                    q.store_location
                FROM qr_transactions t
                LEFT JOIN qr_codes q ON t.qr_code_id = q.id
                WHERE ${whereClause}
                ORDER BY ${sort_by} ${sort_order}
                LIMIT ? OFFSET ?
            `;

            queryParams.push(parseInt(limit), parseInt(offset));
            const [transactions] = await db.query(dataQuery, queryParams);

            // Get summary statistics
            const summaryQuery = `
                SELECT 
                    SUM(t.amount) as total_amount,
                    SUM(CASE WHEN t.status = 'success' THEN t.amount ELSE 0 END) as successful_amount,
                    COUNT(*) as total_transactions,
                    SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) as successful_transactions,
                    SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as failed_transactions,
                    SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as pending_transactions,
                    SUM(CASE WHEN t.status IN ('refunded', 'partial_refunded') THEN 1 ELSE 0 END) as refunded_transactions
                FROM qr_transactions t
                LEFT JOIN qr_codes q ON t.qr_code_id = q.id
                WHERE ${whereClause}
            `;

            const [summary] = await db.query(summaryQuery, queryParams.slice(0, -2));

            return {
                success: true,
                data: {
                    transactions,
                    pagination: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total_pages: Math.ceil(total / limit),
                        has_next: page < Math.ceil(total / limit),
                        has_prev: page > 1
                    },
                    summary: summary[0]
                }
            };
        } catch (error) {
            logger.error('Error fetching transactions:', error);
            throw error;
        }
    }

    /**
     * Get detailed transaction by ID
     */
    async getTransactionDetails(transactionId, merchantId) {
        try {
            const query = `
                SELECT 
                    t.*,
                    q.qr_identifier,
                    q.reference_name as qr_name,
                    q.store_location,
                    q.vpa as qr_vpa,
                    s.batch_id as settlement_batch_id,
                    s.settlement_date as actual_settlement_date,
                    s.utr_number as settlement_utr
                FROM qr_transactions t
                LEFT JOIN qr_codes q ON t.qr_code_id = q.id
                LEFT JOIN qr_settlement_transactions st ON t.id = st.transaction_id
                LEFT JOIN qr_settlement_batches s ON st.settlement_batch_id = s.id
                WHERE t.transaction_id = ? AND t.merchant_id = ?
            `;

            const [result] = await db.query(query, [transactionId, merchantId]);

            if (result.length === 0) {
                return {
                    success: false,
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Transaction not found'
                    }
                };
            }

            // Get audit trail
            const auditQuery = `
                SELECT * FROM qr_transaction_audit 
                WHERE transaction_id = ? 
                ORDER BY created_at DESC
            `;
            const [auditTrail] = await db.query(auditQuery, [transactionId]);

            // Get refund details if applicable
            let refundDetails = null;
            if (result[0].status === 'refunded' || result[0].status === 'partial_refunded') {
                const refundQuery = `
                    SELECT * FROM qr_refund_audit 
                    WHERE transaction_id = ? 
                    ORDER BY initiated_at DESC
                `;
                const [refunds] = await db.query(refundQuery, [transactionId]);
                refundDetails = refunds;
            }

            return {
                success: true,
                data: {
                    transaction: result[0],
                    audit_trail: auditTrail,
                    refund_details: refundDetails
                }
            };
        } catch (error) {
            logger.error('Error fetching transaction details:', error);
            throw error;
        }
    }

    /**
     * Process transaction webhook from payment gateway
     */
    async processTransactionWebhook(webhookData) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const {
                transaction_id,
                merchant_id,
                qr_identifier,
                amount,
                customer_vpa,
                customer_name,
                reference_number,
                bank_reference_number,
                status,
                payment_method = 'UPI'
            } = webhookData;

            // Get QR code details
            const [qrCode] = await connection.query(
                'SELECT id, daily_limit, monthly_limit FROM qr_codes WHERE qr_identifier = ?',
                [qr_identifier]
            );

            if (qrCode.length === 0) {
                throw new Error('Invalid QR code');
            }

            // Check if transaction already exists
            const [existing] = await connection.query(
                'SELECT id FROM qr_transactions WHERE transaction_id = ?',
                [transaction_id]
            );

            let transactionRecord;
            if (existing.length > 0) {
                // Update existing transaction
                await connection.query(
                    `UPDATE qr_transactions 
                     SET status = ?, 
                         bank_reference_number = ?,
                         completed_at = CURRENT_TIMESTAMP,
                         settlement_status = CASE WHEN ? = 'success' THEN 'pending' ELSE settlement_status END
                     WHERE transaction_id = ?`,
                    [status, bank_reference_number, status, transaction_id]
                );
                transactionRecord = existing[0];
            } else {
                // Insert new transaction
                const [insertResult] = await connection.query(
                    `INSERT INTO qr_transactions (
                        transaction_id, qr_code_id, merchant_id, amount,
                        customer_vpa, customer_name, reference_number,
                        bank_reference_number, status, payment_method,
                        settlement_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        transaction_id,
                        qrCode[0].id,
                        merchant_id,
                        amount,
                        customer_vpa,
                        customer_name,
                        reference_number,
                        bank_reference_number,
                        status,
                        payment_method,
                        status === 'success' ? 'pending' : null
                    ]
                );
                transactionRecord = { id: insertResult.insertId };
            }

            // Update daily stats if successful
            if (status === 'success') {
                await this.updateDailyStats(connection, merchant_id, qrCode[0].id, amount);
            }

            // Log webhook event
            await connection.query(
                `INSERT INTO qr_webhook_events (
                    event_id, event_type, transaction_id, payload, status
                ) VALUES (?, ?, ?, ?, ?)`,
                [
                    uuidv4(),
                    'transaction.' + status,
                    transaction_id,
                    JSON.stringify(webhookData),
                    'processed'
                ]
            );

            await connection.commit();

            return {
                success: true,
                data: {
                    transaction_id,
                    status: 'processed'
                }
            };
        } catch (error) {
            await connection.rollback();
            logger.error('Error processing webhook:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Initiate refund for a transaction
     */
    async initiateRefund(transactionId, refundData, initiatedBy) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Get transaction details
            const [transaction] = await connection.query(
                'SELECT * FROM qr_transactions WHERE transaction_id = ? AND status = ?',
                [transactionId, 'success']
            );

            if (transaction.length === 0) {
                throw new Error('Transaction not found or not eligible for refund');
            }

            const txn = transaction[0];
            const refundAmount = refundData.refund_type === 'full' 
                ? txn.amount 
                : refundData.refund_amount;

            // Validate refund amount
            if (refundAmount > txn.amount) {
                throw new Error('Refund amount cannot exceed transaction amount');
            }

            const refundId = 'REF' + moment().format('YYYYMMDD') + Math.random().toString(36).substr(2, 9).toUpperCase();

            // Insert refund record
            await connection.query(
                `INSERT INTO qr_refund_audit (
                    transaction_id, refund_id, original_amount, refund_amount,
                    refund_type, initiated_by, refund_reason, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    transactionId,
                    refundId,
                    txn.amount,
                    refundAmount,
                    refundData.refund_type,
                    initiatedBy,
                    refundData.reason,
                    'initiated'
                ]
            );

            // Update transaction status
            const newStatus = refundData.refund_type === 'full' ? 'refunded' : 'partial_refunded';
            await connection.query(
                `UPDATE qr_transactions 
                 SET status = ?, 
                     refund_amount = ?,
                     refund_reason = ?,
                     refund_initiated_by = ?,
                     refund_initiated_at = CURRENT_TIMESTAMP
                 WHERE transaction_id = ?`,
                [newStatus, refundAmount, refundData.reason, initiatedBy, transactionId]
            );

            // Here you would call the actual payment gateway refund API
            // const gatewayResponse = await paymentGateway.initiateRefund({...});

            await connection.commit();

            return {
                success: true,
                data: {
                    refund_id: refundId,
                    transaction_id: transactionId,
                    refund_amount: refundAmount,
                    refund_status: 'initiated',
                    estimated_completion: moment().add(7, 'days').toISOString()
                }
            };
        } catch (error) {
            await connection.rollback();
            logger.error('Error initiating refund:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Update daily statistics
     */
    async updateDailyStats(connection, merchantId, qrCodeId, amount) {
        const today = moment().format('YYYY-MM-DD');
        
        await connection.query(
            `INSERT INTO qr_daily_stats (
                merchant_id, qr_code_id, stat_date, 
                total_transactions, successful_transactions, 
                total_amount, successful_amount
            ) VALUES (?, ?, ?, 1, 1, ?, ?)
            ON DUPLICATE KEY UPDATE
                total_transactions = total_transactions + 1,
                successful_transactions = successful_transactions + 1,
                total_amount = total_amount + VALUES(total_amount),
                successful_amount = successful_amount + VALUES(successful_amount),
                updated_at = CURRENT_TIMESTAMP`,
            [merchantId, qrCodeId, today, amount, amount]
        );
    }

    /**
     * Get transaction summary for reporting
     */
    async getTransactionSummary(merchantId, dateRange) {
        try {
            const { from_date, to_date } = dateRange;

            // Get overall summary
            const summaryQuery = `
                SELECT 
                    COUNT(*) as total_transactions,
                    SUM(amount) as total_amount,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_transactions,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_transactions,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_transactions,
                    SUM(CASE WHEN status IN ('refunded', 'partial_refunded') THEN 1 ELSE 0 END) as refunded_transactions,
                    AVG(CASE WHEN status = 'success' THEN amount END) as average_transaction_value,
                    (SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as conversion_rate
                FROM qr_transactions
                WHERE merchant_id = ? 
                AND DATE(initiated_at) BETWEEN ? AND ?
            `;

            const [summary] = await db.query(summaryQuery, [merchantId, from_date, to_date]);

            // Get daily trend
            const dailyTrendQuery = `
                SELECT 
                    DATE(initiated_at) as date,
                    COUNT(*) as transactions,
                    SUM(amount) as amount
                FROM qr_transactions
                WHERE merchant_id = ?
                AND DATE(initiated_at) BETWEEN ? AND ?
                AND status = 'success'
                GROUP BY DATE(initiated_at)
                ORDER BY date ASC
            `;

            const [dailyTrend] = await db.query(dailyTrendQuery, [merchantId, from_date, to_date]);

            // Get hourly distribution
            const hourlyQuery = `
                SELECT 
                    HOUR(initiated_at) as hour,
                    COUNT(*) as count
                FROM qr_transactions
                WHERE merchant_id = ?
                AND DATE(initiated_at) BETWEEN ? AND ?
                GROUP BY HOUR(initiated_at)
                ORDER BY hour
            `;

            const [hourlyDistribution] = await db.query(hourlyQuery, [merchantId, from_date, to_date]);

            // Get top performing QR codes
            const topQRQuery = `
                SELECT 
                    q.qr_identifier,
                    q.reference_name,
                    COUNT(t.id) as transaction_count,
                    SUM(t.amount) as total_amount
                FROM qr_transactions t
                JOIN qr_codes q ON t.qr_code_id = q.id
                WHERE t.merchant_id = ?
                AND DATE(t.initiated_at) BETWEEN ? AND ?
                AND t.status = 'success'
                GROUP BY q.id
                ORDER BY total_amount DESC
                LIMIT 10
            `;

            const [topQRCodes] = await db.query(topQRQuery, [merchantId, from_date, to_date]);

            return {
                success: true,
                data: {
                    summary: summary[0],
                    daily_trend: dailyTrend,
                    hourly_distribution: hourlyDistribution,
                    top_qr_codes: topQRCodes
                }
            };
        } catch (error) {
            logger.error('Error getting transaction summary:', error);
            throw error;
        }
    }
}

module.exports = new QRTransactionService();