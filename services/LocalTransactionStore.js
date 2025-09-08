const fs = require('fs');
const path = require('path');

/**
 * Local file-based transaction storage for testing
 * Stores transactions in a JSON file instead of database
 */
class LocalTransactionStore {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.transactionsFile = path.join(this.dataDir, 'transactions.json');
        this.qrCodesFile = path.join(this.dataDir, 'qr_codes.json');
        
        // Create data directory if it doesn't exist
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        
        // Initialize files if they don't exist
        this.initializeFiles();
    }

    initializeFiles() {
        if (!fs.existsSync(this.transactionsFile)) {
            fs.writeFileSync(this.transactionsFile, JSON.stringify([], null, 2));
            console.log('✅ Created local transactions file');
        }
        
        if (!fs.existsSync(this.qrCodesFile)) {
            const initialQRCodes = [
                { qrId: 'QR001', merchantName: 'Store Main Counter', vpa: 'sabpaisa.qr001@hdfcbank', status: 'active' },
                { qrId: 'QR002', merchantName: 'Store Billing Desk 2', vpa: 'sabpaisa.qr002@hdfcbank', status: 'active' },
                { qrId: 'QR003', merchantName: 'Online Store', vpa: 'sabpaisa.qr003@hdfcbank', status: 'active' }
            ];
            fs.writeFileSync(this.qrCodesFile, JSON.stringify(initialQRCodes, null, 2));
            console.log('✅ Created local QR codes file with sample data');
        }
    }

    // Save transaction to local file
    async saveTransaction(transactionData) {
        try {
            // Read existing transactions
            const transactions = this.getTransactions();
            
            // Check for duplicate
            const exists = transactions.find(t => t.transactionId === transactionData.transactionId);
            if (exists) {
                console.log(`⚠️ Transaction ${transactionData.transactionId} already exists`);
                return { success: true, duplicate: true };
            }
            
            // Format transaction for storage
            const transaction = {
                id: transactions.length + 1,
                transactionId: transactionData.transactionId || `TXN${Date.now()}`,
                qrId: transactionData.merchantTxnId?.substring(3, 9) || 'QR001',
                merchantName: transactionData.merchantName || 'Merchant',
                merchantTxnId: transactionData.merchantTxnId,
                bankRRN: transactionData.bankRRN,
                amount: parseFloat(transactionData.amount),
                status: transactionData.transactionStatus,
                payerVPA: transactionData.payerVPA,
                payerName: transactionData.payerName,
                mobileNumber: transactionData.mobileNumber,
                transactionDate: transactionData.transactionDateTime,
                settlementAmount: parseFloat(transactionData.settlementAmount),
                settlementDate: transactionData.settlementDateTime,
                paymentMode: transactionData.paymentMode,
                statusDescription: transactionData.statusDescription,
                mcc: transactionData.mcc,
                tipAmount: parseFloat(transactionData.tipAmount) || 0,
                convenienceFee: parseFloat(transactionData.convenienceFee) || 0,
                netAmount: parseFloat(transactionData.netAmount),
                checksum: transactionData.checksum,
                createdAt: new Date().toISOString()
            };
            
            // Add to transactions array
            transactions.push(transaction);
            
            // Save to file
            fs.writeFileSync(this.transactionsFile, JSON.stringify(transactions, null, 2));
            
            console.log(`✅ Transaction saved locally: ${transaction.transactionId}`);
            console.log(`   Amount: ₹${transaction.amount}`);
            console.log(`   Status: ${transaction.status}`);
            console.log(`   Total transactions: ${transactions.length}`);
            
            return {
                success: true,
                transaction,
                totalTransactions: transactions.length
            };
        } catch (error) {
            console.error('❌ Failed to save transaction:', error);
            throw error;
        }
    }

    // Get all transactions
    getTransactions() {
        try {
            const data = fs.readFileSync(this.transactionsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading transactions:', error);
            return [];
        }
    }

    // Get transactions by QR ID
    getTransactionsByQR(qrId) {
        const transactions = this.getTransactions();
        return transactions.filter(t => t.qrId === qrId);
    }

    // Get transaction by ID
    getTransactionById(transactionId) {
        const transactions = this.getTransactions();
        return transactions.find(t => t.transactionId === transactionId);
    }

    // Get transaction stats
    getStats() {
        const transactions = this.getTransactions();
        
        const stats = {
            totalTransactions: transactions.length,
            totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
            successfulTransactions: transactions.filter(t => t.status === 'SUCCESS').length,
            failedTransactions: transactions.filter(t => t.status === 'FAILED').length,
            pendingTransactions: transactions.filter(t => t.status === 'PENDING').length,
            todayTransactions: transactions.filter(t => {
                const txnDate = new Date(t.transactionDate).toDateString();
                const today = new Date().toDateString();
                return txnDate === today;
            }).length
        };
        
        return stats;
    }

    // Get recent transactions
    getRecentTransactions(limit = 10) {
        const transactions = this.getTransactions();
        return transactions
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }

    // Clear all transactions (for testing)
    clearTransactions() {
        fs.writeFileSync(this.transactionsFile, JSON.stringify([], null, 2));
        console.log('✅ All transactions cleared');
    }

    // Get QR codes
    getQRCodes() {
        try {
            const data = fs.readFileSync(this.qrCodesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading QR codes:', error);
            return [];
        }
    }

    // Add QR code
    addQRCode(qrData) {
        const qrCodes = this.getQRCodes();
        qrCodes.push(qrData);
        fs.writeFileSync(this.qrCodesFile, JSON.stringify(qrCodes, null, 2));
        return qrData;
    }

    // Check if transaction exists
    checkDuplicate(transactionId) {
        const transactions = this.getTransactions();
        return transactions.some(t => t.transactionId === transactionId);
    }

    // =================== Bulk QR Methods ===================
    
    // Get QR codes by merchant
    async getQRCodesByMerchant(merchantId) {
        try {
            const qrCodes = this.getQRCodes();
            // Return mock data if no QR codes exist
            if (qrCodes.length === 0) {
                return [
                    {
                        qr_id: 'qr_demo_001',
                        merchant_id: merchantId,
                        merchant_name: 'Demo Merchant',
                        amount: 100.00,
                        vpa: `demo.${merchantId}@hdfc`,
                        status: 'active',
                        created_at: new Date().toISOString()
                    }
                ];
            }
            return qrCodes.filter(q => q.merchant_id === merchantId || q.api_key_id === merchantId);
        } catch (error) {
            console.error('Error getting QR codes by merchant:', error);
            return [];
        }
    }

    // Get transactions by merchant
    async getTransactionsByMerchant(merchantId) {
        try {
            const transactions = this.getTransactions();
            // Return mock data if no transactions exist
            if (transactions.length === 0) {
                return [
                    {
                        transaction_id: 'TXN_DEMO_001',
                        merchant_id: merchantId,
                        amount: 100.00,
                        status: 'success',
                        payer_vpa: 'customer@upi',
                        timestamp: new Date().toISOString()
                    }
                ];
            }
            return transactions.filter(t => t.merchant_id === merchantId);
        } catch (error) {
            console.error('Error getting transactions by merchant:', error);
            return [];
        }
    }
    
    // Save QR code
    async saveQRCode(qrData) {
        try {
            const qrCodes = this.getQRCodes();
            
            // Check for duplicate
            const exists = qrCodes.find(q => q.merchant_id === qrData.merchant_id);
            if (exists) {
                throw new Error(`QR code for merchant ${qrData.merchant_id} already exists`);
            }
            
            qrCodes.push(qrData);
            fs.writeFileSync(this.qrCodesFile, JSON.stringify(qrCodes, null, 2));
            
            return qrData;
        } catch (error) {
            console.error('Error saving QR code:', error);
            throw error;
        }
    }
    
    // Get batch status
    async getBatchStatus(batchId) {
        try {
            const batchFile = path.join(this.dataDir, `batch_${batchId}.json`);
            
            if (!fs.existsSync(batchFile)) {
                return null;
            }
            
            const data = fs.readFileSync(batchFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error getting batch status:', error);
            return null;
        }
    }
    
    // Get batch data
    async getBatchData(batchId) {
        try {
            const batchFile = path.join(this.dataDir, `batch_${batchId}.json`);
            
            if (!fs.existsSync(batchFile)) {
                return null;
            }
            
            const data = fs.readFileSync(batchFile, 'utf8');
            const batchInfo = JSON.parse(data);
            
            return batchInfo.qrCodes || [];
        } catch (error) {
            console.error('Error getting batch data:', error);
            return null;
        }
    }
    
    // Save batch
    async saveBatch(batchId, data) {
        try {
            const batchFile = path.join(this.dataDir, `batch_${batchId}.json`);
            fs.writeFileSync(batchFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving batch:', error);
            return false;
        }
    }
}

// Create singleton instance
const localStore = new LocalTransactionStore();

module.exports = localStore;