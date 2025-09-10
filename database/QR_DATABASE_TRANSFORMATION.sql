-- =====================================================
-- SABPAISA QR DATABASE TRANSFORMATION
-- Optimized Schema for QR Payment System
-- Version: 2.0
-- Date: 2025
-- =====================================================

-- =====================================================
-- PART 1: QR CODE CORE TABLES
-- =====================================================

-- Drop existing tables if needed (CAREFUL IN PRODUCTION!)
-- DROP TABLE IF EXISTS qr_codes_old;
-- RENAME TABLE qr_codes TO qr_codes_old;

-- 1.1 Enhanced QR Codes Master Table
CREATE TABLE IF NOT EXISTS qr_codes (
    -- Primary Identification
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(64) UNIQUE NOT NULL COMMENT 'Unique QR identifier',
    qr_uuid CHAR(36) GENERATED ALWAYS AS (UUID()) STORED,
    
    -- QR Types and Categories
    qr_type ENUM('STATIC', 'DYNAMIC', 'BULK', 'INVOICE', 'SUBSCRIPTION') NOT NULL DEFAULT 'DYNAMIC',
    qr_category ENUM('P2M', 'P2P', 'B2B', 'DONATION', 'BILL') DEFAULT 'P2M',
    
    -- Merchant Information
    merchant_id VARCHAR(50) NOT NULL,
    merchant_name VARCHAR(255) NOT NULL,
    merchant_category_code VARCHAR(4) COMMENT 'MCC Code',
    sub_merchant_id VARCHAR(50),
    
    -- Payment Information
    vpa VARCHAR(255) NOT NULL COMMENT 'Virtual Payment Address',
    vpa_verified BOOLEAN DEFAULT FALSE,
    amount DECIMAL(12, 2) COMMENT 'NULL for dynamic QR',
    min_amount DECIMAL(12, 2) DEFAULT 1.00,
    max_amount DECIMAL(12, 2) DEFAULT 100000.00,
    currency CHAR(3) DEFAULT 'INR',
    
    -- QR Display Information
    reference_name VARCHAR(255),
    description TEXT,
    display_name VARCHAR(100),
    short_url VARCHAR(255) UNIQUE COMMENT 'Shortened URL for QR',
    
    -- Contact Information
    mobile_number VARCHAR(15),
    mobile_verified BOOLEAN DEFAULT FALSE,
    email VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE,
    address JSON COMMENT 'Structured address data',
    
    -- QR Content
    qr_data TEXT NOT NULL COMMENT 'Actual QR code content',
    qr_image_url VARCHAR(500) COMMENT 'CDN URL for QR image',
    qr_svg TEXT COMMENT 'SVG representation',
    upi_string TEXT COMMENT 'UPI deep link string',
    
    -- Metadata and Configuration
    metadata JSON COMMENT 'Additional flexible data',
    config JSON COMMENT 'QR-specific configuration',
    tags JSON COMMENT 'Array of tags for categorization',
    
    -- Security and Validation
    signature VARCHAR(512) COMMENT 'Digital signature for QR validation',
    encryption_key_id VARCHAR(50) COMMENT 'Reference to encryption key',
    checksum VARCHAR(64) COMMENT 'Data integrity checksum',
    
    -- Lifecycle Management
    status ENUM('DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'BLOCKED', 'ARCHIVED') DEFAULT 'ACTIVE',
    activation_date TIMESTAMP NULL,
    expiry_date TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    usage_count INT UNSIGNED DEFAULT 0,
    max_usage_count INT UNSIGNED COMMENT 'NULL for unlimited',
    
    -- Batch Processing
    batch_id VARCHAR(50),
    batch_position INT UNSIGNED,
    
    -- Audit Fields
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL COMMENT 'Soft delete timestamp',
    
    -- Indexes for Performance
    INDEX idx_qr_id (qr_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_qr_type (qr_type),
    INDEX idx_batch_id (batch_id),
    INDEX idx_expiry_date (expiry_date),
    INDEX idx_created_at (created_at),
    INDEX idx_vpa (vpa),
    INDEX idx_composite_merchant_status (merchant_id, status, qr_type),
    INDEX idx_usage_tracking (last_used_at, usage_count),
    FULLTEXT idx_search (reference_name, description, display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(created_at)) (
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION pfuture VALUES LESS THAN MAXVALUE
);

-- 1.2 QR Code Templates (for bulk generation)
CREATE TABLE IF NOT EXISTS qr_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    template_id VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    merchant_id VARCHAR(50) NOT NULL,
    
    -- Template Configuration
    template_type ENUM('STANDARD', 'CUSTOM', 'BRANDED') DEFAULT 'STANDARD',
    template_config JSON NOT NULL COMMENT 'Template generation rules',
    
    -- Default Values
    default_amount DECIMAL(12, 2),
    default_description TEXT,
    default_tags JSON,
    
    -- Branding
    logo_url VARCHAR(500),
    color_scheme JSON,
    custom_fields JSON,
    
    -- Usage Tracking
    usage_count INT UNSIGNED DEFAULT 0,
    last_used_at TIMESTAMP NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_merchant_template (merchant_id, is_active),
    INDEX idx_template_id (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PART 2: QR TRANSACTION TABLES
-- =====================================================

-- 2.1 Enhanced Transactions Table
CREATE TABLE IF NOT EXISTS qr_transactions (
    -- Primary Identification
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    parent_transaction_id VARCHAR(100) COMMENT 'For refunds/reversals',
    
    -- QR Reference
    qr_id VARCHAR(64) NOT NULL,
    qr_scan_id VARCHAR(100) COMMENT 'Unique scan instance',
    
    -- Transaction Details
    merchant_txn_id VARCHAR(100),
    bank_reference_no VARCHAR(50),
    npci_txn_id VARCHAR(50) COMMENT 'NPCI Transaction ID',
    
    -- Amount Information
    amount DECIMAL(12, 2) NOT NULL,
    currency CHAR(3) DEFAULT 'INR',
    convenience_fee DECIMAL(10, 2) DEFAULT 0,
    gst_amount DECIMAL(10, 2) DEFAULT 0,
    net_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount - convenience_fee) STORED,
    
    -- Transaction Type
    transaction_type ENUM('PAYMENT', 'REFUND', 'PARTIAL_REFUND', 'REVERSAL', 'SETTLEMENT') DEFAULT 'PAYMENT',
    payment_method ENUM('UPI', 'CARD', 'NETBANKING', 'WALLET', 'BNPL') DEFAULT 'UPI',
    
    -- Payer Information
    payer_vpa VARCHAR(255),
    payer_name VARCHAR(255),
    payer_mobile VARCHAR(15),
    payer_email VARCHAR(255),
    payer_ip VARCHAR(45),
    payer_device_id VARCHAR(100),
    payer_location JSON COMMENT 'Geolocation data',
    
    -- Status Management
    status ENUM('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'REVERSED', 'REFUNDED') NOT NULL DEFAULT 'INITIATED',
    status_description TEXT,
    failure_reason VARCHAR(500),
    
    -- Timestamps
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    settled_at TIMESTAMP NULL,
    reconciled_at TIMESTAMP NULL,
    
    -- Settlement Information
    settlement_status ENUM('PENDING', 'PROCESSED', 'SETTLED', 'FAILED') DEFAULT 'PENDING',
    settlement_amount DECIMAL(12, 2),
    settlement_date DATE,
    settlement_utr VARCHAR(50) COMMENT 'Unique Transaction Reference',
    
    -- Risk and Fraud
    risk_score DECIMAL(5, 2) COMMENT 'Risk score 0-100',
    fraud_check_status ENUM('PENDING', 'PASSED', 'FAILED', 'MANUAL_REVIEW') DEFAULT 'PENDING',
    fraud_check_details JSON,
    
    -- Additional Metadata
    metadata JSON,
    gateway_response JSON,
    webhook_attempts INT DEFAULT 0,
    last_webhook_at TIMESTAMP NULL,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_qr_id (qr_id),
    INDEX idx_status (status),
    INDEX idx_merchant_txn (merchant_txn_id),
    INDEX idx_payer_vpa (payer_vpa),
    INDEX idx_settlement (settlement_status, settlement_date),
    INDEX idx_created_date (DATE(created_at)),
    INDEX idx_composite_qr_status (qr_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p_history VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION p_202501 VALUES LESS THAN (TO_DAYS('2025-02-01')),
    PARTITION p_202502 VALUES LESS THAN (TO_DAYS('2025-03-01')),
    PARTITION p_202503 VALUES LESS THAN (TO_DAYS('2025-04-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- =====================================================
-- PART 3: QR ANALYTICS AND MONITORING
-- =====================================================

-- 3.1 QR Scan Analytics
CREATE TABLE IF NOT EXISTS qr_scan_analytics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(64) NOT NULL,
    scan_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Scan Information
    scan_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scan_source ENUM('CAMERA', 'GALLERY', 'NFC', 'LINK', 'API') DEFAULT 'CAMERA',
    
    -- Device Information
    device_type ENUM('MOBILE', 'TABLET', 'DESKTOP', 'POS', 'OTHER') DEFAULT 'MOBILE',
    device_os VARCHAR(50),
    device_model VARCHAR(100),
    app_name VARCHAR(100),
    app_version VARCHAR(20),
    
    -- Location Data
    ip_address VARCHAR(45),
    country_code CHAR(2),
    state_code VARCHAR(10),
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Scan Outcome
    scan_result ENUM('SUCCESS', 'INVALID_QR', 'EXPIRED_QR', 'BLOCKED_QR', 'ERROR') DEFAULT 'SUCCESS',
    transaction_initiated BOOLEAN DEFAULT FALSE,
    transaction_id VARCHAR(100),
    
    -- Performance Metrics
    scan_duration_ms INT UNSIGNED,
    validation_duration_ms INT UNSIGNED,
    
    -- User Behavior
    user_action ENUM('PROCEEDED', 'CANCELLED', 'TIMEOUT', 'APP_CLOSED'),
    time_to_action_seconds INT UNSIGNED,
    
    INDEX idx_qr_scan (qr_id, scan_timestamp),
    INDEX idx_scan_id (scan_id),
    INDEX idx_location (country_code, state_code),
    INDEX idx_scan_date (DATE(scan_timestamp))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(scan_timestamp)) (
    PARTITION p_old VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION p_202501 VALUES LESS THAN (TO_DAYS('2025-02-01')),
    PARTITION p_202502 VALUES LESS THAN (TO_DAYS('2025-03-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- 3.2 QR Performance Metrics (Aggregated)
CREATE TABLE IF NOT EXISTS qr_performance_metrics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(64) NOT NULL,
    metric_date DATE NOT NULL,
    
    -- Scan Metrics
    total_scans INT UNSIGNED DEFAULT 0,
    unique_scans INT UNSIGNED DEFAULT 0,
    successful_scans INT UNSIGNED DEFAULT 0,
    failed_scans INT UNSIGNED DEFAULT 0,
    
    -- Transaction Metrics
    total_transactions INT UNSIGNED DEFAULT 0,
    successful_transactions INT UNSIGNED DEFAULT 0,
    failed_transactions INT UNSIGNED DEFAULT 0,
    
    -- Amount Metrics
    total_amount DECIMAL(15, 2) DEFAULT 0,
    average_amount DECIMAL(12, 2) DEFAULT 0,
    min_amount DECIMAL(12, 2),
    max_amount DECIMAL(12, 2),
    
    -- Conversion Metrics
    scan_to_transaction_rate DECIMAL(5, 2) GENERATED ALWAYS AS 
        (CASE WHEN total_scans > 0 THEN (total_transactions * 100.0 / total_scans) ELSE 0 END) STORED,
    success_rate DECIMAL(5, 2) GENERATED ALWAYS AS 
        (CASE WHEN total_transactions > 0 THEN (successful_transactions * 100.0 / total_transactions) ELSE 0 END) STORED,
    
    -- Time Metrics
    avg_transaction_time_seconds DECIMAL(10, 2),
    peak_hour TINYINT UNSIGNED,
    peak_hour_transactions INT UNSIGNED,
    
    -- Geographic Distribution
    top_cities JSON,
    top_states JSON,
    
    UNIQUE KEY uk_qr_date (qr_id, metric_date),
    INDEX idx_metric_date (metric_date),
    INDEX idx_qr_performance (qr_id, metric_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PART 4: QR LIFECYCLE MANAGEMENT
-- =====================================================

-- 4.1 QR Status History
CREATE TABLE IF NOT EXISTS qr_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(64) NOT NULL,
    
    -- Status Change
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    status_reason VARCHAR(500),
    
    -- Change Metadata
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_source ENUM('API', 'ADMIN', 'SYSTEM', 'SCHEDULED') DEFAULT 'API',
    
    -- Additional Context
    metadata JSON,
    
    INDEX idx_qr_history (qr_id, changed_at DESC),
    INDEX idx_status_change (new_status, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.2 QR Audit Log
CREATE TABLE IF NOT EXISTS qr_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qr_id VARCHAR(64),
    
    -- Audit Information
    action ENUM('CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'DEACTIVATE', 'EXPIRE', 'BLOCK', 'UNBLOCK') NOT NULL,
    action_description TEXT,
    
    -- Change Details
    old_values JSON,
    new_values JSON,
    changed_fields JSON,
    
    -- User Information
    user_id VARCHAR(100),
    user_type ENUM('MERCHANT', 'ADMIN', 'SYSTEM', 'API'),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_qr_audit (qr_id, created_at DESC),
    INDEX idx_action (action, created_at),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p_old VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION p_2025q1 VALUES LESS THAN (TO_DAYS('2025-04-01')),
    PARTITION p_2025q2 VALUES LESS THAN (TO_DAYS('2025-07-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- =====================================================
-- PART 5: QR BATCH PROCESSING
-- =====================================================

-- 5.1 Enhanced Bulk QR Batches
CREATE TABLE IF NOT EXISTS qr_bulk_batches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(50) UNIQUE NOT NULL,
    batch_name VARCHAR(255),
    
    -- Batch Configuration
    merchant_id VARCHAR(50) NOT NULL,
    template_id VARCHAR(50),
    batch_type ENUM('CSV_UPLOAD', 'API_BULK', 'SCHEDULED', 'TEMPLATE_BASED') DEFAULT 'API_BULK',
    
    -- Processing Information
    total_count INT UNSIGNED DEFAULT 0,
    processed_count INT UNSIGNED DEFAULT 0,
    successful_count INT UNSIGNED DEFAULT 0,
    failed_count INT UNSIGNED DEFAULT 0,
    pending_count INT UNSIGNED GENERATED ALWAYS AS (total_count - processed_count) STORED,
    
    -- Status Management
    status ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL') DEFAULT 'QUEUED',
    error_summary JSON,
    
    -- File Information (for uploads)
    file_name VARCHAR(255),
    file_size_bytes BIGINT UNSIGNED,
    file_url VARCHAR(500),
    
    -- Processing Metrics
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    processing_time_seconds INT UNSIGNED GENERATED ALWAYS AS 
        (CASE WHEN completed_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, started_at, completed_at) ELSE NULL END) STORED,
    
    -- Configuration
    batch_config JSON,
    validation_rules JSON,
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_batch_id (batch_id),
    INDEX idx_merchant_batch (merchant_id, status),
    INDEX idx_batch_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5.2 Batch Processing Queue
CREATE TABLE IF NOT EXISTS qr_batch_queue (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL,
    item_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Item Data
    item_data JSON NOT NULL,
    item_position INT UNSIGNED NOT NULL,
    
    -- Processing Status
    status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'SKIPPED') DEFAULT 'PENDING',
    error_message TEXT,
    retry_count TINYINT UNSIGNED DEFAULT 0,
    max_retries TINYINT UNSIGNED DEFAULT 3,
    
    -- Result
    qr_id VARCHAR(64) COMMENT 'Generated QR ID',
    processing_time_ms INT UNSIGNED,
    
    -- Timestamps
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    
    INDEX idx_batch_queue (batch_id, status),
    INDEX idx_item_id (item_id),
    INDEX idx_processing_status (status, queued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PART 6: QR NOTIFICATIONS AND WEBHOOKS
-- =====================================================

-- 6.1 QR Notification Queue
CREATE TABLE IF NOT EXISTS qr_notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    notification_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Reference
    qr_id VARCHAR(64),
    transaction_id VARCHAR(100),
    
    -- Notification Details
    notification_type ENUM('QR_CREATED', 'QR_SCANNED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'QR_EXPIRED', 'SETTLEMENT') NOT NULL,
    channel ENUM('WEBHOOK', 'EMAIL', 'SMS', 'PUSH', 'IN_APP') NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    
    -- Content
    subject VARCHAR(500),
    content TEXT,
    template_id VARCHAR(50),
    
    -- Status
    status ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED') DEFAULT 'QUEUED',
    attempts TINYINT UNSIGNED DEFAULT 0,
    max_attempts TINYINT UNSIGNED DEFAULT 3,
    
    -- Response
    response_code VARCHAR(10),
    response_message TEXT,
    
    -- Timestamps
    scheduled_at TIMESTAMP NULL,
    sent_at TIMESTAMP NULL,
    failed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_notification_status (status, scheduled_at),
    INDEX idx_qr_notifications (qr_id),
    INDEX idx_transaction_notifications (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PART 7: STORED PROCEDURES FOR QR OPERATIONS
-- =====================================================

DELIMITER $$

-- 7.1 Generate Dynamic QR Code
CREATE PROCEDURE sp_generate_dynamic_qr(
    IN p_merchant_id VARCHAR(50),
    IN p_vpa VARCHAR(255),
    IN p_amount DECIMAL(12, 2),
    IN p_description TEXT,
    IN p_expiry_minutes INT,
    OUT p_qr_id VARCHAR(64)
)
BEGIN
    DECLARE v_qr_id VARCHAR(64);
    DECLARE v_expiry_date TIMESTAMP;
    
    -- Generate unique QR ID
    SET v_qr_id = CONCAT('QR_', UUID_SHORT(), '_', UNIX_TIMESTAMP());
    
    -- Calculate expiry
    SET v_expiry_date = CASE 
        WHEN p_expiry_minutes IS NOT NULL 
        THEN DATE_ADD(NOW(), INTERVAL p_expiry_minutes MINUTE)
        ELSE NULL 
    END;
    
    -- Insert QR code
    INSERT INTO qr_codes (
        qr_id, qr_type, merchant_id, vpa, amount,
        description, status, expiry_date, qr_data
    ) VALUES (
        v_qr_id, 'DYNAMIC', p_merchant_id, p_vpa, p_amount,
        p_description, 'ACTIVE', v_expiry_date,
        CONCAT('upi://pay?pa=', p_vpa, '&am=', p_amount)
    );
    
    -- Log the creation
    INSERT INTO qr_audit_log (
        qr_id, action, action_description, user_id
    ) VALUES (
        v_qr_id, 'CREATE', 'Dynamic QR generated via SP', p_merchant_id
    );
    
    SET p_qr_id = v_qr_id;
END$$

-- 7.2 Process QR Payment
CREATE PROCEDURE sp_process_qr_payment(
    IN p_qr_id VARCHAR(64),
    IN p_transaction_id VARCHAR(100),
    IN p_amount DECIMAL(12, 2),
    IN p_payer_vpa VARCHAR(255),
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_qr_status VARCHAR(20);
    DECLARE v_qr_amount DECIMAL(12, 2);
    DECLARE v_max_usage INT;
    DECLARE v_usage_count INT;
    DECLARE v_expiry_date TIMESTAMP;
    
    -- Start transaction
    START TRANSACTION;
    
    -- Lock and get QR details
    SELECT status, amount, max_usage_count, usage_count, expiry_date
    INTO v_qr_status, v_qr_amount, v_max_usage, v_usage_count, v_expiry_date
    FROM qr_codes
    WHERE qr_id = p_qr_id
    FOR UPDATE;
    
    -- Validate QR status
    IF v_qr_status IS NULL THEN
        SET p_status = 'FAILED';
        SET p_message = 'QR code not found';
        ROLLBACK;
    ELSEIF v_qr_status != 'ACTIVE' THEN
        SET p_status = 'FAILED';
        SET p_message = CONCAT('QR code is ', v_qr_status);
        ROLLBACK;
    ELSEIF v_expiry_date IS NOT NULL AND v_expiry_date < NOW() THEN
        SET p_status = 'FAILED';
        SET p_message = 'QR code has expired';
        -- Update QR status
        UPDATE qr_codes SET status = 'EXPIRED' WHERE qr_id = p_qr_id;
        COMMIT;
    ELSEIF v_max_usage IS NOT NULL AND v_usage_count >= v_max_usage THEN
        SET p_status = 'FAILED';
        SET p_message = 'QR code usage limit exceeded';
        ROLLBACK;
    ELSEIF v_qr_amount IS NOT NULL AND v_qr_amount != p_amount THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount mismatch';
        ROLLBACK;
    ELSE
        -- Process payment
        INSERT INTO qr_transactions (
            transaction_id, qr_id, amount, payer_vpa,
            status, transaction_type
        ) VALUES (
            p_transaction_id, p_qr_id, p_amount, p_payer_vpa,
            'PENDING', 'PAYMENT'
        );
        
        -- Update QR usage
        UPDATE qr_codes 
        SET usage_count = usage_count + 1,
            last_used_at = NOW()
        WHERE qr_id = p_qr_id;
        
        -- Update scan analytics
        INSERT INTO qr_scan_analytics (
            qr_id, scan_id, transaction_initiated, transaction_id
        ) VALUES (
            p_qr_id, UUID(), TRUE, p_transaction_id
        );
        
        SET p_status = 'SUCCESS';
        SET p_message = 'Payment initiated successfully';
        COMMIT;
    END IF;
END$$

-- 7.3 Update QR Performance Metrics
CREATE PROCEDURE sp_update_qr_metrics(
    IN p_qr_id VARCHAR(64),
    IN p_date DATE
)
BEGIN
    DECLARE v_total_scans INT;
    DECLARE v_total_transactions INT;
    DECLARE v_successful_transactions INT;
    DECLARE v_total_amount DECIMAL(15, 2);
    
    -- Calculate metrics
    SELECT COUNT(*) INTO v_total_scans
    FROM qr_scan_analytics
    WHERE qr_id = p_qr_id AND DATE(scan_timestamp) = p_date;
    
    SELECT 
        COUNT(*),
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END)
    INTO v_total_transactions, v_successful_transactions, v_total_amount
    FROM qr_transactions
    WHERE qr_id = p_qr_id AND DATE(created_at) = p_date;
    
    -- Upsert metrics
    INSERT INTO qr_performance_metrics (
        qr_id, metric_date, total_scans, total_transactions,
        successful_transactions, total_amount
    ) VALUES (
        p_qr_id, p_date, v_total_scans, v_total_transactions,
        v_successful_transactions, IFNULL(v_total_amount, 0)
    ) ON DUPLICATE KEY UPDATE
        total_scans = v_total_scans,
        total_transactions = v_total_transactions,
        successful_transactions = v_successful_transactions,
        total_amount = IFNULL(v_total_amount, 0);
END$$

-- 7.4 Expire Old QR Codes
CREATE PROCEDURE sp_expire_qr_codes()
BEGIN
    DECLARE v_expired_count INT DEFAULT 0;
    
    -- Update expired QR codes
    UPDATE qr_codes
    SET status = 'EXPIRED'
    WHERE status = 'ACTIVE'
    AND expiry_date IS NOT NULL
    AND expiry_date < NOW();
    
    SET v_expired_count = ROW_COUNT();
    
    -- Log the expiration
    IF v_expired_count > 0 THEN
        INSERT INTO qr_audit_log (
            action, action_description, user_type
        ) VALUES (
            'EXPIRE', CONCAT('Expired ', v_expired_count, ' QR codes'), 'SYSTEM'
        );
    END IF;
    
    SELECT v_expired_count AS expired_qr_count;
END$$

DELIMITER ;

-- =====================================================
-- PART 8: VIEWS FOR REPORTING
-- =====================================================

-- 8.1 Active QR Codes View
CREATE OR REPLACE VIEW v_active_qr_codes AS
SELECT 
    q.qr_id,
    q.qr_type,
    q.merchant_id,
    q.merchant_name,
    q.vpa,
    q.amount,
    q.status,
    q.usage_count,
    q.max_usage_count,
    q.expiry_date,
    q.created_at,
    COALESCE(pm.total_transactions, 0) as lifetime_transactions,
    COALESCE(pm.total_amount, 0) as lifetime_amount
FROM qr_codes q
LEFT JOIN (
    SELECT qr_id, 
           SUM(total_transactions) as total_transactions,
           SUM(total_amount) as total_amount
    FROM qr_performance_metrics
    GROUP BY qr_id
) pm ON q.qr_id = pm.qr_id
WHERE q.status = 'ACTIVE'
AND (q.expiry_date IS NULL OR q.expiry_date > NOW())
AND q.deleted_at IS NULL;

-- 8.2 Transaction Summary View
CREATE OR REPLACE VIEW v_transaction_summary AS
SELECT 
    DATE(t.created_at) as transaction_date,
    q.merchant_id,
    q.merchant_name,
    COUNT(*) as transaction_count,
    SUM(CASE WHEN t.status = 'SUCCESS' THEN 1 ELSE 0 END) as successful_count,
    SUM(CASE WHEN t.status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
    SUM(CASE WHEN t.status = 'SUCCESS' THEN t.amount ELSE 0 END) as total_amount,
    AVG(CASE WHEN t.status = 'SUCCESS' THEN t.amount ELSE NULL END) as avg_amount,
    COUNT(DISTINCT t.payer_vpa) as unique_payers
FROM qr_transactions t
JOIN qr_codes q ON t.qr_id = q.qr_id
WHERE t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(t.created_at), q.merchant_id, q.merchant_name;

-- 8.3 QR Usage Analytics View
CREATE OR REPLACE VIEW v_qr_usage_analytics AS
SELECT 
    q.qr_id,
    q.qr_type,
    q.merchant_id,
    q.status,
    COUNT(DISTINCT s.scan_id) as total_scans,
    COUNT(DISTINCT t.transaction_id) as total_transactions,
    CASE 
        WHEN COUNT(DISTINCT s.scan_id) > 0 
        THEN COUNT(DISTINCT t.transaction_id) * 100.0 / COUNT(DISTINCT s.scan_id)
        ELSE 0 
    END as conversion_rate,
    MAX(s.scan_timestamp) as last_scan_time,
    MAX(t.created_at) as last_transaction_time
FROM qr_codes q
LEFT JOIN qr_scan_analytics s ON q.qr_id = s.qr_id
LEFT JOIN qr_transactions t ON q.qr_id = t.qr_id
GROUP BY q.qr_id, q.qr_type, q.merchant_id, q.status;

-- =====================================================
-- PART 9: TRIGGERS FOR DATA INTEGRITY
-- =====================================================

DELIMITER $$

-- 9.1 Update QR Status on Transaction
CREATE TRIGGER trg_update_qr_on_transaction
AFTER INSERT ON qr_transactions
FOR EACH ROW
BEGIN
    IF NEW.status = 'SUCCESS' THEN
        UPDATE qr_codes 
        SET last_used_at = NOW(),
            usage_count = usage_count + 1
        WHERE qr_id = NEW.qr_id;
    END IF;
END$$

-- 9.2 Log QR Status Changes
CREATE TRIGGER trg_log_qr_status_change
BEFORE UPDATE ON qr_codes
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO qr_status_history (
            qr_id, old_status, new_status, changed_by
        ) VALUES (
            NEW.qr_id, OLD.status, NEW.status, NEW.updated_by
        );
    END IF;
END$$

-- 9.3 Validate QR Data Before Insert
CREATE TRIGGER trg_validate_qr_before_insert
BEFORE INSERT ON qr_codes
FOR EACH ROW
BEGIN
    -- Ensure QR ID is set
    IF NEW.qr_id IS NULL OR NEW.qr_id = '' THEN
        SET NEW.qr_id = CONCAT('QR_', UUID_SHORT(), '_', UNIX_TIMESTAMP());
    END IF;
    
    -- Generate checksum
    IF NEW.checksum IS NULL THEN
        SET NEW.checksum = SHA2(CONCAT(NEW.qr_id, NEW.vpa, NEW.amount), 256);
    END IF;
    
    -- Set default expiry for dynamic QR
    IF NEW.qr_type = 'DYNAMIC' AND NEW.expiry_date IS NULL THEN
        SET NEW.expiry_date = DATE_ADD(NOW(), INTERVAL 24 HOUR);
    END IF;
END$$

DELIMITER ;

-- =====================================================
-- PART 10: INDEXES FOR OPTIMIZATION
-- =====================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_qr_merchant_date ON qr_codes(merchant_id, created_at DESC);
CREATE INDEX idx_qr_status_expiry ON qr_codes(status, expiry_date);
CREATE INDEX idx_txn_date_status ON qr_transactions(created_at, status);
CREATE INDEX idx_txn_settlement ON qr_transactions(settlement_status, settlement_date);
CREATE INDEX idx_scan_qr_date ON qr_scan_analytics(qr_id, scan_timestamp DESC);

-- =====================================================
-- PART 11: EVENTS FOR SCHEDULED TASKS
-- =====================================================

-- Enable event scheduler
SET GLOBAL event_scheduler = ON;

-- 11.1 Expire QR Codes Daily
CREATE EVENT IF NOT EXISTS event_expire_qr_codes
ON SCHEDULE EVERY 1 HOUR
DO CALL sp_expire_qr_codes();

-- 11.2 Update Performance Metrics Daily
CREATE EVENT IF NOT EXISTS event_update_metrics
ON SCHEDULE EVERY 1 DAY
STARTS CONCAT(CURDATE() + INTERVAL 1 DAY, ' 02:00:00')
DO
BEGIN
    INSERT INTO qr_performance_metrics (qr_id, metric_date, total_scans, total_transactions, successful_transactions, total_amount)
    SELECT 
        q.qr_id,
        CURDATE() - INTERVAL 1 DAY,
        COUNT(DISTINCT s.scan_id),
        COUNT(DISTINCT t.transaction_id),
        COUNT(DISTINCT CASE WHEN t.status = 'SUCCESS' THEN t.transaction_id END),
        COALESCE(SUM(CASE WHEN t.status = 'SUCCESS' THEN t.amount END), 0)
    FROM qr_codes q
    LEFT JOIN qr_scan_analytics s ON q.qr_id = s.qr_id 
        AND DATE(s.scan_timestamp) = CURDATE() - INTERVAL 1 DAY
    LEFT JOIN qr_transactions t ON q.qr_id = t.qr_id 
        AND DATE(t.created_at) = CURDATE() - INTERVAL 1 DAY
    WHERE q.status = 'ACTIVE'
    GROUP BY q.qr_id
    ON DUPLICATE KEY UPDATE
        total_scans = VALUES(total_scans),
        total_transactions = VALUES(total_transactions),
        successful_transactions = VALUES(successful_transactions),
        total_amount = VALUES(total_amount);
END;

-- 11.3 Archive Old Data Monthly
CREATE EVENT IF NOT EXISTS event_archive_old_data
ON SCHEDULE EVERY 1 MONTH
STARTS CONCAT(DATE_FORMAT(NOW(), '%Y-%m-01'), ' 03:00:00')
DO
BEGIN
    -- Archive transactions older than 6 months
    INSERT INTO qr_transactions_archive
    SELECT * FROM qr_transactions
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);
    
    DELETE FROM qr_transactions
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);
    
    -- Archive scan analytics older than 3 months
    INSERT INTO qr_scan_analytics_archive
    SELECT * FROM qr_scan_analytics
    WHERE scan_timestamp < DATE_SUB(NOW(), INTERVAL 3 MONTH);
    
    DELETE FROM qr_scan_analytics
    WHERE scan_timestamp < DATE_SUB(NOW(), INTERVAL 3 MONTH);
END;

-- =====================================================
-- PART 12: MIGRATION SCRIPT FROM OLD SCHEMA
-- =====================================================

-- Migration procedure (RUN ONLY ONCE)
DELIMITER $$

CREATE PROCEDURE sp_migrate_from_old_schema()
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT 'Migration failed. Transaction rolled back.' as error_message;
    END;
    
    START TRANSACTION;
    
    -- Check if old table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = DATABASE() 
               AND table_name = 'qr_codes_old') THEN
        
        -- Migrate QR codes
        INSERT INTO qr_codes (
            qr_id, merchant_id, merchant_name, vpa, amount,
            status, created_at, updated_at
        )
        SELECT 
            qr_id, merchant_id, merchant_name, vpa, amount,
            status, created_at, updated_at
        FROM qr_codes_old
        ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at);
        
        -- Migrate transactions if old table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = DATABASE() 
                   AND table_name = 'transactions') THEN
            
            INSERT INTO qr_transactions (
                transaction_id, qr_id, amount, status,
                payer_vpa, created_at
            )
            SELECT 
                transaction_id, qr_id, amount, status,
                payer_vpa, created_at
            FROM transactions
            ON DUPLICATE KEY UPDATE updated_at = NOW();
        END IF;
        
        SELECT 'Migration completed successfully' as message;
    ELSE
        SELECT 'No old schema found. Skipping migration.' as message;
    END IF;
    
    COMMIT;
END$$

DELIMITER ;

-- =====================================================
-- PART 13: GRANTS FOR APPLICATION USER
-- =====================================================

-- Create application user with limited privileges
-- CREATE USER IF NOT EXISTS 'sabpaisa_qr_app'@'%' IDENTIFIED BY 'StrongPassword123!';

-- Grant necessary privileges
-- GRANT SELECT, INSERT, UPDATE ON sabpaisa_qr.qr_codes TO 'sabpaisa_qr_app'@'%';
-- GRANT SELECT, INSERT, UPDATE ON sabpaisa_qr.qr_transactions TO 'sabpaisa_qr_app'@'%';
-- GRANT SELECT, INSERT ON sabpaisa_qr.qr_scan_analytics TO 'sabpaisa_qr_app'@'%';
-- GRANT SELECT, INSERT ON sabpaisa_qr.qr_audit_log TO 'sabpaisa_qr_app'@'%';
-- GRANT SELECT ON sabpaisa_qr.v_* TO 'sabpaisa_qr_app'@'%';
-- GRANT EXECUTE ON PROCEDURE sabpaisa_qr.sp_generate_dynamic_qr TO 'sabpaisa_qr_app'@'%';
-- GRANT EXECUTE ON PROCEDURE sabpaisa_qr.sp_process_qr_payment TO 'sabpaisa_qr_app'@'%';

-- =====================================================
-- END OF QR DATABASE TRANSFORMATION
-- =====================================================