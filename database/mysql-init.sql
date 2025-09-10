-- MySQL Database Initialization Script for SabPaisa QR Backend
-- This script creates all necessary tables for the new QR-optimized schema
-- Run this with: mysql -u <username> -p <database_name> < database/mysql-init.sql

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
DROP TABLE IF EXISTS qr_settlement_batches;
DROP TABLE IF EXISTS qr_settlement_transactions;
DROP TABLE IF EXISTS qr_refund_audit;
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
    display_name VARCHAR(255),
    store_location VARCHAR(255),
    terminal_id VARCHAR(100),
    
    -- QR Data
    qr_data TEXT,
    qr_image_url TEXT,
    upi_string TEXT,
    short_url VARCHAR(255),
    
    -- Status and Limits
    status ENUM('ACTIVE', 'INACTIVE', 'EXPIRED', 'BLOCKED') DEFAULT 'ACTIVE',
    expiry_date DATETIME,
    max_usage_count INT,
    usage_count INT DEFAULT 0,
    daily_limit DECIMAL(10, 2),
    monthly_limit DECIMAL(10, 2),
    
    -- Location
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    
    -- Metadata
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    batch_id VARCHAR(50),
    template_id VARCHAR(50),
    metadata JSON,
    tags JSON,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    activated_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_qr_id (qr_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_batch_id (batch_id),
    INDEX idx_created_at (created_at),
    INDEX idx_vpa (vpa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. QR Transactions Table
CREATE TABLE qr_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    qr_id VARCHAR(50) NOT NULL,
    merchant_id VARCHAR(100) NOT NULL,
    merchant_txn_id VARCHAR(100),
    
    -- Transaction Details
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status ENUM('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED', 'REFUNDED', 'PARTIAL_REFUNDED') DEFAULT 'PENDING',
    status_description TEXT,
    transaction_type ENUM('PAYMENT', 'REFUND', 'SETTLEMENT') DEFAULT 'PAYMENT',
    
    -- Payment Information
    payment_method ENUM('UPI', 'CARD', 'NETBANKING', 'WALLET') DEFAULT 'UPI',
    bank_reference_no VARCHAR(100),
    npci_txn_id VARCHAR(100),
    rrn VARCHAR(50),
    auth_code VARCHAR(50),
    
    -- Payer Information
    payer_vpa VARCHAR(255),
    payer_name VARCHAR(255),
    payer_mobile VARCHAR(20),
    payer_email VARCHAR(255),
    payer_account VARCHAR(50),
    payer_ifsc VARCHAR(20),
    
    -- Response Codes
    response_code VARCHAR(10),
    response_message TEXT,
    gateway_response JSON,
    
    -- Settlement Information
    settlement_status ENUM('PENDING', 'PROCESSED', 'SETTLED', 'FAILED') DEFAULT 'PENDING',
    settlement_date DATE,
    settlement_amount DECIMAL(10, 2),
    settlement_reference VARCHAR(100),
    
    -- Refund Information
    refund_amount DECIMAL(10, 2),
    refund_status VARCHAR(50),
    refund_reference VARCHAR(100),
    refund_reason TEXT,
    
    -- Metadata
    device_info JSON,
    location_info JSON,
    metadata JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamps
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    settled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_qr_id (qr_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_initiated_at (initiated_at),
    INDEX idx_payer_vpa (payer_vpa),
    INDEX idx_settlement_status (settlement_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. QR Scan Analytics Table
CREATE TABLE qr_scan_analytics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50) NOT NULL,
    scan_id VARCHAR(100) UNIQUE NOT NULL,
    scan_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Scan Details
    scan_source ENUM('CAMERA', 'GALLERY', 'APP', 'UNKNOWN') DEFAULT 'UNKNOWN',
    scan_result ENUM('SUCCESS', 'FAILED', 'INVALID', 'EXPIRED') DEFAULT 'SUCCESS',
    error_reason TEXT,
    
    -- Transaction Tracking
    transaction_initiated BOOLEAN DEFAULT FALSE,
    transaction_id VARCHAR(100),
    time_to_transaction INT, -- seconds from scan to transaction
    
    -- Device Information
    device_type VARCHAR(50),
    device_model VARCHAR(100),
    os_name VARCHAR(50),
    os_version VARCHAR(50),
    app_name VARCHAR(100),
    app_version VARCHAR(50),
    
    -- Location Information
    ip_address VARCHAR(45),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    city VARCHAR(100),
    country VARCHAR(100),
    
    -- User Information
    user_id VARCHAR(100),
    session_id VARCHAR(100),
    
    -- Metadata
    metadata JSON,
    
    -- Indexes
    INDEX idx_qr_id (qr_id),
    INDEX idx_scan_timestamp (scan_timestamp),
    INDEX idx_transaction_id (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. QR Performance Metrics Table
CREATE TABLE qr_performance_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50) NOT NULL,
    metric_date DATE NOT NULL,
    
    -- Scan Metrics
    total_scans INT DEFAULT 0,
    unique_scans INT DEFAULT 0,
    failed_scans INT DEFAULT 0,
    
    -- Transaction Metrics
    total_transactions INT DEFAULT 0,
    successful_transactions INT DEFAULT 0,
    failed_transactions INT DEFAULT 0,
    
    -- Amount Metrics
    total_amount DECIMAL(15, 2) DEFAULT 0.00,
    average_amount DECIMAL(10, 2) DEFAULT 0.00,
    min_amount DECIMAL(10, 2),
    max_amount DECIMAL(10, 2),
    
    -- Performance Metrics
    scan_to_transaction_rate DECIMAL(5, 2), -- percentage
    success_rate DECIMAL(5, 2), -- percentage
    average_processing_time INT, -- seconds
    
    -- Hourly Distribution
    peak_hour INT,
    peak_hour_transactions INT,
    hourly_distribution JSON,
    
    -- Indexes
    UNIQUE KEY unique_qr_date (qr_id, metric_date),
    INDEX idx_metric_date (metric_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. QR Status History Table
CREATE TABLE qr_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    status_reason TEXT,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_qr_id (qr_id),
    INDEX idx_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. QR Audit Log Table
CREATE TABLE qr_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    action_description TEXT,
    performed_by VARCHAR(100),
    user_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_data JSON,
    response_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_qr_id (qr_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Bulk QR Batches Table
CREATE TABLE qr_bulk_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(50) UNIQUE NOT NULL,
    batch_name VARCHAR(255),
    merchant_id VARCHAR(100) NOT NULL,
    
    -- Batch Details
    total_count INT DEFAULT 0,
    processed_count INT DEFAULT 0,
    successful_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    
    -- Status
    status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
    error_details JSON,
    
    -- File Information
    file_name VARCHAR(255),
    file_size BIGINT,
    file_url TEXT,
    
    -- Processing Details
    processing_time_ms INT,
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_batch_id (batch_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. QR Batch Queue Table
CREATE TABLE qr_batch_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    queue_id VARCHAR(50) UNIQUE NOT NULL,
    batch_id VARCHAR(50),
    queue_type ENUM('QR_GENERATION', 'CSV_UPLOAD', 'BULK_UPDATE') DEFAULT 'QR_GENERATION',
    
    -- Queue Data
    queue_data JSON NOT NULL,
    priority INT DEFAULT 5,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    
    -- Status
    status ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED') DEFAULT 'QUEUED',
    error_message TEXT,
    
    -- Processing
    processed_by VARCHAR(100),
    processed_at TIMESTAMP NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_batch_id (batch_id),
    INDEX idx_status (status),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. QR Notifications Table
CREATE TABLE qr_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    notification_id VARCHAR(100) UNIQUE NOT NULL,
    notification_type ENUM('WEBHOOK', 'EMAIL', 'SMS', 'PUSH') NOT NULL,
    
    -- Target Information
    target_type ENUM('TRANSACTION', 'QR_CODE', 'MERCHANT', 'SYSTEM') DEFAULT 'TRANSACTION',
    target_id VARCHAR(100),
    
    -- Notification Details
    channel VARCHAR(50),
    recipient VARCHAR(255),
    subject VARCHAR(500),
    content TEXT,
    template_id VARCHAR(50),
    
    -- Status
    status ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED') DEFAULT 'PENDING',
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Response
    provider_response JSON,
    delivery_time TIMESTAMP NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_notification_type (notification_type),
    INDEX idx_target_id (target_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. QR Templates Table
CREATE TABLE qr_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    merchant_id VARCHAR(100),
    
    -- Template Configuration
    template_type ENUM('STANDARD', 'CUSTOM', 'BRANDED') DEFAULT 'STANDARD',
    template_data JSON,
    
    -- QR Configuration
    default_amount DECIMAL(10, 2),
    default_description TEXT,
    default_expiry_minutes INT,
    
    -- Design Configuration
    logo_url TEXT,
    background_color VARCHAR(7),
    foreground_color VARCHAR(7),
    design_config JSON,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_template_id (template_id),
    INDEX idx_merchant_id (merchant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create Views for Backward Compatibility
CREATE VIEW transactions AS 
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
    settlement_amount,
    settlement_date,
    payment_method as payment_mode,
    status_description,
    created_at
FROM qr_transactions;

CREATE VIEW webhook_logs AS
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
WHERE notification_type = 'WEBHOOK';

-- Insert Test Data
INSERT INTO qr_codes (
    qr_id, qr_type, merchant_id, merchant_name, vpa, 
    status, reference_name, description
) VALUES 
    ('QR_TEST_001', 'DYNAMIC', 'MERCH001', 'Test Merchant', 'test@sabpaisa', 
     'ACTIVE', 'Main Store QR', 'Test QR for development'),
    ('QR_TEST_002', 'STATIC', 'MERCH001', 'Test Merchant', 'test@sabpaisa', 
     'ACTIVE', 'Counter QR', 'Fixed amount QR'),
    ('QR_DEMO_001', 'DYNAMIC', 'DEMO001', 'Demo Merchant', 'demo@sabpaisa', 
     'ACTIVE', 'Demo QR', 'For demonstration purposes');

INSERT INTO qr_templates (
    template_id, template_name, merchant_id, template_type, is_default
) VALUES 
    ('TMPL_001', 'Default Template', 'MERCH001', 'STANDARD', TRUE),
    ('TMPL_002', 'Premium Template', 'MERCH001', 'BRANDED', FALSE);

-- Insert sample transaction
INSERT INTO qr_transactions (
    transaction_id, qr_id, merchant_id, amount, status, 
    payer_vpa, payer_name, payment_method
) VALUES 
    ('TXN_TEST_001', 'QR_TEST_001', 'MERCH001', 100.00, 'SUCCESS', 
     'customer@upi', 'Test Customer', 'UPI');

-- Create indexes for performance
CREATE INDEX idx_qr_merchant ON qr_codes(merchant_id, status);
CREATE INDEX idx_txn_date_merchant ON qr_transactions(merchant_id, initiated_at);
CREATE INDEX idx_scan_qr_date ON qr_scan_analytics(qr_id, scan_timestamp);

-- Grant permissions (if needed for deployment)
-- GRANT ALL PRIVILEGES ON sabpaisa_qr.* TO 'your_app_user'@'localhost';
-- FLUSH PRIVILEGES;

-- Display summary
SELECT 'Database initialization complete!' as Status;
SELECT COUNT(*) as 'Total Tables' FROM information_schema.tables WHERE table_schema = DATABASE();
SELECT COUNT(*) as 'Test QR Codes' FROM qr_codes;
SELECT COUNT(*) as 'Test Transactions' FROM qr_transactions;