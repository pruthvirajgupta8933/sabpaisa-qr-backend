#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates database, user, and imports schema
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const CONFIG = {
    root: {
        host: 'localhost',
        user: 'root',
        password: process.argv[2] || process.env.MYSQL_ROOT_PASSWORD || ''
    },
    database: {
        name: process.env.DB_NAME || 'sabpaisa_qr',
        user: process.env.DB_USER || 'sabpaisa',
        password: process.env.DB_PASSWORD || 'sabpaisa123',
        host: process.env.DB_HOST || 'localhost'
    }
};

async function initializeDatabase() {
    let rootConnection;
    let userConnection;
    
    try {
        console.log('🚀 Starting database initialization...\n');
        
        // Step 1: Connect as root
        console.log('📋 Step 1: Connecting to MySQL as root...');
        rootConnection = await mysql.createConnection({
            host: CONFIG.root.host,
            user: CONFIG.root.user,
            password: CONFIG.root.password,
            multipleStatements: true
        });
        console.log('✅ Connected as root\n');
        
        // Step 2: Create database
        console.log('📋 Step 2: Creating database...');
        await rootConnection.execute(
            `CREATE DATABASE IF NOT EXISTS ${CONFIG.database.name} 
             CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        console.log(`✅ Database '${CONFIG.database.name}' created or exists\n`);
        
        // Step 3: Create user and grant privileges
        console.log('📋 Step 3: Creating user and granting privileges...');
        
        // Drop user if exists (to reset password)
        await rootConnection.execute(
            `DROP USER IF EXISTS '${CONFIG.database.user}'@'${CONFIG.database.host}'`
        );
        
        // Create user
        await rootConnection.execute(
            `CREATE USER '${CONFIG.database.user}'@'${CONFIG.database.host}' 
             IDENTIFIED BY '${CONFIG.database.password}'`
        );
        
        // Grant privileges
        await rootConnection.execute(
            `GRANT ALL PRIVILEGES ON ${CONFIG.database.name}.* 
             TO '${CONFIG.database.user}'@'${CONFIG.database.host}'`
        );
        
        await rootConnection.execute('FLUSH PRIVILEGES');
        console.log(`✅ User '${CONFIG.database.user}' created with privileges\n`);
        
        // Step 4: Enable event scheduler
        console.log('📋 Step 4: Enabling event scheduler...');
        await rootConnection.execute('SET GLOBAL event_scheduler = ON');
        console.log('✅ Event scheduler enabled\n');
        
        // Close root connection
        await rootConnection.end();
        
        // Step 5: Connect as application user
        console.log('📋 Step 5: Connecting as application user...');
        userConnection = await mysql.createConnection({
            host: CONFIG.database.host,
            user: CONFIG.database.user,
            password: CONFIG.database.password,
            database: CONFIG.database.name,
            multipleStatements: true
        });
        console.log('✅ Connected as application user\n');
        
        // Step 6: Import schema
        console.log('📋 Step 6: Importing database schema...');
        const schemaPath = path.join(__dirname, 'QR_DATABASE_TRANSFORMATION.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');
        
        // Split by delimiter and execute each statement
        const statements = schema
            .split('DELIMITER')
            .filter(s => s.trim())
            .map(s => {
                // Handle statements with custom delimiters
                if (s.includes('$$')) {
                    return s.replace(/\$\$/g, ';').trim();
                }
                return s.trim();
            });
        
        let tableCount = 0;
        let procedureCount = 0;
        let eventCount = 0;
        
        for (const statement of statements) {
            if (statement.includes('CREATE TABLE')) {
                await userConnection.execute(statement);
                tableCount++;
            } else if (statement.includes('CREATE PROCEDURE')) {
                await userConnection.execute(statement);
                procedureCount++;
            } else if (statement.includes('CREATE EVENT')) {
                await userConnection.execute(statement);
                eventCount++;
            } else if (statement.trim()) {
                await userConnection.execute(statement);
            }
        }
        
        console.log(`✅ Schema imported: ${tableCount} tables, ${procedureCount} procedures, ${eventCount} events\n`);
        
        // Step 7: Verify tables
        console.log('📋 Step 7: Verifying tables...');
        const [tables] = await userConnection.execute(
            'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
        );
        
        const expectedTables = [
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
        
        const existingTables = tables.map(t => t.TABLE_NAME || t.table_name);
        const missingTables = expectedTables.filter(t => !existingTables.includes(t));
        
        if (missingTables.length === 0) {
            console.log('✅ All expected tables exist\n');
        } else {
            console.log(`⚠️  Missing tables: ${missingTables.join(', ')}\n`);
        }
        
        // Step 8: Insert test data
        console.log('📋 Step 8: Inserting test data...');
        
        // Insert test merchant QR
        await userConnection.execute(`
            INSERT INTO qr_codes (
                qr_id, qr_type, merchant_id, merchant_name, vpa,
                amount, status, qr_data, created_at
            ) VALUES (
                'QR_TEST_001', 'STATIC', 'MERCH001', 'Test Merchant',
                'test@sabpaisa', NULL, 'ACTIVE',
                'upi://pay?pa=test@sabpaisa&pn=Test%20Merchant&cu=INR',
                NOW()
            ) ON DUPLICATE KEY UPDATE updated_at = NOW()
        `);
        
        // Insert test template
        await userConnection.execute(`
            INSERT INTO qr_templates (
                template_id, template_name, merchant_id, is_active
            ) VALUES (
                'TMPL_001', 'Default Template', 'MERCH001', TRUE
            ) ON DUPLICATE KEY UPDATE updated_at = NOW()
        `);
        
        console.log('✅ Test data inserted\n');
        
        // Step 9: Test stored procedures
        console.log('📋 Step 9: Testing stored procedures...');
        
        await userConnection.execute(
            'CALL sp_generate_dynamic_qr(?, ?, ?, ?, ?, @qr_id)',
            ['MERCH001', 'test@sabpaisa', 100.00, 'Test Payment', 30]
        );
        
        const [[result]] = await userConnection.execute('SELECT @qr_id as qr_id');
        if (result.qr_id) {
            console.log(`✅ Stored procedures working (Generated QR: ${result.qr_id})\n`);
        }
        
        // Close connection
        await userConnection.end();
        
        // Summary
        console.log('========================================');
        console.log('    DATABASE INITIALIZATION COMPLETE    ');
        console.log('========================================');
        console.log(`Database: ${CONFIG.database.name}`);
        console.log(`User: ${CONFIG.database.user}@${CONFIG.database.host}`);
        console.log(`Tables: ${existingTables.length}`);
        console.log('Status: ✅ Ready for use');
        console.log('========================================\n');
        
        // Update .env file
        console.log('📋 Updating .env file...');
        const envPath = path.join(__dirname, '..', '.env');
        const envContent = `# Database Configuration (Auto-generated)
DB_TYPE=mysql
DB_HOST=${CONFIG.database.host}
DB_PORT=3306
DB_USER=${CONFIG.database.user}
DB_PASSWORD=${CONFIG.database.password}
DB_NAME=${CONFIG.database.name}

# Server Configuration
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# Security
JWT_SECRET=${require('crypto').randomBytes(32).toString('hex')}
API_RATE_LIMIT=100

# HDFC API Configuration
HDFC_API_KEY=test_hdfc_api_key
HDFC_API_SECRET=test_hdfc_api_secret
HDFC_WEBHOOK_SECRET=test_webhook_secret

# Webhook Configuration
WEBHOOK_PORT=3001
WEBHOOK_BASE_URL=http://localhost:3001

# Logging
LOG_LEVEL=info
`;
        
        await fs.writeFile(envPath, envContent);
        console.log('✅ .env file updated\n');
        
        console.log('🎉 Setup complete! You can now run: npm start');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Error during initialization:', error.message);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n💡 Solution: Please provide MySQL root password as argument:');
            console.error('   node database/initialize-db.js YOUR_ROOT_PASSWORD');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Solution: Make sure MySQL is running:');
            console.error('   macOS: brew services start mysql');
            console.error('   Linux: sudo systemctl start mysql');
        }
        
        process.exit(1);
    } finally {
        if (rootConnection) await rootConnection.end().catch(() => {});
        if (userConnection) await userConnection.end().catch(() => {});
    }
}

// Run if called directly
if (require.main === module) {
    if (!CONFIG.root.password && !process.argv[2]) {
        console.log('MySQL root password required.');
        console.log('Usage: node database/initialize-db.js YOUR_ROOT_PASSWORD');
        console.log('Or set MYSQL_ROOT_PASSWORD environment variable');
        process.exit(1);
    }
    
    initializeDatabase();
}

module.exports = { initializeDatabase };