/**
 * HDFC Webhook Handler
 * Processes real-time payment notifications from HDFC UPI
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

// Import services
const QRTransactionService = require('../services/QRTransactionService');
const LocalTransactionStore = require('../services/LocalTransactionStore');

// HDFC Error codes mapping
const HDFC_ERROR_CODES = {
    '00': 'Success',
    'U01': 'The request is duplicate',
    'U02': 'Not sufficient funds',
    'U03': 'Debit has failed',
    'U04': 'Credit has failed',
    'U05': 'Transaction not permitted',
    'U06': 'Invalid VPA',
    'U07': 'Transaction timeout',
    'U08': 'Invalid Amount',
    'U09': 'Remitter bank not available',
    'U10': 'Beneficiary bank not available',
    'U11': 'Invalid transaction',
    'U12': 'Invalid reference number',
    'U13': 'Approval declined',
    'U14': 'Transaction already completed',
    'U15': 'Request timeout',
    'U16': 'Risk threshold exceeded',
    'U17': 'PSP not available',
    'U18': 'Invalid merchant',
    'U19': 'Merchant blocked',
    'U20': 'Invalid response'
};

// Encryption/Decryption utilities
class EncryptionUtil {
    static decryptAES128(encryptedText, key) {
        try {
            const keyUtf8 = CryptoJS.enc.Utf8.parse(key);
            const decrypted = CryptoJS.AES.decrypt(encryptedText, keyUtf8, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            });
            return decrypted.toString(CryptoJS.enc.Utf8);
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt webhook data');
        }
    }

    static generateChecksum(data, key) {
        const dataString = Object.values(data).join('|');
        return crypto.createHmac('sha256', key)
            .update(dataString)
            .digest('hex')
            .toUpperCase();
    }

    static validateChecksum(data, receivedChecksum, key) {
        const calculatedChecksum = this.generateChecksum(data, key);
        return calculatedChecksum === receivedChecksum;
    }

    static parseHDFCResponse(decryptedData) {
        // HDFC sends 21 pipe-separated fields
        const fields = decryptedData.split('|');
        
        if (fields.length !== 21) {
            throw new Error(`Invalid HDFC response format. Expected 21 fields, got ${fields.length}`);
        }

        return {
            merchantId: fields[0],
            merchantName: fields[1],
            terminalId: fields[2],
            transactionId: fields[3],
            bankRRN: fields[4],
            merchantTxnId: fields[5],
            amount: parseFloat(fields[6]),
            transactionStatus: fields[7], // SUCCESS/FAILURE
            statusCode: fields[8],
            statusDescription: fields[9],
            payerVPA: fields[10],
            payerName: fields[11],
            mobileNumber: fields[12],
            transactionDateTime: fields[13],
            settlementAmount: parseFloat(fields[14]),
            settlementDateTime: fields[15],
            paymentMode: fields[16],
            mcc: fields[17],
            tipAmount: parseFloat(fields[18]) || 0,
            convenienceFee: parseFloat(fields[19]) || 0,
            checksum: fields[20]
        };
    }
}

// Transaction validation
class TransactionValidator {
    static async checkDuplicate(transactionId, merchantId) {
        try {
            // Check if transaction already exists
            const existing = await QRTransactionService.getTransactionDetails(transactionId, merchantId);
            return existing.success;
        } catch (error) {
            return false;
        }
    }

    static validateAmount(amount) {
        const limits = {
            min: 1,
            max: 100000
        };

        if (amount < limits.min || amount > limits.max) {
            throw new Error(`Amount ₹${amount} is outside allowed limits (₹${limits.min} - ₹${limits.max})`);
        }

        return true;
    }

    static validateTimestamp(timestamp) {
        // Check if transaction is not older than 24 hours
        const transactionTime = new Date(timestamp);
        const currentTime = new Date();
        const timeDiff = currentTime - transactionTime;
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        // Skip timestamp validation in development
        if (process.env.NODE_ENV !== 'development' && hoursDiff > 24) {
            throw new Error('Transaction is older than 24 hours');
        }

        return true;
    }
}

// Main webhook endpoint
router.post('/hdfc/webhook', async (req, res) => {
    const startTime = Date.now();
    let transactionData = null;

    try {
        console.log('[HDFC Webhook] Received callback at:', new Date().toISOString());

        // Extract encrypted data from request
        const { encryptedData, merchantId } = req.body;

        if (!encryptedData) {
            return res.status(400).json({
                status: 'FAILED',
                message: 'Missing encrypted data',
                timestamp: new Date().toISOString()
            });
        }

        // Get merchant key from environment or database
        const merchantKey = process.env.HDFC_MERCHANT_KEY;
        if (!merchantKey) {
            throw new Error('Merchant key not configured');
        }

        // Decrypt the payload
        const decryptedData = EncryptionUtil.decryptAES128(encryptedData, merchantKey);
        console.log('[HDFC Webhook] Data decrypted successfully');

        // Parse HDFC response
        transactionData = EncryptionUtil.parseHDFCResponse(decryptedData);
        console.log('[HDFC Webhook] Transaction ID:', transactionData.transactionId);
        console.log('[HDFC Webhook] Status:', transactionData.transactionStatus);
        console.log('[HDFC Webhook] Amount:', transactionData.amount);

        // Validate checksum (skip in development for testing)
        if (process.env.NODE_ENV !== 'development') {
            const checksumData = { ...transactionData };
            delete checksumData.checksum;
            
            if (!EncryptionUtil.validateChecksum(checksumData, transactionData.checksum, merchantKey)) {
                throw new Error('Invalid checksum - possible data tampering');
            }
            console.log('[HDFC Webhook] Checksum validated successfully');
        } else {
            console.log('[HDFC Webhook] Checksum validation skipped in development mode');
        }

        // Check for duplicate transaction
        const isDuplicate = await TransactionValidator.checkDuplicate(
            transactionData.transactionId,
            transactionData.merchantId
        );

        if (isDuplicate) {
            console.log('[HDFC Webhook] Duplicate transaction detected');
            return res.status(200).json({
                status: 'SUCCESS',
                message: 'Transaction already processed',
                transactionId: transactionData.transactionId,
                isDuplicate: true
            });
        }

        // Validate transaction amount
        TransactionValidator.validateAmount(transactionData.amount);

        // Validate timestamp
        TransactionValidator.validateTimestamp(transactionData.transactionDateTime);

        // Process the transaction based on status
        let processingResult;
        if (transactionData.transactionStatus === 'SUCCESS') {
            processingResult = await processSuccessfulTransaction(transactionData);
        } else {
            processingResult = await processFailedTransaction(transactionData);
        }

        // Log processing time
        const processingTime = Date.now() - startTime;
        console.log(`[HDFC Webhook] Processing completed in ${processingTime}ms`);

        // Send acknowledgment to HDFC
        res.status(200).json({
            status: 'SUCCESS',
            message: 'Webhook processed successfully',
            transactionId: transactionData.transactionId,
            processingTime: processingTime,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[HDFC Webhook] Error:', error);

        // Log error for debugging
        const errorLog = {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            transactionId: transactionData?.transactionId,
            processingTime: Date.now() - startTime
        };
        console.error('[HDFC Webhook] Error details:', errorLog);

        // Send error response
        res.status(500).json({
            status: 'ERROR',
            message: error.message || 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

// Process successful transaction
async function processSuccessfulTransaction(transactionData) {
    try {
        // Map HDFC data to our format
        const webhookData = {
            transaction_id: transactionData.transactionId,
            merchant_id: transactionData.merchantId,
            qr_identifier: extractQRIdentifier(transactionData.merchantTxnId),
            amount: transactionData.amount,
            customer_vpa: transactionData.payerVPA,
            customer_name: transactionData.payerName,
            reference_number: transactionData.merchantTxnId,
            bank_reference_number: transactionData.bankRRN,
            status: 'success',
            payment_method: 'UPI'
        };

        // Process through service layer (use local store in development)
        let result;
        if (process.env.NODE_ENV === 'development') {
            // Use local file storage in development
            result = await LocalTransactionStore.saveTransaction(transactionData);
            console.log('[HDFC Webhook] Transaction saved to local storage');
        } else {
            result = await QRTransactionService.processTransactionWebhook(webhookData);
        }

        // Emit real-time event for frontend
        emitRealtimeUpdate('payment-success', transactionData);

        return result;
    } catch (error) {
        console.error('[HDFC Webhook] Error processing successful transaction:', error);
        throw error;
    }
}

// Process failed transaction
async function processFailedTransaction(transactionData) {
    try {
        // Get error description
        const errorDescription = HDFC_ERROR_CODES[transactionData.statusCode] || 
                               transactionData.statusDescription || 
                               'Transaction failed';

        // Map HDFC data to our format
        const webhookData = {
            transaction_id: transactionData.transactionId,
            merchant_id: transactionData.merchantId,
            qr_identifier: extractQRIdentifier(transactionData.merchantTxnId),
            amount: transactionData.amount,
            customer_vpa: transactionData.payerVPA,
            customer_name: transactionData.payerName,
            reference_number: transactionData.merchantTxnId,
            bank_reference_number: transactionData.bankRRN,
            status: 'failed',
            payment_method: 'UPI',
            failure_reason: errorDescription
        };

        // Process through service layer (use local store in development)
        let result;
        if (process.env.NODE_ENV === 'development') {
            // Use local file storage in development
            result = await LocalTransactionStore.saveTransaction(transactionData);
            console.log('[HDFC Webhook] Transaction saved to local storage');
        } else {
            result = await QRTransactionService.processTransactionWebhook(webhookData);
        }

        // Emit real-time event for frontend
        emitRealtimeUpdate('payment-failed', {
            ...transactionData,
            errorDescription
        });

        return result;
    } catch (error) {
        console.error('[HDFC Webhook] Error processing failed transaction:', error);
        throw error;
    }
}

// Extract QR identifier from transaction reference
function extractQRIdentifier(merchantTxnId) {
    // Format: STQ{identifier}{timestamp} or DYN{identifier}{timestamp}
    if (merchantTxnId.startsWith('STQ')) {
        return merchantTxnId.substring(3, merchantTxnId.length - 13);
    } else if (merchantTxnId.startsWith('DYN')) {
        return merchantTxnId.substring(3, merchantTxnId.length - 13);
    }
    return merchantTxnId;
}

// Emit real-time update (to be integrated with Socket.io)
function emitRealtimeUpdate(event, data) {
    // This will be replaced with Socket.io emit
    console.log(`[Realtime] Emitting ${event}:`, {
        transactionId: data.transactionId,
        amount: data.amount,
        status: data.transactionStatus
    });

    // For now, we'll use a global event emitter or message queue
    if (global.io) {
        global.io.emit(event, data);
    }
}

// Get transactions endpoint (for development)
router.get('/hdfc/transactions', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'development') {
            const transactions = LocalTransactionStore.getTransactions();
            const stats = LocalTransactionStore.getStats();
            
            res.json({
                success: true,
                transactions,
                stats,
                count: transactions.length
            });
        } else {
            res.status(403).json({
                success: false,
                message: 'This endpoint is only available in development mode'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Health check endpoint
router.get('/hdfc/webhook/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        service: 'HDFC Webhook Handler',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Test endpoint (only in development)
if (process.env.NODE_ENV === 'development') {
    router.post('/hdfc/webhook/test', async (req, res) => {
        try {
            // Generate test transaction data
            const testData = {
                merchantId: 'HDFC000010380443',
                merchantName: 'Test Merchant',
                terminalId: 'TERM001',
                transactionId: `TEST${Date.now()}`,
                bankRRN: `RRN${Date.now()}`,
                merchantTxnId: `STQ001${Date.now()}`,
                amount: 100.00,
                transactionStatus: 'SUCCESS',
                statusCode: '00',
                statusDescription: 'Success',
                payerVPA: 'test@paytm',
                payerName: 'Test User',
                mobileNumber: '9999999999',
                transactionDateTime: new Date().toISOString(),
                settlementAmount: 100.00,
                settlementDateTime: new Date().toISOString(),
                paymentMode: 'UPI',
                mcc: '5499',
                tipAmount: 0,
                convenienceFee: 0,
                checksum: 'TEST_CHECKSUM'
            };

            // Convert to pipe-separated format
            const pipeData = Object.values(testData).join('|');
            
            // Encrypt the data
            const merchantKey = process.env.HDFC_MERCHANT_KEY || 'test_key_16bytes';
            const keyUtf8 = CryptoJS.enc.Utf8.parse(merchantKey);
            const encrypted = CryptoJS.AES.encrypt(pipeData, keyUtf8, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            });

            // Send to webhook endpoint
            const axios = require('axios');
            const response = await axios.post('http://localhost:3000/api/hdfc/webhook', {
                encryptedData: encrypted.toString(),
                merchantId: testData.merchantId
            });

            res.json({
                status: 'SUCCESS',
                message: 'Test webhook sent',
                testData,
                response: response.data
            });
        } catch (error) {
            res.status(500).json({
                status: 'ERROR',
                message: error.message
            });
        }
    });
}

module.exports = router;