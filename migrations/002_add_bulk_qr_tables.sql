-- Migration: Add Bulk QR Generation Tables
-- Date: 2025-09-03
-- Description: Adds tables for bulk QR generation, batch processing, and enhanced QR tracking

-- =====================================================
-- 1. BULK QR BATCHES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS bulk_qr_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(50) UNIQUE NOT NULL,
    batch_name VARCHAR(255),
    total_count INT DEFAULT 0,
    successful_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    created_by VARCHAR(100),
    processing_time_ms INT,
    error_details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_batch_id (batch_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. ENHANCED QR CODES TABLE (Updates)
-- =====================================================
ALTER TABLE qr_codes 
ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS reference_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS transaction_ref VARCHAR(100),
ADD COLUMN IF NOT EXISTS qr_image_data MEDIUMTEXT,
ADD COLUMN IF NOT EXISTS upi_string TEXT,
ADD COLUMN IF NOT EXISTS vpa_handle VARCHAR(50) DEFAULT 'hdfc',
ADD COLUMN IF NOT EXISTS metadata JSON,
ADD INDEX idx_batch_id (batch_id),
ADD INDEX idx_merchant_id (merchant_id),
ADD INDEX idx_mobile_number (mobile_number),
ADD INDEX idx_email (email),
ADD CONSTRAINT fk_batch_id FOREIGN KEY (batch_id) 
    REFERENCES bulk_qr_batches(batch_id) ON DELETE SET NULL;

-- =====================================================
-- 3. QR CODE VALIDATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_validations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50),
    validation_type ENUM('xss', 'sql_injection', 'email', 'mobile', 'amount', 'merchant_id') NOT NULL,
    original_value TEXT,
    sanitized_value TEXT,
    is_valid BOOLEAN DEFAULT TRUE,
    validation_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qr_id (qr_id),
    INDEX idx_validation_type (validation_type),
    INDEX idx_is_valid (is_valid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. BULK QR DOWNLOADS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS bulk_qr_downloads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    download_id VARCHAR(50) UNIQUE NOT NULL,
    batch_id VARCHAR(50),
    download_format ENUM('zip', 'csv', 'pdf') DEFAULT 'zip',
    file_size_bytes BIGINT,
    download_count INT DEFAULT 0,
    download_url TEXT,
    expires_at TIMESTAMP NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_batch_id (batch_id),
    INDEX idx_download_id (download_id),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. QR CODE ANALYTICS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_analytics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(50),
    batch_id VARCHAR(50),
    scan_count INT DEFAULT 0,
    unique_scan_count INT DEFAULT 0,
    last_scanned_at TIMESTAMP NULL,
    total_transaction_amount DECIMAL(15, 2) DEFAULT 0.00,
    successful_transactions INT DEFAULT 0,
    failed_transactions INT DEFAULT 0,
    avg_transaction_amount DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_qr_id (qr_id),
    INDEX idx_batch_id (batch_id),
    INDEX idx_scan_count (scan_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 6. CSV UPLOAD LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS csv_upload_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id VARCHAR(50) UNIQUE NOT NULL,
    file_name VARCHAR(255),
    file_size_bytes BIGINT,
    total_rows INT,
    processed_rows INT DEFAULT 0,
    failed_rows INT DEFAULT 0,
    batch_id VARCHAR(50),
    error_details JSON,
    processing_status ENUM('uploading', 'validating', 'processing', 'completed', 'failed') DEFAULT 'uploading',
    uploaded_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_upload_id (upload_id),
    INDEX idx_batch_id (batch_id),
    INDEX idx_processing_status (processing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 7. SECURITY AUDIT LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS security_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type ENUM('xss_blocked', 'sql_injection_blocked', 'invalid_input', 'suspicious_activity') NOT NULL,
    source_ip VARCHAR(45),
    user_agent TEXT,
    request_path VARCHAR(255),
    request_method VARCHAR(10),
    blocked_content TEXT,
    sanitized_content TEXT,
    threat_level ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
    batch_id VARCHAR(50),
    qr_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_type (event_type),
    INDEX idx_threat_level (threat_level),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- POSTGRESQL VERSION (Alternative)
-- =====================================================
-- For PostgreSQL, replace the above with:
/*
-- Bulk QR Batches
CREATE TABLE IF NOT EXISTS bulk_qr_batches (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(50) UNIQUE NOT NULL,
    batch_name VARCHAR(255),
    total_count INT DEFAULT 0,
    successful_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    created_by VARCHAR(100),
    processing_time_ms INT,
    error_details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL
);

CREATE INDEX idx_batch_id ON bulk_qr_batches(batch_id);
CREATE INDEX idx_batch_status ON bulk_qr_batches(status);
CREATE INDEX idx_batch_created_at ON bulk_qr_batches(created_at);

-- Enhanced QR Codes
ALTER TABLE qr_codes 
ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS reference_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS transaction_ref VARCHAR(100),
ADD COLUMN IF NOT EXISTS qr_image_data TEXT,
ADD COLUMN IF NOT EXISTS upi_string TEXT,
ADD COLUMN IF NOT EXISTS vpa_handle VARCHAR(50) DEFAULT 'hdfc',
ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_qr_batch_id ON qr_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_qr_merchant_id ON qr_codes(merchant_id);
CREATE INDEX IF NOT EXISTS idx_qr_mobile ON qr_codes(mobile_number);
CREATE INDEX IF NOT EXISTS idx_qr_email ON qr_codes(email);

-- Add other tables similarly with PostgreSQL syntax
*/

-- =====================================================
-- SAMPLE DATA FOR TESTING
-- =====================================================
-- INSERT INTO bulk_qr_batches (batch_id, batch_name, total_count, status, created_by)
-- VALUES ('BATCH_TEST_001', 'Test Batch', 5, 'pending', 'system');

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
-- DROP TABLE IF EXISTS security_audit_log;
-- DROP TABLE IF EXISTS csv_upload_logs;
-- DROP TABLE IF EXISTS qr_analytics;
-- DROP TABLE IF EXISTS bulk_qr_downloads;
-- DROP TABLE IF EXISTS qr_validations;
-- DROP TABLE IF EXISTS bulk_qr_batches;
-- ALTER TABLE qr_codes DROP COLUMN batch_id, DROP COLUMN reference_name, ...;