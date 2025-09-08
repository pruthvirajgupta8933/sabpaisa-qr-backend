-- =============================================
-- SabPaisa Static QR Database Schema
-- Version: 1.0.0
-- Date: 2025-08-30
-- =============================================

-- Create database if not exists
-- CREATE DATABASE IF NOT EXISTS sabpaisa_qr;
-- USE sabpaisa_qr;

-- =============================================
-- 1. Main QR Codes Table
-- =============================================
CREATE TABLE IF NOT EXISTS qr_codes (
    id SERIAL PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL,
    client_code VARCHAR(50) NOT NULL,
    qr_identifier VARCHAR(5) UNIQUE NOT NULL,
    full_vpa VARCHAR(100) NOT NULL,
    upi_string TEXT NOT NULL,
    qr_image_url TEXT,
    reference_name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    amount_type VARCHAR(20) DEFAULT 'dynamic', -- 'dynamic' or 'fixed'
    max_amount_per_transaction DECIMAL(10,2),
    min_amount_per_transaction DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'blocked'
    design_config JSON,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_client_code (client_code),
    INDEX idx_qr_identifier (qr_identifier),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- =============================================
-- 2. QR Payments Table
-- =============================================
CREATE TABLE IF NOT EXISTS qr_payments (
    id SERIAL PRIMARY KEY,
    qr_code_id BIGINT UNSIGNED NOT NULL,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    upi_transaction_id VARCHAR(100),
    payer_vpa VARCHAR(100),
    payer_name VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'success', 'failed', 'refunded'
    payment_method VARCHAR(50),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settlement_date TIMESTAMP,
    settlement_status VARCHAR(20),
    response_data JSON,
    webhook_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id) ON DELETE CASCADE,
    INDEX idx_qr_code_id (qr_code_id),
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_status (status),
    INDEX idx_payment_date (payment_date)
);

-- =============================================
-- 3. VPA Pool Table (for managing unique identifiers)
-- =============================================
CREATE TABLE IF NOT EXISTS vpa_pool (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(5) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'available', -- 'available', 'reserved', 'used'
    merchant_id VARCHAR(50),
    reserved_at TIMESTAMP,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_status (status),
    INDEX idx_identifier (identifier)
);

-- =============================================
-- 4. QR Bulk Jobs Table
-- =============================================
CREATE TABLE IF NOT EXISTS qr_bulk_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(50) UNIQUE NOT NULL,
    merchant_id VARCHAR(50) NOT NULL,
    total_count INT NOT NULL,
    processed_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    file_path TEXT,
    error_log JSON,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_job_id (job_id)
);

-- =============================================
-- 5. QR Design Templates Table
-- =============================================
CREATE TABLE IF NOT EXISTS qr_design_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50) DEFAULT 'custom', -- 'default', 'custom', 'premium'
    merchant_id VARCHAR(50),
    template_config JSON NOT NULL,
    preview_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_template_type (template_type)
);

-- =============================================
-- 6. QR Analytics Table
-- =============================================
CREATE TABLE IF NOT EXISTS qr_analytics (
    id SERIAL PRIMARY KEY,
    qr_code_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    scan_count INT DEFAULT 0,
    payment_count INT DEFAULT 0,
    payment_amount DECIMAL(10,2) DEFAULT 0,
    unique_users INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_qr_date (qr_code_id, date),
    INDEX idx_date (date)
);

-- =============================================
-- 7. QR Audit Logs Table
-- =============================================
CREATE TABLE IF NOT EXISTS qr_audit_logs (
    id SERIAL PRIMARY KEY,
    qr_code_id BIGINT UNSIGNED,
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted', 'activated', 'deactivated'
    performed_by VARCHAR(100),
    old_data JSON,
    new_data JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_qr_code_id (qr_code_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
);

-- =============================================
-- 8. Webhook Events Table
-- =============================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    qr_code_id BIGINT UNSIGNED,
    payment_id BIGINT UNSIGNED,
    webhook_data JSON NOT NULL,
    processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    retry_count INT DEFAULT 0,
    error_message TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES qr_payments(id) ON DELETE SET NULL,
    INDEX idx_event_type (event_type),
    INDEX idx_processing_status (processing_status),
    INDEX idx_received_at (received_at)
);

-- =============================================
-- Views for Reporting
-- =============================================

-- Active QR Summary View
CREATE OR REPLACE VIEW v_active_qr_summary AS
SELECT 
    q.merchant_id,
    q.client_code,
    COUNT(*) as total_qr_codes,
    SUM(CASE WHEN q.status = 'active' THEN 1 ELSE 0 END) as active_qr_codes,
    SUM(CASE WHEN q.amount_type = 'fixed' THEN 1 ELSE 0 END) as fixed_amount_qr,
    SUM(CASE WHEN q.amount_type = 'dynamic' THEN 1 ELSE 0 END) as dynamic_amount_qr
FROM qr_codes q
GROUP BY q.merchant_id, q.client_code;

-- Daily Payment Summary View
CREATE OR REPLACE VIEW v_daily_payment_summary AS
SELECT 
    DATE(p.payment_date) as payment_date,
    q.merchant_id,
    q.client_code,
    COUNT(p.id) as transaction_count,
    SUM(p.amount) as total_amount,
    AVG(p.amount) as average_amount,
    MIN(p.amount) as min_amount,
    MAX(p.amount) as max_amount
FROM qr_payments p
INNER JOIN qr_codes q ON p.qr_code_id = q.id
WHERE p.status = 'success'
GROUP BY DATE(p.payment_date), q.merchant_id, q.client_code;

-- =============================================
-- Stored Procedures
-- =============================================

-- Procedure to generate unique QR identifier
DELIMITER //
CREATE PROCEDURE generate_unique_identifier(OUT new_identifier VARCHAR(5))
BEGIN
    DECLARE attempts INT DEFAULT 0;
    DECLARE max_attempts INT DEFAULT 100;
    
    WHILE attempts < max_attempts DO
        -- Generate random 5 character identifier (A-Z, 0-9)
        SET new_identifier = CONCAT(
            CHAR(FLOOR(65 + RAND() * 26)),
            CHAR(FLOOR(65 + RAND() * 26)),
            FLOOR(RAND() * 10),
            FLOOR(RAND() * 10),
            FLOOR(RAND() * 10)
        );
        
        -- Check if identifier is available
        IF NOT EXISTS (SELECT 1 FROM qr_codes WHERE qr_identifier = new_identifier) THEN
            LEAVE WHILE;
        END IF;
        
        SET attempts = attempts + 1;
    END WHILE;
    
    IF attempts >= max_attempts THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unable to generate unique identifier';
    END IF;
END//
DELIMITER ;

-- =============================================
-- Initial Data Seeding
-- =============================================

-- Insert default design templates
INSERT INTO qr_design_templates (template_name, template_type, template_config) VALUES
('SabPaisa Professional', 'default', '{"theme":"professional","colors":{"primary":"#1e3c72","secondary":"#2a5298"},"logo":true,"branding":true}'),
('Minimal', 'default', '{"theme":"minimal","colors":{"primary":"#000000","secondary":"#ffffff"},"logo":false,"branding":false}'),
('Branded', 'default', '{"theme":"branded","colors":{"primary":"#007bff","secondary":"#6c757d"},"logo":true,"branding":true}'),
('Classic', 'default', '{"theme":"classic","colors":{"primary":"#333333","secondary":"#666666"},"logo":false,"branding":true}');

-- =============================================
-- Indexes for Performance
-- =============================================

-- Additional composite indexes for common queries
CREATE INDEX idx_qr_merchant_status ON qr_codes(merchant_id, status);
CREATE INDEX idx_payment_qr_date ON qr_payments(qr_code_id, payment_date);
CREATE INDEX idx_analytics_qr_date ON qr_analytics(qr_code_id, date);

-- =============================================
-- Permissions (adjust based on your database user structure)
-- =============================================
-- GRANT SELECT, INSERT, UPDATE ON sabpaisa_qr.* TO 'app_user'@'%';
-- GRANT DELETE ON sabpaisa_qr.qr_codes TO 'app_user'@'%';
-- GRANT EXECUTE ON PROCEDURE sabpaisa_qr.generate_unique_identifier TO 'app_user'@'%';