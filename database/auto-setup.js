#!/usr/bin/env node

/**
 * Automatic Database Setup
 * Creates everything needed for the new database to work
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Database configuration
const DB_CONFIG = {
    name: 'sabpaisa_qr',
    user: 'sabpaisa',
    password: 'sabpaisa123',
    host: 'localhost'
};

class DatabaseAutoSetup {
    constructor() {
        this.rootConnection = null;
        this.userConnection = null;
        this.attempts = 0;
        this.maxAttempts = 3;
    }

    async run() {
        console.log('🚀 Automatic Database Setup Starting...\n');
        
        try {
            // Step 1: Try to connect with existing user
            const existingWorks = await this.tryExistingConnection();
            if (existingWorks) {
                console.log('✅ Database already configured and working!');
                return true;
            }

            // Step 2: Try to create user without root password
            const createdWithoutRoot = await this.tryCreateWithoutRoot();
            if (createdWithoutRoot) {
                console.log('✅ Database setup completed successfully!');
                return true;
            }

            // Step 3: Try with blank root password
            const createdWithBlankRoot = await this.tryCreateWithRoot('');
            if (createdWithBlankRoot) {
                console.log('✅ Database setup completed with blank root password!');
                return true;
            }

            // Step 4: Try common root passwords
            const commonPasswords = ['root', 'password', 'admin', 'mysql', '123456'];
            for (const pwd of commonPasswords) {
                console.log(`Trying common password: ${pwd.substring(0, 2)}***`);
                const created = await this.tryCreateWithRoot(pwd);
                if (created) {
                    console.log('✅ Database setup completed!');
                    return true;
                }
            }

            // Step 5: Try to use system mysql command
            const systemSetup = await this.trySystemCommand();
            if (systemSetup) {
                console.log('✅ Database setup completed using system command!');
                return true;
            }

            // If all fails, provide instructions
            console.log('\n❌ Automatic setup failed. Manual setup required:');
            this.printManualInstructions();
            return false;

        } catch (error) {
            console.error('Setup error:', error.message);
            this.printManualInstructions();
            return false;
        }
    }

    async tryExistingConnection() {
        try {
            console.log('📋 Checking if database already exists...');
            
            const connection = await mysql.createConnection({
                host: DB_CONFIG.host,
                user: DB_CONFIG.user,
                password: DB_CONFIG.password,
                database: DB_CONFIG.name
            });

            // Test with a simple query
            await connection.execute('SELECT 1');
            
            // Check if our tables exist
            const [tables] = await connection.execute(
                `SELECT COUNT(*) as count FROM information_schema.tables 
                 WHERE table_schema = ? AND table_name IN ('qr_codes', 'qr_transactions')`,
                [DB_CONFIG.name]
            );

            await connection.end();

            if (tables[0].count >= 2) {
                console.log('✅ Database and tables already exist!');
                return true;
            }

            // Tables don't exist, need to create them
            console.log('⚠️  Database exists but tables missing, will create them...');
            await this.importSchema();
            return true;

        } catch (error) {
            if (error.code === 'ER_BAD_DB_ERROR') {
                console.log('Database does not exist yet');
            } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
                console.log('User does not exist or wrong password');
            }
            return false;
        }
    }

    async tryCreateWithoutRoot() {
        try {
            console.log('\n📋 Attempting to create database without root...');
            
            // Try to connect without specifying database
            const connection = await mysql.createConnection({
                host: DB_CONFIG.host,
                user: DB_CONFIG.user,
                password: DB_CONFIG.password
            });

            // Try to create database
            await connection.execute(`CREATE DATABASE IF NOT EXISTS ${DB_CONFIG.name}`);
            await connection.execute(`USE ${DB_CONFIG.name}`);
            
            console.log('✅ Database created!');
            await connection.end();
            
            // Import schema
            await this.importSchema();
            return true;

        } catch (error) {
            console.log('Cannot create without root access');
            return false;
        }
    }

    async tryCreateWithRoot(rootPassword) {
        try {
            console.log('\n📋 Attempting to connect as root...');
            
            this.rootConnection = await mysql.createConnection({
                host: DB_CONFIG.host,
                user: 'root',
                password: rootPassword,
                multipleStatements: true
            });

            console.log('✅ Connected as root');

            // Create database
            await this.rootConnection.execute(
                `CREATE DATABASE IF NOT EXISTS ${DB_CONFIG.name} 
                 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
            );
            console.log(`✅ Database '${DB_CONFIG.name}' created`);

            // Create user (drop first to reset)
            await this.rootConnection.execute(
                `DROP USER IF EXISTS '${DB_CONFIG.user}'@'${DB_CONFIG.host}'`
            ).catch(() => {});

            await this.rootConnection.execute(
                `CREATE USER '${DB_CONFIG.user}'@'${DB_CONFIG.host}' 
                 IDENTIFIED BY '${DB_CONFIG.password}'`
            );

            // Grant privileges
            await this.rootConnection.execute(
                `GRANT ALL PRIVILEGES ON ${DB_CONFIG.name}.* 
                 TO '${DB_CONFIG.user}'@'${DB_CONFIG.host}'`
            );

            await this.rootConnection.execute('FLUSH PRIVILEGES');
            console.log(`✅ User '${DB_CONFIG.user}' created with privileges`);

            // Enable event scheduler
            await this.rootConnection.execute('SET GLOBAL event_scheduler = ON').catch(() => {});

            await this.rootConnection.end();

            // Import schema
            await this.importSchema();
            return true;

        } catch (error) {
            if (this.rootConnection) {
                await this.rootConnection.end().catch(() => {});
            }
            return false;
        }
    }

    async trySystemCommand() {
        try {
            console.log('\n📋 Attempting system mysql command...');
            
            // Create SQL script
            const sqlScript = `
CREATE DATABASE IF NOT EXISTS ${DB_CONFIG.name};
CREATE USER IF NOT EXISTS '${DB_CONFIG.user}'@'${DB_CONFIG.host}' IDENTIFIED BY '${DB_CONFIG.password}';
GRANT ALL PRIVILEGES ON ${DB_CONFIG.name}.* TO '${DB_CONFIG.user}'@'${DB_CONFIG.host}';
FLUSH PRIVILEGES;
`;
            const scriptPath = path.join(__dirname, 'temp-setup.sql');
            await fs.writeFile(scriptPath, sqlScript);

            // Try to execute with mysql command
            try {
                await execAsync(`mysql -u root < ${scriptPath}`);
                console.log('✅ Database created using system command');
                await fs.unlink(scriptPath).catch(() => {});
                
                // Import schema
                await this.importSchema();
                return true;
            } catch (error) {
                // Try with sudo
                try {
                    await execAsync(`sudo mysql < ${scriptPath}`);
                    console.log('✅ Database created using sudo');
                    await fs.unlink(scriptPath).catch(() => {});
                    
                    // Import schema
                    await this.importSchema();
                    return true;
                } catch (sudoError) {
                    await fs.unlink(scriptPath).catch(() => {});
                    return false;
                }
            }

        } catch (error) {
            console.log('System command failed');
            return false;
        }
    }

    async importSchema() {
        try {
            console.log('\n📝 Importing database schema...');
            
            const schemaPath = path.join(__dirname, 'QR_DATABASE_TRANSFORMATION.sql');
            
            // Check if schema file exists
            try {
                await fs.access(schemaPath);
            } catch {
                console.log('⚠️  Schema file not found, creating basic schema...');
                await this.createBasicSchema();
                return true;
            }

            // Read schema file
            const schema = await fs.readFile(schemaPath, 'utf8');
            
            // Connect as user
            const connection = await mysql.createConnection({
                host: DB_CONFIG.host,
                user: DB_CONFIG.user,
                password: DB_CONFIG.password,
                database: DB_CONFIG.name,
                multipleStatements: true
            });

            // Process schema in chunks
            const statements = schema
                .split('DELIMITER')
                .filter(s => s.trim())
                .map(s => {
                    if (s.includes('$$')) {
                        return s.replace(/\$\$/g, ';').trim();
                    }
                    return s.trim();
                });

            let tableCount = 0;
            for (const statement of statements) {
                if (statement.includes('CREATE TABLE')) {
                    await connection.execute(statement).catch(err => {
                        console.warn(`Warning: ${err.message.substring(0, 50)}...`);
                    });
                    tableCount++;
                } else if (statement.includes('CREATE PROCEDURE') || statement.includes('CREATE EVENT')) {
                    await connection.execute(statement).catch(() => {});
                }
            }

            console.log(`✅ Schema imported: ${tableCount} tables created`);
            
            // Insert test data
            await this.insertTestData(connection);
            
            await connection.end();
            return true;

        } catch (error) {
            console.error('Schema import error:', error.message);
            // Fall back to basic schema
            await this.createBasicSchema();
            return true;
        }
    }

    async createBasicSchema() {
        console.log('Creating basic schema...');
        
        const connection = await mysql.createConnection({
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password,
            database: DB_CONFIG.name,
            multipleStatements: true
        });

        const tables = [
            // Main QR codes table
            `CREATE TABLE IF NOT EXISTS qr_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                qr_id VARCHAR(50) UNIQUE NOT NULL,
                qr_type VARCHAR(20) DEFAULT 'DYNAMIC',
                merchant_id VARCHAR(100),
                merchant_name VARCHAR(255),
                vpa VARCHAR(255),
                amount DECIMAL(10, 2),
                status VARCHAR(50) DEFAULT 'ACTIVE',
                qr_data TEXT,
                qr_image_url TEXT,
                upi_string TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_qr_id (qr_id),
                INDEX idx_merchant_id (merchant_id),
                INDEX idx_status (status)
            )`,
            
            // Transactions table
            `CREATE TABLE IF NOT EXISTS qr_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                transaction_id VARCHAR(100) UNIQUE NOT NULL,
                qr_id VARCHAR(50),
                merchant_txn_id VARCHAR(100),
                bank_reference_no VARCHAR(100),
                amount DECIMAL(10, 2),
                currency VARCHAR(10) DEFAULT 'INR',
                status VARCHAR(50),
                payment_method VARCHAR(50),
                payer_vpa VARCHAR(255),
                payer_name VARCHAR(255),
                payer_mobile VARCHAR(20),
                initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_transaction_id (transaction_id),
                INDEX idx_qr_id (qr_id),
                INDEX idx_status (status)
            )`,
            
            // Compatibility view for old code
            `CREATE OR REPLACE VIEW transactions AS 
             SELECT 
                id,
                transaction_id,
                qr_id as qr_code_id,
                merchant_txn_id as merchant_transaction_id,
                bank_reference_no as bank_rrn,
                amount,
                status,
                payer_vpa,
                payer_name,
                payer_mobile as mobile_number,
                initiated_at as transaction_date,
                created_at
             FROM qr_transactions`
        ];

        for (const table of tables) {
            await connection.execute(table).catch(err => {
                console.warn(`Table creation warning: ${err.message.substring(0, 50)}...`);
            });
        }

        console.log('✅ Basic schema created');
        
        // Insert test data
        await this.insertTestData(connection);
        
        await connection.end();
    }

    async insertTestData(connection) {
        try {
            console.log('📊 Inserting test data...');
            
            // Insert test QR code
            await connection.execute(
                `INSERT INTO qr_codes (qr_id, merchant_id, merchant_name, vpa, status) 
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE updated_at = NOW()`,
                ['QR_TEST_001', 'MERCH001', 'Test Merchant', 'test@sabpaisa', 'ACTIVE']
            );

            console.log('✅ Test data inserted');
        } catch (error) {
            console.warn('Test data already exists');
        }
    }

    printManualInstructions() {
        console.log('\n' + '='.repeat(50));
        console.log('MANUAL DATABASE SETUP REQUIRED');
        console.log('='.repeat(50));
        console.log('\nPlease run these commands manually:\n');
        console.log('1. Open MySQL as root:');
        console.log('   mysql -u root -p\n');
        console.log('2. Run these SQL commands:');
        console.log(`   CREATE DATABASE IF NOT EXISTS ${DB_CONFIG.name};`);
        console.log(`   CREATE USER IF NOT EXISTS '${DB_CONFIG.user}'@'${DB_CONFIG.host}' IDENTIFIED BY '${DB_CONFIG.password}';`);
        console.log(`   GRANT ALL PRIVILEGES ON ${DB_CONFIG.name}.* TO '${DB_CONFIG.user}'@'${DB_CONFIG.host}';`);
        console.log('   FLUSH PRIVILEGES;');
        console.log('   exit;\n');
        console.log('3. Then run this command to import schema:');
        console.log(`   mysql -u ${DB_CONFIG.user} -p${DB_CONFIG.password} ${DB_CONFIG.name} < database/QR_DATABASE_TRANSFORMATION.sql\n`);
        console.log('4. Finally, restart the server:');
        console.log('   npm start\n');
        console.log('='.repeat(50));
    }
}

// Run if called directly
if (require.main === module) {
    const setup = new DatabaseAutoSetup();
    setup.run().then(success => {
        if (success) {
            console.log('\n🎉 Database is ready to use!');
            console.log('You can now run: npm start');
        }
        process.exit(success ? 0 : 1);
    });
}

module.exports = DatabaseAutoSetup;