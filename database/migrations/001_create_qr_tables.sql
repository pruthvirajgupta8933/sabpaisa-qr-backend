-- SabQR Database Schema
-- Migration: 001_create_qr_tables.sql
-- Description: Creates tables for QR code management system with payment tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. QR Codes Table
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL,
    qr_identifier VARCHAR(5) NOT NULL UNIQUE,
    full_vpa VARCHAR(255) NOT NULL UNIQUE,
    reference_name VARCHAR(100) NOT NULL,
    description TEXT,
    max_amount_per_transaction DECIMAL(10,2),
    category VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
    design_config JSONB DEFAULT '{}',
    qr_image_url VARCHAR(500),
    qr_string TEXT NOT NULL,
    customer_info JSONB DEFAULT '{}',
    notes TEXT,
    total_collections DECIMAL(15,2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    last_payment_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_by UUID NOT NULL,
    updated_by UUID,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_qr_merchant_status ON qr_codes(merchant_id, status);
CREATE INDEX idx_qr_identifier ON qr_codes(qr_identifier);
CREATE INDEX idx_full_vpa ON qr_codes(full_vpa);
CREATE INDEX idx_qr_created_at ON qr_codes(created_at DESC);
CREATE INDEX idx_qr_category ON qr_codes(category);
CREATE INDEX idx_qr_merchant_active ON qr_codes(merchant_id) WHERE status = 'active';

-- =====================================================
-- 2. QR Payments Table
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL,
    payment_id VARCHAR(100) NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    payment_method VARCHAR(50) NOT NULL,
    utr_number VARCHAR(100),
    customer_vpa VARCHAR(255),
    customer_info JSONB DEFAULT '{}',
    webhook_data JSONB DEFAULT '{}',
    remarks TEXT,
    refund_amount DECIMAL(10,2) DEFAULT 0,
    refund_status VARCHAR(20),
    refund_date TIMESTAMP,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_payment_qr_code ON qr_payments(qr_code_id);
CREATE INDEX idx_payment_merchant ON qr_payments(merchant_id);
CREATE INDEX idx_payment_status ON qr_payments(status);
CREATE INDEX idx_payment_created_at ON qr_payments(created_at DESC);
CREATE INDEX idx_payment_utr ON qr_payments(utr_number);
CREATE INDEX idx_payment_date_range ON qr_payments(created_at, merchant_id);

-- =====================================================
-- 3. QR Bulk Jobs Table
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_bulk_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('create', 'update', 'export', 'delete')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    successful_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    file_url VARCHAR(500),
    result_file_url VARCHAR(500),
    error_log JSONB DEFAULT '[]',
    progress_percentage INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_bulk_merchant ON qr_bulk_jobs(merchant_id);
CREATE INDEX idx_bulk_status ON qr_bulk_jobs(status);
CREATE INDEX idx_bulk_created_at ON qr_bulk_jobs(created_at DESC);

-- =====================================================
-- 4. QR Design Templates Table
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_design_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('classic', 'professional', 'minimal', 'branded', 'custom')),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    template_config JSONB NOT NULL,
    preview_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default templates
INSERT INTO qr_design_templates (name, description, template_type, is_default, template_config) VALUES
('Classic', 'Clean and professional layout', 'classic', TRUE, '{"background": "#ffffff", "foreground": "#000000", "logo_position": "center", "border_style": "solid"}'),
('Professional', 'Modern design with gradients', 'professional', FALSE, '{"background": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", "foreground": "#ffffff", "logo_position": "top", "border_style": "rounded"}'),
('Minimal', 'Simple and focused design', 'minimal', FALSE, '{"background": "#f8f9fa", "foreground": "#212529", "logo_position": "none", "border_style": "none"}'),
('Branded', 'Full merchant branding', 'branded', FALSE, '{"background": "custom", "foreground": "custom", "logo_position": "center", "border_style": "custom"}');

-- =====================================================
-- 5. QR Analytics Table (for performance tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_scans INTEGER DEFAULT 0,
    unique_scans INTEGER DEFAULT 0,
    successful_payments INTEGER DEFAULT 0,
    failed_payments INTEGER DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    average_amount DECIMAL(10,2) DEFAULT 0,
    peak_hour INTEGER,
    device_types JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(qr_code_id, date)
);

-- Indexes
CREATE INDEX idx_analytics_qr ON qr_analytics(qr_code_id);
CREATE INDEX idx_analytics_date ON qr_analytics(date DESC);

-- =====================================================
-- 6. QR Audit Log Table
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_entity ON qr_audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON qr_audit_logs(user_id);
CREATE INDEX idx_audit_created ON qr_audit_logs(created_at DESC);

-- =====================================================
-- 7. VPA Pool Table (for pre-generated identifiers)
-- =====================================================
CREATE TABLE IF NOT EXISTS vpa_pool (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(5) NOT NULL UNIQUE,
    is_used BOOLEAN DEFAULT FALSE,
    used_by_merchant_id UUID,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_vpa_pool_unused ON vpa_pool(is_used) WHERE is_used = FALSE;
CREATE INDEX idx_vpa_identifier ON vpa_pool(identifier);

-- =====================================================
-- Functions and Triggers
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for qr_codes
CREATE TRIGGER update_qr_codes_updated_at BEFORE UPDATE ON qr_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for qr_design_templates
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON qr_design_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update QR statistics after payment
CREATE OR REPLACE FUNCTION update_qr_payment_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'success' AND (OLD IS NULL OR OLD.status != 'success') THEN
        UPDATE qr_codes 
        SET 
            total_collections = total_collections + NEW.amount,
            transaction_count = transaction_count + 1,
            last_payment_at = NEW.processed_at
        WHERE id = NEW.qr_code_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment stats
CREATE TRIGGER update_qr_stats_on_payment 
    AFTER INSERT OR UPDATE ON qr_payments
    FOR EACH ROW EXECUTE FUNCTION update_qr_payment_stats();

-- Function to log audit entries
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO qr_audit_logs (entity_type, entity_id, action, old_values, new_values, user_id)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        to_jsonb(OLD),
        to_jsonb(NEW),
        COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit triggers for important tables
CREATE TRIGGER audit_qr_codes 
    AFTER INSERT OR UPDATE OR DELETE ON qr_codes
    FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- =====================================================
-- Views for reporting
-- =====================================================

-- Active QR codes summary view
CREATE VIEW v_active_qr_summary AS
SELECT 
    q.merchant_id,
    COUNT(*) as total_qr_codes,
    COUNT(*) FILTER (WHERE q.status = 'active') as active_codes,
    SUM(q.total_collections) as total_collections,
    SUM(q.transaction_count) as total_transactions,
    AVG(q.total_collections / NULLIF(q.transaction_count, 0)) as avg_transaction_value
FROM qr_codes q
WHERE q.deleted_at IS NULL
GROUP BY q.merchant_id;

-- Daily payment summary view
CREATE VIEW v_daily_payment_summary AS
SELECT 
    DATE(p.created_at) as payment_date,
    p.merchant_id,
    COUNT(*) as transaction_count,
    SUM(p.amount) as total_amount,
    COUNT(*) FILTER (WHERE p.status = 'success') as successful_transactions,
    COUNT(*) FILTER (WHERE p.status = 'failed') as failed_transactions
FROM qr_payments p
GROUP BY DATE(p.created_at), p.merchant_id;

-- =====================================================
-- Indexes for text search
-- =====================================================
CREATE INDEX idx_qr_search ON qr_codes USING gin(
    to_tsvector('english', 
        COALESCE(reference_name, '') || ' ' || 
        COALESCE(description, '') || ' ' || 
        COALESCE(qr_identifier, '')
    )
);

-- =====================================================
-- Grant permissions (adjust as needed)
-- =====================================================
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO api_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO api_user;