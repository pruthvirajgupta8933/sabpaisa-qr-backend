-- Complete QR Payment System Database Schema
-- Optimized for scalability and reporting

-- =====================================================
-- 1. CORE TABLES
-- =====================================================

-- QR Codes Master Table
CREATE TABLE IF NOT EXISTS qr_codes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    qr_identifier VARCHAR(50) UNIQUE NOT NULL,
    merchant_id VARCHAR(50) NOT NULL,
    reference_name VARCHAR(255) NOT NULL,
    vpa VARCHAR(100) NOT NULL,
    qr_type ENUM('static', 'dynamic') DEFAULT 'static',
    amount DECIMAL(10, 2) DEFAULT NULL,
    purpose VARCHAR(255),
    description TEXT,
    
    -- QR Code Data
    qr_string TEXT NOT NULL,
    qr_image_url VARCHAR(500),
    download_url VARCHAR(500),
    
    -- Status and Metadata
    status ENUM('active', 'inactive', 'suspended', 'expired') DEFAULT 'active',
    activation_date DATETIME,
    expiry_date DATETIME,
    
    -- Location Information
    store_location VARCHAR(255),
    store_city VARCHAR(100),
    store_state VARCHAR(100),
    store_pincode VARCHAR(10),
    
    -- Limits and Controls
    daily_limit DECIMAL(10, 2),
    monthly_limit DECIMAL(10, 2),
    transaction_limit DECIMAL(10, 2),
    min_amount DECIMAL(10, 2) DEFAULT 1.00,
    max_amount DECIMAL(10, 2),
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_qr_type (qr_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. TRANSACTION TABLES (Partitioned for Scale)
-- =====================================================

-- Main Transactions Table (Partitioned by Month)
CREATE TABLE IF NOT EXISTS qr_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    qr_code_id BIGINT NOT NULL,
    merchant_id VARCHAR(50) NOT NULL,
    
    -- Transaction Details
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    transaction_type ENUM('payment', 'refund', 'partial_refund') DEFAULT 'payment',
    payment_method ENUM('UPI', 'QR', 'NFC', 'OTHER') DEFAULT 'UPI',
    
    -- Customer Information
    customer_vpa VARCHAR(100),
    customer_name VARCHAR(255),
    customer_mobile VARCHAR(15),
    customer_email VARCHAR(255),
    
    -- Bank References
    reference_number VARCHAR(100),
    bank_reference_number VARCHAR(100),
    npci_txn_id VARCHAR(100),
    utr_number VARCHAR(100),
    
    -- Status Tracking
    status ENUM('initiated', 'pending', 'success', 'failed', 'timeout', 'refunded', 'partial_refunded') NOT NULL,
    status_message TEXT,
    failure_reason TEXT,
    
    -- Timestamps
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    settlement_date DATE,
    
    -- Device and Location
    device_info VARCHAR(255),
    ip_address VARCHAR(45),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Settlement Information
    settlement_status ENUM('pending', 'processing', 'settled', 'failed', 'on_hold') DEFAULT 'pending',
    settlement_batch_id VARCHAR(100),
    settlement_amount DECIMAL(10, 2),
    
    -- Refund Information (if applicable)
    original_transaction_id VARCHAR(100),
    refund_amount DECIMAL(10, 2),
    refund_reason TEXT,
    refund_initiated_by VARCHAR(100),
    refund_initiated_at TIMESTAMP NULL,
    refund_completed_at TIMESTAMP NULL,
    
    -- Webhook and Processing
    webhook_status ENUM('pending', 'sent', 'failed', 'acknowledged') DEFAULT 'pending',
    webhook_attempts INT DEFAULT 0,
    last_webhook_attempt TIMESTAMP NULL,
    
    INDEX idx_qr_code_id (qr_code_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_transaction_date (initiated_at),
    INDEX idx_status (status),
    INDEX idx_settlement_status (settlement_status),
    INDEX idx_customer_vpa (customer_vpa),
    INDEX idx_reference_number (reference_number),
    INDEX idx_settlement_date (settlement_date),
    INDEX idx_amount (amount),
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(initiated_at) * 100 + MONTH(initiated_at)) (
    PARTITION p202401 VALUES LESS THAN (202402),
    PARTITION p202402 VALUES LESS THAN (202403),
    PARTITION p202403 VALUES LESS THAN (202404),
    PARTITION p202404 VALUES LESS THAN (202405),
    PARTITION p202405 VALUES LESS THAN (202406),
    PARTITION p202406 VALUES LESS THAN (202407),
    PARTITION p202407 VALUES LESS THAN (202408),
    PARTITION p202408 VALUES LESS THAN (202409),
    PARTITION p202409 VALUES LESS THAN (202410),
    PARTITION p202410 VALUES LESS THAN (202411),
    PARTITION p202411 VALUES LESS THAN (202412),
    PARTITION p202412 VALUES LESS THAN (202501),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- =====================================================
-- 3. SETTLEMENT TABLES
-- =====================================================

-- Settlement Batches
CREATE TABLE IF NOT EXISTS qr_settlement_batches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(100) UNIQUE NOT NULL,
    merchant_id VARCHAR(50) NOT NULL,
    settlement_date DATE NOT NULL,
    
    -- Amounts
    total_transactions INT NOT NULL,
    gross_amount DECIMAL(12, 2) NOT NULL,
    total_refunds DECIMAL(12, 2) DEFAULT 0,
    charges DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    adjustments DECIMAL(10, 2) DEFAULT 0,
    net_settlement DECIMAL(12, 2) NOT NULL,
    
    -- Bank Details
    account_number VARCHAR(50),
    account_name VARCHAR(255),
    bank_name VARCHAR(100),
    ifsc_code VARCHAR(20),
    
    -- Status and Processing
    status ENUM('initiated', 'processing', 'completed', 'failed', 'on_hold', 'cancelled') NOT NULL,
    settlement_type ENUM('auto', 'manual', 'scheduled') DEFAULT 'auto',
    
    -- References
    bank_reference VARCHAR(100),
    utr_number VARCHAR(100),
    
    -- Timestamps
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    -- File References
    report_file_url VARCHAR(500),
    invoice_file_url VARCHAR(500),
    
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_settlement_date (settlement_date),
    INDEX idx_status (status),
    INDEX idx_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settlement Transaction Mapping
CREATE TABLE IF NOT EXISTS qr_settlement_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_batch_id BIGINT NOT NULL,
    transaction_id BIGINT NOT NULL,
    
    transaction_amount DECIMAL(10, 2) NOT NULL,
    charges DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    net_amount DECIMAL(10, 2) NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_settlement_transaction (settlement_batch_id, transaction_id),
    INDEX idx_settlement_batch_id (settlement_batch_id),
    INDEX idx_transaction_id (transaction_id),
    FOREIGN KEY (settlement_batch_id) REFERENCES qr_settlement_batches(id),
    FOREIGN KEY (transaction_id) REFERENCES qr_transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. REPORTING AND ANALYTICS TABLES
-- =====================================================

-- Daily Aggregated Stats (for fast dashboard queries)
CREATE TABLE IF NOT EXISTS qr_daily_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL,
    qr_code_id BIGINT,
    stat_date DATE NOT NULL,
    
    -- Transaction Counts
    total_transactions INT DEFAULT 0,
    successful_transactions INT DEFAULT 0,
    failed_transactions INT DEFAULT 0,
    pending_transactions INT DEFAULT 0,
    refunded_transactions INT DEFAULT 0,
    
    -- Amounts
    total_amount DECIMAL(12, 2) DEFAULT 0,
    successful_amount DECIMAL(12, 2) DEFAULT 0,
    refunded_amount DECIMAL(12, 2) DEFAULT 0,
    
    -- Averages
    avg_transaction_amount DECIMAL(10, 2) DEFAULT 0,
    
    -- Peak Times
    peak_hour TINYINT,
    peak_hour_transactions INT DEFAULT 0,
    
    -- Customer Stats
    unique_customers INT DEFAULT 0,
    new_customers INT DEFAULT 0,
    repeat_customers INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_merchant_qr_date (merchant_id, qr_code_id, stat_date),
    INDEX idx_stat_date (stat_date),
    INDEX idx_merchant_date (merchant_id, stat_date),
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hourly Transaction Stats (for pattern analysis)
CREATE TABLE IF NOT EXISTS qr_hourly_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL,
    stat_date DATE NOT NULL,
    stat_hour TINYINT NOT NULL,
    
    transaction_count INT DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    avg_amount DECIMAL(10, 2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_merchant_date_hour (merchant_id, stat_date, stat_hour),
    INDEX idx_merchant_date (merchant_id, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. AUDIT AND COMPLIANCE TABLES
-- =====================================================

-- Transaction Audit Log
CREATE TABLE IF NOT EXISTS qr_transaction_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_by VARCHAR(100),
    change_reason TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_created_at (created_at),
    INDEX idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refund Audit Trail
CREATE TABLE IF NOT EXISTS qr_refund_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(100) NOT NULL,
    refund_id VARCHAR(100) NOT NULL,
    
    original_amount DECIMAL(10, 2) NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    refund_type ENUM('full', 'partial') NOT NULL,
    
    initiated_by VARCHAR(100) NOT NULL,
    approved_by VARCHAR(100),
    refund_reason TEXT NOT NULL,
    
    status ENUM('initiated', 'approved', 'processing', 'completed', 'failed', 'cancelled') NOT NULL,
    status_message TEXT,
    
    bank_reference VARCHAR(100),
    
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_refund_id (refund_id),
    INDEX idx_status (status),
    INDEX idx_initiated_at (initiated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 6. WEBHOOK AND NOTIFICATION TABLES
-- =====================================================

-- Webhook Events Log
CREATE TABLE IF NOT EXISTS qr_webhook_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100),
    
    payload JSON NOT NULL,
    headers JSON,
    
    status ENUM('received', 'processing', 'processed', 'failed') DEFAULT 'received',
    error_message TEXT,
    
    retry_count INT DEFAULT 0,
    next_retry_at TIMESTAMP NULL,
    
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    
    INDEX idx_event_type (event_type),
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_status (status),
    INDEX idx_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 7. CONFIGURATION AND LOOKUP TABLES
-- =====================================================

-- Merchant Configuration
CREATE TABLE IF NOT EXISTS qr_merchant_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id VARCHAR(50) UNIQUE NOT NULL,
    
    -- Settlement Configuration
    settlement_type ENUM('T+0', 'T+1', 'T+2', 'weekly', 'manual') DEFAULT 'T+1',
    settlement_time TIME DEFAULT '09:00:00',
    min_settlement_amount DECIMAL(10, 2) DEFAULT 100.00,
    
    -- Charges Configuration
    transaction_charge_percent DECIMAL(5, 2) DEFAULT 2.00,
    transaction_charge_fixed DECIMAL(10, 2) DEFAULT 0.00,
    gst_percent DECIMAL(5, 2) DEFAULT 18.00,
    
    -- Limits
    daily_transaction_limit DECIMAL(12, 2),
    monthly_transaction_limit DECIMAL(12, 2),
    max_transaction_amount DECIMAL(10, 2),
    
    -- Notifications
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(255),
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 8. INDEXES FOR REPORTING QUERIES
-- =====================================================

-- Additional composite indexes for common queries
ALTER TABLE qr_transactions 
ADD INDEX idx_merchant_date_status (merchant_id, initiated_at, status),
ADD INDEX idx_qr_date_status (qr_code_id, initiated_at, status),
ADD INDEX idx_settlement_batch (settlement_batch_id, settlement_status);

ALTER TABLE qr_daily_stats
ADD INDEX idx_date_range_merchant (merchant_id, stat_date),
ADD INDEX idx_top_performing (stat_date, total_amount DESC);

-- =====================================================
-- 9. STORED PROCEDURES FOR REPORTING
-- =====================================================

DELIMITER $$

-- Procedure to generate daily stats
CREATE PROCEDURE generate_daily_stats(IN p_date DATE)
BEGIN
    INSERT INTO qr_daily_stats (
        merchant_id, qr_code_id, stat_date,
        total_transactions, successful_transactions, failed_transactions,
        pending_transactions, refunded_transactions,
        total_amount, successful_amount, refunded_amount,
        avg_transaction_amount, unique_customers
    )
    SELECT 
        t.merchant_id,
        t.qr_code_id,
        DATE(t.initiated_at) as stat_date,
        COUNT(*) as total_transactions,
        SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) as successful_transactions,
        SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as failed_transactions,
        SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as pending_transactions,
        SUM(CASE WHEN t.status IN ('refunded', 'partial_refunded') THEN 1 ELSE 0 END) as refunded_transactions,
        SUM(t.amount) as total_amount,
        SUM(CASE WHEN t.status = 'success' THEN t.amount ELSE 0 END) as successful_amount,
        SUM(CASE WHEN t.status IN ('refunded', 'partial_refunded') THEN COALESCE(t.refund_amount, t.amount) ELSE 0 END) as refunded_amount,
        AVG(t.amount) as avg_transaction_amount,
        COUNT(DISTINCT t.customer_vpa) as unique_customers
    FROM qr_transactions t
    WHERE DATE(t.initiated_at) = p_date
    GROUP BY t.merchant_id, t.qr_code_id, DATE(t.initiated_at)
    ON DUPLICATE KEY UPDATE
        total_transactions = VALUES(total_transactions),
        successful_transactions = VALUES(successful_transactions),
        failed_transactions = VALUES(failed_transactions),
        pending_transactions = VALUES(pending_transactions),
        refunded_transactions = VALUES(refunded_transactions),
        total_amount = VALUES(total_amount),
        successful_amount = VALUES(successful_amount),
        refunded_amount = VALUES(refunded_amount),
        avg_transaction_amount = VALUES(avg_transaction_amount),
        unique_customers = VALUES(unique_customers),
        updated_at = CURRENT_TIMESTAMP;
END$$

-- Procedure to get transaction summary
CREATE PROCEDURE get_transaction_summary(
    IN p_merchant_id VARCHAR(50),
    IN p_from_date DATE,
    IN p_to_date DATE
)
BEGIN
    SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_transactions,
        SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as successful_amount,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_transactions,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_transactions,
        SUM(CASE WHEN status IN ('refunded', 'partial_refunded') THEN 1 ELSE 0 END) as refunded_transactions,
        SUM(CASE WHEN status IN ('refunded', 'partial_refunded') THEN COALESCE(refund_amount, amount) ELSE 0 END) as refunded_amount,
        AVG(CASE WHEN status = 'success' THEN amount END) as avg_transaction_value,
        (SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as success_rate
    FROM qr_transactions
    WHERE merchant_id = p_merchant_id
    AND DATE(initiated_at) BETWEEN p_from_date AND p_to_date;
END$$

DELIMITER ;

-- =====================================================
-- 10. VIEWS FOR REPORTING
-- =====================================================

-- View for recent transactions with QR details
CREATE OR REPLACE VIEW v_recent_transactions AS
SELECT 
    t.transaction_id,
    t.amount,
    t.status,
    t.customer_vpa,
    t.customer_name,
    t.payment_method,
    t.initiated_at,
    t.completed_at,
    q.qr_identifier,
    q.reference_name as qr_name,
    q.store_location
FROM qr_transactions t
JOIN qr_codes q ON t.qr_code_id = q.id
WHERE t.initiated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY t.initiated_at DESC;

-- View for settlement summary
CREATE OR REPLACE VIEW v_settlement_summary AS
SELECT 
    s.batch_id,
    s.merchant_id,
    s.settlement_date,
    s.total_transactions,
    s.gross_amount,
    s.charges,
    s.tax,
    s.net_settlement,
    s.status,
    s.utr_number,
    s.completed_at,
    COUNT(st.id) as actual_transactions
FROM qr_settlement_batches s
LEFT JOIN qr_settlement_transactions st ON s.id = st.settlement_batch_id
GROUP BY s.id;

-- =====================================================
-- 11. TRIGGERS FOR DATA INTEGRITY
-- =====================================================

DELIMITER $$

-- Trigger to update daily stats on transaction insert
CREATE TRIGGER after_transaction_insert
AFTER INSERT ON qr_transactions
FOR EACH ROW
BEGIN
    IF NEW.status = 'success' THEN
        UPDATE qr_codes 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.qr_code_id;
    END IF;
END$$

-- Trigger to log status changes
CREATE TRIGGER before_transaction_update
BEFORE UPDATE ON qr_transactions
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO qr_transaction_audit (
            transaction_id, action, old_status, new_status, 
            changed_by, change_reason, created_at
        ) VALUES (
            NEW.transaction_id, 'STATUS_CHANGE', OLD.status, NEW.status,
            COALESCE(@current_user, 'SYSTEM'), COALESCE(@change_reason, 'Automated'),
            CURRENT_TIMESTAMP
        );
    END IF;
END$$

DELIMITER ;

-- =====================================================
-- 12. SAMPLE DATA FOR TESTING
-- =====================================================

-- Insert sample merchant config
INSERT INTO qr_merchant_config (merchant_id, settlement_type, transaction_charge_percent) 
VALUES ('MERCHANT001', 'T+1', 2.00)
ON DUPLICATE KEY UPDATE merchant_id = merchant_id;

-- =====================================================
-- 13. MAINTENANCE QUERIES
-- =====================================================

-- Query to archive old transactions (run monthly)
-- CREATE TABLE qr_transactions_archive LIKE qr_transactions;
-- INSERT INTO qr_transactions_archive SELECT * FROM qr_transactions WHERE initiated_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);
-- DELETE FROM qr_transactions WHERE initiated_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);

-- Query to cleanup old webhook events (run weekly)
-- DELETE FROM qr_webhook_events WHERE received_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND status = 'processed';

-- =====================================================
-- End of Schema
-- =====================================================