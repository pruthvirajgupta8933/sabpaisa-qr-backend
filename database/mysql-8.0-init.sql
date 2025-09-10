-- MySQL 8.0 Compatible Database Initialization Script for SabPaisa QR Backend
-- Compatible with MySQL 8.0 and phpMyAdmin 5.2.0
-- Run this with: mysql -u <username> -p < mysql-8.0-init.sql

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS sabpaisa_qr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sabpaisa_qr;

-- Drop existing tables if they exist (for clean setup)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS qr_codes;
DROP TABLE IF EXISTS qr_transactions;
DROP TABLE IF EXISTS qr_scan_analytics;
DROP TABLE IF EXISTS qr_performance_metrics;
DROP TABLE IF EXISTS qr_status_history;
DROP TABLE IF EXISTS qr_audit_log;
DROP TABLE IF EXISTS qr_bulk_batches;
DROP TABLE IF EXISTS qr_batch_queue;
DROP TABLE IF EXISTS qr_notifications;
DROP TABLE IF EXISTS qr_templates;
DROP VIEW IF EXISTS transactions;
DROP VIEW IF EXISTS webhook_logs;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. QR Codes Table (Main)
CREATE TABLE qr_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50) UNIQUE NOT NULL,
    qr_type ENUM('STATIC', 'DYNAMIC', 'BULK') DEFAULT 'DYNAMIC',
    qr_category ENUM('P2P', 'P2M', 'B2B') DEFAULT 'P2M',
    
    -- Merchant Information
    merchant_id VARCHAR(100) NOT NULL,
    merchant_name VARCHAR(255) NOT NULL,
    merchant_category VARCHAR(100),
    merchant_mobile VARCHAR(20),
    merchant_email VARCHAR(255),
    
    -- Payment Information
    vpa VARCHAR(255) NOT NULL,
    vpa_handle VARCHAR(50) DEFAULT 'sabpaisa',
    amount DECIMAL(10, 2),
    min_amount DECIMAL(10, 2) DEFAULT 1.00,
    max_amount DECIMAL(10, 2) DEFAULT 100000.00,
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- QR Details
    reference_name VARCHAR(255),
    description TEXT,
    location_name VARCHAR(255),
    location_address TEXT,
    pincode VARCHAR(10),
    
    -- QR Data
    qr_data TEXT,
    qr_image_url TEXT,
    upi_string TEXT,
    short_url VARCHAR(255),
    
    -- Status and Tracking
    status ENUM('ACTIVE', 'INACTIVE', 'EXPIRED', 'BLOCKED') DEFAULT 'ACTIVE',
    usage_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    last_used_at TIMESTAMP NULL DEFAULT NULL,
    
    -- Timestamps - MySQL 8.0 compatible
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    
    -- Metadata
    metadata JSON,
    tags VARCHAR(500),
    
    -- Indexes
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_qr_type (qr_type),
    INDEX idx_vpa (vpa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. QR Transactions Table
CREATE TABLE qr_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    qr_id VARCHAR(50),
    merchant_id VARCHAR(100),
    merchant_txn_id VARCHAR(100),
    bank_reference_no VARCHAR(100),
    
    -- Transaction Details
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status ENUM('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED', 'REFUNDED') DEFAULT 'INITIATED',
    status_description TEXT,
    
    -- Payer Information
    payer_vpa VARCHAR(255),
    payer_name VARCHAR(255),
    payer_mobile VARCHAR(20),
    payer_account VARCHAR(50),
    payer_ifsc VARCHAR(20),
    
    -- Payment Details
    payment_method ENUM('UPI', 'CARD', 'NETBANKING', 'WALLET') DEFAULT 'UPI',
    payment_app VARCHAR(100),
    device_type VARCHAR(50),
    ip_address VARCHAR(45),
    
    -- Settlement Information
    settlement_status ENUM('PENDING', 'PROCESSED', 'SETTLED', 'FAILED') DEFAULT 'PENDING',
    settlement_amount DECIMAL(10, 2),
    settlement_date DATE,
    settlement_reference VARCHAR(100),
    
    -- Timestamps - MySQL 8.0 compatible
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Response Data
    gateway_response JSON,
    webhook_response JSON,
    
    -- Foreign Keys
    FOREIGN KEY (qr_id) REFERENCES qr_codes(qr_id) ON DELETE SET NULL,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_qr_id (qr_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_initiated_at (initiated_at),
    INDEX idx_payer_vpa (payer_vpa),
    INDEX idx_settlement_status (settlement_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. QR Scan Analytics Table
CREATE TABLE qr_scan_analytics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50),
    scan_id VARCHAR(100) UNIQUE,
    
    -- Scan Details
    scan_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scan_result ENUM('SUCCESS', 'FAILED', 'EXPIRED', 'INVALID') DEFAULT 'SUCCESS',
    scan_source VARCHAR(100),
    
    -- Location and Device
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type ENUM('MOBILE', 'TABLET', 'DESKTOP', 'OTHER') DEFAULT 'MOBILE',
    os_name VARCHAR(50),
    browser_name VARCHAR(50),
    
    -- Geographic Data
    country VARCHAR(100),
    state VARCHAR(100),
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Transaction Link
    transaction_initiated BOOLEAN DEFAULT FALSE,
    transaction_id VARCHAR(100),
    
    -- Metadata
    metadata JSON,
    
    -- Foreign Keys
    FOREIGN KEY (qr_id) REFERENCES qr_codes(qr_id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_qr_id (qr_id),
    INDEX idx_scan_timestamp (scan_timestamp),
    INDEX idx_device_type (device_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. QR Performance Metrics Table
CREATE TABLE qr_performance_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metric_date DATE NOT NULL,
    metric_hour TINYINT,
    
    -- QR Metrics
    total_qr_generated INT DEFAULT 0,
    total_qr_scanned INT DEFAULT 0,
    unique_qr_scanned INT DEFAULT 0,
    
    -- Transaction Metrics
    total_transactions INT DEFAULT 0,
    successful_transactions INT DEFAULT 0,
    failed_transactions INT DEFAULT 0,
    total_amount DECIMAL(15, 2) DEFAULT 0.00,
    average_amount DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Performance Metrics
    avg_response_time_ms INT,
    max_response_time_ms INT,
    min_response_time_ms INT,
    api_success_rate DECIMAL(5, 2),
    
    -- User Metrics
    unique_users INT DEFAULT 0,
    new_users INT DEFAULT 0,
    returning_users INT DEFAULT 0,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    UNIQUE KEY unique_metric (metric_date, metric_hour),
    INDEX idx_metric_date (metric_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. QR Status History Table
CREATE TABLE qr_status_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50),
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    reason TEXT,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (qr_id) REFERENCES qr_codes(qr_id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_qr_id (qr_id),
    INDEX idx_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. QR Audit Log Table
CREATE TABLE qr_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    action VARCHAR(50),
    user_id VARCHAR(100),
    user_type VARCHAR(50),
    
    -- Audit Details
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. QR Bulk Batches Table
CREATE TABLE qr_bulk_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(50) UNIQUE NOT NULL,
    batch_name VARCHAR(255),
    merchant_id VARCHAR(100),
    
    -- Batch Details
    total_count INT DEFAULT 0,
    processed_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    
    -- Status
    status ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'QUEUED',
    error_message TEXT,
    
    -- File Information
    file_name VARCHAR(255),
    file_path TEXT,
    file_size_kb INT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    
    -- User Information
    created_by VARCHAR(100),
    
    -- Metadata
    metadata JSON,
    
    -- Indexes
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. QR Batch Queue Table
CREATE TABLE qr_batch_queue (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(50),
    item_index INT,
    
    -- Queue Item Details
    merchant_id VARCHAR(100),
    merchant_name VARCHAR(255),
    vpa VARCHAR(255),
    amount DECIMAL(10, 2),
    reference_name VARCHAR(255),
    
    -- Processing Status
    status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED') DEFAULT 'PENDING',
    qr_id VARCHAR(50),
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL DEFAULT NULL,
    
    -- Foreign Keys
    FOREIGN KEY (batch_id) REFERENCES qr_bulk_batches(batch_id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_batch_id (batch_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. QR Notifications Table
CREATE TABLE qr_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    notification_id VARCHAR(100) UNIQUE NOT NULL,
    notification_type ENUM('WEBHOOK', 'EMAIL', 'SMS', 'PUSH') DEFAULT 'WEBHOOK',
    
    -- Target Information
    target_url TEXT,
    target_email VARCHAR(255),
    target_mobile VARCHAR(20),
    
    -- Notification Content
    subject VARCHAR(500),
    content TEXT,
    payload JSON,
    
    -- Related Entity
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    transaction_id VARCHAR(100),
    
    -- Status and Retry
    status ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'EXPIRED') DEFAULT 'PENDING',
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    
    -- Response
    response_code INT,
    response_body TEXT,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL DEFAULT NULL,
    delivered_at TIMESTAMP NULL DEFAULT NULL,
    next_retry_at TIMESTAMP NULL DEFAULT NULL,
    
    -- Indexes
    INDEX idx_notification_type (notification_type),
    INDEX idx_status (status),
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. QR Templates Table
CREATE TABLE qr_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    merchant_id VARCHAR(100),
    
    -- Template Configuration
    template_type ENUM('BASIC', 'ADVANCED', 'CUSTOM') DEFAULT 'BASIC',
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Template Data
    template_config JSON,
    vpa_template VARCHAR(255),
    amount_fixed DECIMAL(10, 2),
    amount_range_min DECIMAL(10, 2),
    amount_range_max DECIMAL(10, 2),
    
    -- Styling
    logo_url TEXT,
    color_scheme VARCHAR(50),
    custom_css TEXT,
    
    -- Usage
    usage_count INT DEFAULT 0,
    last_used_at TIMESTAMP NULL DEFAULT NULL,
    
    -- Status
    status ENUM('ACTIVE', 'INACTIVE', 'DRAFT') DEFAULT 'DRAFT',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Metadata
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    
    -- Indexes
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create Views for Backward Compatibility
-- View 1: transactions (maps to qr_transactions)
CREATE VIEW transactions AS
SELECT 
    id,
    transaction_id,
    qr_id as qr_code_id,
    merchant_id,
    merchant_txn_id as merchant_transaction_id,
    bank_reference_no as bank_rrn,
    amount,
    currency,
    status,
    status_description,
    payer_vpa,
    payer_name,
    payer_mobile as mobile_number,
    payment_method as payment_mode,
    initiated_at as transaction_date,
    settlement_amount,
    settlement_date,
    created_at,
    updated_at
FROM qr_transactions;

-- View 2: webhook_logs (maps to qr_notifications)
CREATE VIEW webhook_logs AS
SELECT 
    id,
    notification_id as webhook_id,
    target_url as webhook_url,
    payload,
    status,
    response_code,
    response_body,
    error_message,
    retry_count,
    created_at,
    sent_at
FROM qr_notifications
WHERE notification_type = 'WEBHOOK';

-- Insert Sample Data for Testing
-- Sample QR Codes
INSERT INTO qr_codes (qr_id, merchant_id, merchant_name, vpa, amount, status, qr_data, upi_string)
VALUES 
    ('QR_STATIC_001', 'MERCH001', 'Test Merchant 1', 'merchant1@sabpaisa', NULL, 'ACTIVE', 
     'upi://pay?pa=merchant1@sabpaisa&pn=Test%20Merchant%201', 
     'upi://pay?pa=merchant1@sabpaisa&pn=Test%20Merchant%201'),
    
    ('QR_DYNAMIC_001', 'MERCH002', 'Test Merchant 2', 'merchant2@sabpaisa', 500.00, 'ACTIVE',
     'upi://pay?pa=merchant2@sabpaisa&pn=Test%20Merchant%202&am=500',
     'upi://pay?pa=merchant2@sabpaisa&pn=Test%20Merchant%202&am=500'),
    
    ('QR_BULK_001', 'MERCH003', 'Test Merchant 3', 'merchant3@sabpaisa', 1000.00, 'ACTIVE',
     'upi://pay?pa=merchant3@sabpaisa&pn=Test%20Merchant%203&am=1000',
     'upi://pay?pa=merchant3@sabpaisa&pn=Test%20Merchant%203&am=1000');

-- Sample Templates
INSERT INTO qr_templates (template_id, template_name, merchant_id, template_type, status)
VALUES 
    ('TMPL_001', 'Basic Payment Template', 'MERCH001', 'BASIC', 'ACTIVE'),
    ('TMPL_002', 'Advanced Payment Template', 'MERCH002', 'ADVANCED', 'ACTIVE');

-- Sample Transaction (Optional)
INSERT INTO qr_transactions (transaction_id, qr_id, merchant_id, amount, status, payer_vpa)
VALUES 
    ('TXN_TEST_001', 'QR_STATIC_001', 'MERCH001', 100.00, 'SUCCESS', 'payer@upi');

-- Grant necessary permissions (if creating user)
-- GRANT ALL PRIVILEGES ON sabpaisa_qr.* TO 'sabpaisa'@'%' IDENTIFIED BY 'your_password';
-- FLUSH PRIVILEGES;

-- Show summary
SELECT 'Database setup completed successfully!' as message;
SELECT COUNT(*) as total_tables FROM information_schema.tables WHERE table_schema = 'sabpaisa_qr' AND table_type = 'BASE TABLE';
SELECT COUNT(*) as total_views FROM information_schema.tables WHERE table_schema = 'sabpaisa_qr' AND table_type = 'VIEW';
SELECT COUNT(*) as test_qr_codes FROM qr_codes;
SELECT COUNT(*) as test_templates FROM qr_templates;