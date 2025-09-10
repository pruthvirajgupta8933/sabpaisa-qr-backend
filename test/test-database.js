#!/usr/bin/env node

/**
 * Database Test Script
 * Verifies that all database tables and operations work correctly
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'sabpaisa_qr',
    user: process.env.DB_USER || 'sabpaisa',
    password: process.env.DB_PASSWORD || 'sabpaisa123'
};

class DatabaseTester {
    constructor() {
        this.connection = null;
        this.results = {
            passed: [],
            failed: [],
            warnings: []
        };
    }

    async run() {
        console.log('\n' + '='.repeat(50));
        console.log('   DATABASE TESTING SUITE');
        console.log('='.repeat(50) + '\n');

        try {
            // Test 1: Connection
            await this.testConnection();

            // Test 2: Tables exist
            await this.testTablesExist();

            // Test 3: Insert operations
            await this.testInsertOperations();

            // Test 4: Select operations
            await this.testSelectOperations();

            // Test 5: Update operations
            await this.testUpdateOperations();

            // Test 6: Views work
            await this.testViews();

            // Test 7: Indexes exist
            await this.testIndexes();

            // Test 8: Transaction support
            await this.testTransactions();

            // Print results
            this.printResults();

        } catch (error) {
            console.error('❌ Critical error:', error.message);
            this.results.failed.push(`Critical: ${error.message}`);
            this.printResults();
            process.exit(1);
        } finally {
            if (this.connection) {
                await this.connection.end();
            }
        }
    }

    async testConnection() {
        console.log('📋 Testing database connection...');
        
        try {
            this.connection = await mysql.createConnection(TEST_CONFIG);
            await this.connection.execute('SELECT 1');
            
            this.results.passed.push('Database connection successful');
            console.log('   ✅ Connection established\n');
        } catch (error) {
            this.results.failed.push(`Connection failed: ${error.message}`);
            console.log('   ❌ Connection failed:', error.message);
            throw error;
        }
    }

    async testTablesExist() {
        console.log('📋 Testing table existence...');
        
        const requiredTables = [
            'qr_codes',
            'qr_transactions',
            'qr_scan_analytics',
            'qr_performance_metrics',
            'qr_status_history',
            'qr_audit_log',
            'qr_bulk_batches',
            'qr_batch_queue',
            'qr_notifications',
            'qr_templates'
        ];

        const [tables] = await this.connection.execute(
            `SELECT table_name FROM information_schema.tables 
             WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
            [TEST_CONFIG.database]
        );

        const existingTables = tables.map(t => t.TABLE_NAME || t.table_name);
        
        for (const table of requiredTables) {
            if (existingTables.includes(table)) {
                this.results.passed.push(`Table ${table} exists`);
                console.log(`   ✅ ${table}`);
            } else {
                this.results.failed.push(`Table ${table} missing`);
                console.log(`   ❌ ${table} - MISSING`);
            }
        }
        
        console.log();
    }

    async testInsertOperations() {
        console.log('📋 Testing INSERT operations...');
        
        try {
            // Test QR code insert
            const qrId = `QR_TEST_${Date.now()}`;
            await this.connection.execute(
                `INSERT INTO qr_codes (qr_id, merchant_id, merchant_name, vpa, status)
                 VALUES (?, ?, ?, ?, ?)`,
                [qrId, 'TEST001', 'Test Merchant', 'test@sabpaisa', 'ACTIVE']
            );
            
            this.results.passed.push('QR code insert successful');
            console.log('   ✅ QR code insert');

            // Test transaction insert
            const txnId = `TXN_TEST_${Date.now()}`;
            await this.connection.execute(
                `INSERT INTO qr_transactions 
                 (transaction_id, qr_id, merchant_id, amount, status, payer_vpa)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [txnId, qrId, 'TEST001', 100.00, 'SUCCESS', 'payer@upi']
            );
            
            this.results.passed.push('Transaction insert successful');
            console.log('   ✅ Transaction insert');

            // Clean up test data
            await this.connection.execute('DELETE FROM qr_transactions WHERE transaction_id = ?', [txnId]);
            await this.connection.execute('DELETE FROM qr_codes WHERE qr_id = ?', [qrId]);
            
        } catch (error) {
            this.results.failed.push(`Insert operation failed: ${error.message}`);
            console.log('   ❌ Insert failed:', error.message);
        }
        
        console.log();
    }

    async testSelectOperations() {
        console.log('📋 Testing SELECT operations...');
        
        try {
            // Test basic select
            const [qrCodes] = await this.connection.execute(
                'SELECT * FROM qr_codes LIMIT 5'
            );
            
            this.results.passed.push(`Selected ${qrCodes.length} QR codes`);
            console.log(`   ✅ Selected ${qrCodes.length} QR codes`);

            // Test join operation
            const [transactions] = await this.connection.execute(
                `SELECT t.*, q.merchant_name 
                 FROM qr_transactions t
                 JOIN qr_codes q ON t.qr_id = q.qr_id
                 LIMIT 5`
            );
            
            this.results.passed.push('Join operation successful');
            console.log('   ✅ Join operation works');

            // Test aggregation
            const [stats] = await this.connection.execute(
                `SELECT 
                    COUNT(*) as total_qr,
                    SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_qr
                 FROM qr_codes`
            );
            
            this.results.passed.push(`Aggregation: ${stats[0].total_qr} total QR codes`);
            console.log(`   ✅ Aggregation: ${stats[0].total_qr} total, ${stats[0].active_qr} active`);
            
        } catch (error) {
            this.results.failed.push(`Select operation failed: ${error.message}`);
            console.log('   ❌ Select failed:', error.message);
        }
        
        console.log();
    }

    async testUpdateOperations() {
        console.log('📋 Testing UPDATE operations...');
        
        try {
            // Create test record
            const qrId = `QR_UPDATE_TEST_${Date.now()}`;
            await this.connection.execute(
                `INSERT INTO qr_codes (qr_id, merchant_id, merchant_name, vpa, status)
                 VALUES (?, 'TEST001', 'Test', 'test@upi', 'ACTIVE')`,
                [qrId]
            );

            // Test update
            await this.connection.execute(
                `UPDATE qr_codes SET status = 'INACTIVE' WHERE qr_id = ?`,
                [qrId]
            );

            // Verify update
            const [result] = await this.connection.execute(
                'SELECT status FROM qr_codes WHERE qr_id = ?',
                [qrId]
            );

            if (result[0].status === 'INACTIVE') {
                this.results.passed.push('Update operation successful');
                console.log('   ✅ Update operation');
            } else {
                this.results.failed.push('Update verification failed');
                console.log('   ❌ Update verification failed');
            }

            // Clean up
            await this.connection.execute('DELETE FROM qr_codes WHERE qr_id = ?', [qrId]);
            
        } catch (error) {
            this.results.failed.push(`Update operation failed: ${error.message}`);
            console.log('   ❌ Update failed:', error.message);
        }
        
        console.log();
    }

    async testViews() {
        console.log('📋 Testing database views...');
        
        try {
            // Test transactions view
            const [transactions] = await this.connection.execute(
                'SELECT * FROM transactions LIMIT 1'
            );
            
            this.results.passed.push('Transactions view works');
            console.log('   ✅ transactions view');

            // Test webhook_logs view
            const [webhooks] = await this.connection.execute(
                'SELECT * FROM webhook_logs LIMIT 1'
            );
            
            this.results.passed.push('Webhook logs view works');
            console.log('   ✅ webhook_logs view');
            
        } catch (error) {
            this.results.warnings.push(`View test warning: ${error.message}`);
            console.log('   ⚠️  View test:', error.message);
        }
        
        console.log();
    }

    async testIndexes() {
        console.log('📋 Testing indexes...');
        
        try {
            const [indexes] = await this.connection.execute(
                `SELECT DISTINCT INDEX_NAME 
                 FROM information_schema.STATISTICS 
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'qr_codes'
                 AND INDEX_NAME != 'PRIMARY'`,
                [TEST_CONFIG.database]
            );

            if (indexes.length > 0) {
                this.results.passed.push(`Found ${indexes.length} indexes on qr_codes`);
                console.log(`   ✅ ${indexes.length} indexes found`);
            } else {
                this.results.warnings.push('No indexes found');
                console.log('   ⚠️  No indexes found');
            }
            
        } catch (error) {
            this.results.warnings.push(`Index test warning: ${error.message}`);
            console.log('   ⚠️  Index test:', error.message);
        }
        
        console.log();
    }

    async testTransactions() {
        console.log('📋 Testing transaction support...');
        
        try {
            await this.connection.beginTransaction();
            
            const qrId = `QR_TXN_TEST_${Date.now()}`;
            
            // Insert in transaction
            await this.connection.execute(
                `INSERT INTO qr_codes (qr_id, merchant_id, merchant_name, vpa, status)
                 VALUES (?, 'TEST001', 'Test', 'test@upi', 'ACTIVE')`,
                [qrId]
            );
            
            // Rollback
            await this.connection.rollback();
            
            // Check if rolled back
            const [result] = await this.connection.execute(
                'SELECT * FROM qr_codes WHERE qr_id = ?',
                [qrId]
            );
            
            if (result.length === 0) {
                this.results.passed.push('Transaction rollback successful');
                console.log('   ✅ Transaction support works');
            } else {
                this.results.failed.push('Transaction rollback failed');
                console.log('   ❌ Transaction rollback failed');
            }
            
        } catch (error) {
            this.results.failed.push(`Transaction test failed: ${error.message}`);
            console.log('   ❌ Transaction test:', error.message);
        }
        
        console.log();
    }

    printResults() {
        console.log('\n' + '='.repeat(50));
        console.log('   TEST RESULTS');
        console.log('='.repeat(50));
        
        console.log(`\n✅ Passed: ${this.results.passed.length}`);
        this.results.passed.forEach(test => {
            console.log(`   • ${test}`);
        });
        
        if (this.results.failed.length > 0) {
            console.log(`\n❌ Failed: ${this.results.failed.length}`);
            this.results.failed.forEach(test => {
                console.log(`   • ${test}`);
            });
        }
        
        if (this.results.warnings.length > 0) {
            console.log(`\n⚠️  Warnings: ${this.results.warnings.length}`);
            this.results.warnings.forEach(test => {
                console.log(`   • ${test}`);
            });
        }
        
        const totalTests = this.results.passed.length + this.results.failed.length;
        const successRate = totalTests > 0 ? 
            ((this.results.passed.length / totalTests) * 100).toFixed(1) : 0;
        
        console.log('\n' + '='.repeat(50));
        console.log(`   SUCCESS RATE: ${successRate}%`);
        console.log('='.repeat(50));
        
        if (this.results.failed.length === 0) {
            console.log('\n🎉 All database tests passed! Ready for deployment.');
        } else {
            console.log('\n⚠️  Some tests failed. Please check the database setup.');
        }
        
        process.exit(this.results.failed.length === 0 ? 0 : 1);
    }
}

// Run tests
if (require.main === module) {
    const tester = new DatabaseTester();
    tester.run().catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
}

module.exports = DatabaseTester;