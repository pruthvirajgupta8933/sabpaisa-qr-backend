const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const redis = require('../config/redis');

class VPAService {
    constructor() {
        this.VPA_DOMAIN = '@okhdfcbank';
        this.VPA_PREFIX = 'sabpaisa.';
        this.IDENTIFIER_LENGTH = 5;
        this.IDENTIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        this.MAX_RETRIES = 10;
        this.POOL_SIZE = 1000; // Pre-generate this many identifiers
        this.POOL_MIN_THRESHOLD = 100; // Refill when pool drops below this
    }

    /**
     * Initialize VPA pool on service start
     */
    async initializeVPAPool() {
        try {
            const unusedCount = await this.getUnusedIdentifierCount();
            
            if (unusedCount < this.POOL_MIN_THRESHOLD) {
                logger.info(`VPA pool low (${unusedCount}), generating new identifiers...`);
                await this.refillVPAPool();
            }
        } catch (error) {
            logger.error('Error initializing VPA pool:', error);
        }
    }

    /**
     * Generate a unique 5-character alphanumeric identifier
     */
    async generateUniqueIdentifier() {
        let attempts = 0;
        let identifier = null;

        // Try to get from pre-generated pool first
        identifier = await this.getFromPool();
        if (identifier) {
            return identifier;
        }

        // Fallback to real-time generation
        while (attempts < this.MAX_RETRIES) {
            identifier = this.generateRandomIdentifier();
            
            // Check uniqueness with distributed lock for concurrent requests
            const lockKey = `vpa_lock:${identifier}`;
            const locked = await this.acquireLock(lockKey, 5000); // 5 second lock
            
            if (locked) {
                try {
                    const exists = await this.checkIdentifierExists(identifier);
                    
                    if (!exists) {
                        // Reserve the identifier in database
                        await this.reserveIdentifier(identifier);
                        await this.releaseLock(lockKey);
                        return identifier;
                    }
                } finally {
                    await this.releaseLock(lockKey);
                }
            }
            
            attempts++;
        }

        // If still no identifier, try sequential generation
        return await this.generateSequentialIdentifier();
    }

    /**
     * Generate a random identifier
     */
    generateRandomIdentifier() {
        let identifier = '';
        for (let i = 0; i < this.IDENTIFIER_LENGTH; i++) {
            identifier += this.IDENTIFIER_CHARS.charAt(
                Math.floor(Math.random() * this.IDENTIFIER_CHARS.length)
            );
        }
        return identifier;
    }

    /**
     * Generate sequential identifier as fallback
     */
    async generateSequentialIdentifier() {
        const query = `
            SELECT identifier FROM vpa_pool 
            WHERE is_used = false 
            ORDER BY created_at ASC 
            LIMIT 1 
            FOR UPDATE SKIP LOCKED
        `;
        
        const result = await db.query(query);
        
        if (result.rows.length > 0) {
            const identifier = result.rows[0].identifier;
            await this.markAsUsed(identifier);
            return identifier;
        }
        
        throw new Error('Unable to generate unique identifier');
    }

    /**
     * Get identifier from pre-generated pool
     */
    async getFromPool() {
        const query = `
            UPDATE vpa_pool 
            SET is_used = true, used_at = NOW()
            WHERE identifier = (
                SELECT identifier FROM vpa_pool 
                WHERE is_used = false 
                LIMIT 1 
                FOR UPDATE SKIP LOCKED
            )
            RETURNING identifier
        `;
        
        const result = await db.query(query);
        
        if (result.rows.length > 0) {
            // Trigger pool refill if needed
            this.checkAndRefillPool();
            return result.rows[0].identifier;
        }
        
        return null;
    }

    /**
     * Refill the VPA pool with new identifiers
     */
    async refillVPAPool() {
        const identifiers = new Set();
        const batchSize = 100;
        
        // Generate unique identifiers
        while (identifiers.size < this.POOL_SIZE) {
            const identifier = this.generateRandomIdentifier();
            identifiers.add(identifier);
        }
        
        // Check which ones already exist
        const existingIdentifiers = await this.checkBulkIdentifiers(Array.from(identifiers));
        const newIdentifiers = Array.from(identifiers).filter(id => !existingIdentifiers.includes(id));
        
        // Insert in batches
        for (let i = 0; i < newIdentifiers.length; i += batchSize) {
            const batch = newIdentifiers.slice(i, i + batchSize);
            await this.insertIdentifierBatch(batch);
        }
        
        logger.info(`Added ${newIdentifiers.length} new identifiers to VPA pool`);
    }

    /**
     * Check and refill pool if needed (async, non-blocking)
     */
    async checkAndRefillPool() {
        setImmediate(async () => {
            try {
                const count = await this.getUnusedIdentifierCount();
                if (count < this.POOL_MIN_THRESHOLD) {
                    await this.refillVPAPool();
                }
            } catch (error) {
                logger.error('Error checking/refilling VPA pool:', error);
            }
        });
    }

    /**
     * Check if identifier exists in database
     */
    async checkIdentifierExists(identifier) {
        // Check in QR codes table
        const qrQuery = 'SELECT 1 FROM qr_codes WHERE qr_identifier = $1 LIMIT 1';
        const qrResult = await db.query(qrQuery, [identifier]);
        
        if (qrResult.rows.length > 0) {
            return true;
        }
        
        // Check in VPA pool (used identifiers)
        const poolQuery = 'SELECT 1 FROM vpa_pool WHERE identifier = $1 AND is_used = true LIMIT 1';
        const poolResult = await db.query(poolQuery, [identifier]);
        
        return poolResult.rows.length > 0;
    }

    /**
     * Check multiple identifiers in bulk
     */
    async checkBulkIdentifiers(identifiers) {
        const query = `
            SELECT identifier FROM (
                SELECT qr_identifier as identifier FROM qr_codes WHERE qr_identifier = ANY($1)
                UNION
                SELECT identifier FROM vpa_pool WHERE identifier = ANY($1) AND is_used = true
            ) as existing
        `;
        
        const result = await db.query(query, [identifiers]);
        return result.rows.map(row => row.identifier);
    }

    /**
     * Insert batch of identifiers into pool
     */
    async insertIdentifierBatch(identifiers) {
        const values = identifiers.map(id => `('${id}')`).join(',');
        const query = `
            INSERT INTO vpa_pool (identifier) 
            VALUES ${values} 
            ON CONFLICT (identifier) DO NOTHING
        `;
        
        await db.query(query);
    }

    /**
     * Reserve an identifier
     */
    async reserveIdentifier(identifier) {
        const query = `
            INSERT INTO vpa_pool (identifier, is_used, used_at) 
            VALUES ($1, true, NOW()) 
            ON CONFLICT (identifier) 
            DO UPDATE SET is_used = true, used_at = NOW()
        `;
        
        await db.query(query, [identifier]);
    }

    /**
     * Mark identifier as used
     */
    async markAsUsed(identifier, merchantId = null) {
        const query = `
            UPDATE vpa_pool 
            SET is_used = true, used_at = NOW(), used_by_merchant_id = $2
            WHERE identifier = $1
        `;
        
        await db.query(query, [identifier, merchantId]);
    }

    /**
     * Get count of unused identifiers in pool
     */
    async getUnusedIdentifierCount() {
        const query = 'SELECT COUNT(*) as count FROM vpa_pool WHERE is_used = false';
        const result = await db.query(query);
        return parseInt(result.rows[0].count);
    }

    /**
     * Format complete VPA string
     */
    formatVPA(identifier) {
        return `${this.VPA_PREFIX}${identifier}${this.VPA_DOMAIN}`;
    }

    /**
     * Validate VPA format
     */
    validateVPAFormat(vpa) {
        const regex = new RegExp(`^${this.VPA_PREFIX}[A-Z0-9]{${this.IDENTIFIER_LENGTH}}${this.VPA_DOMAIN}$`);
        return regex.test(vpa);
    }

    /**
     * Extract identifier from VPA
     */
    extractIdentifier(vpa) {
        if (!this.validateVPAFormat(vpa)) {
            throw new Error('Invalid VPA format');
        }
        
        const start = this.VPA_PREFIX.length;
        const end = start + this.IDENTIFIER_LENGTH;
        return vpa.substring(start, end);
    }

    /**
     * Generate UPI payment string
     */
    generateUPIString(params) {
        const { vpa, merchantName, amount, description } = params;
        
        let upiString = `upi://pay?pa=${vpa}`;
        
        if (merchantName) {
            upiString += `&pn=${encodeURIComponent(merchantName)}`;
        }
        
        if (amount && amount > 0) {
            upiString += `&am=${amount}`;
        }
        
        if (description) {
            upiString += `&tn=${encodeURIComponent(description)}`;
        }
        
        // Add merchant code for tracking
        upiString += `&mc=5411`; // Merchant category code
        
        return upiString;
    }

    /**
     * Generate alternative identifiers for suggestions
     */
    async generateAlternatives(baseIdentifier, count = 5) {
        const alternatives = [];
        const chars = baseIdentifier.split('');
        
        // Strategy 1: Change last character
        for (let i = 0; i < this.IDENTIFIER_CHARS.length && alternatives.length < count; i++) {
            const newIdentifier = chars.slice(0, -1).join('') + this.IDENTIFIER_CHARS[i];
            const exists = await this.checkIdentifierExists(newIdentifier);
            if (!exists && newIdentifier !== baseIdentifier) {
                alternatives.push(newIdentifier);
            }
        }
        
        // Strategy 2: Add random suffix
        while (alternatives.length < count) {
            const newIdentifier = this.generateRandomIdentifier();
            const exists = await this.checkIdentifierExists(newIdentifier);
            if (!exists) {
                alternatives.push(newIdentifier);
            }
        }
        
        return alternatives.slice(0, count);
    }

    /**
     * Distributed lock implementation using Redis
     */
    async acquireLock(key, ttl = 5000) {
        if (!redis.client) {
            // Fallback if Redis is not available
            return true;
        }
        
        const lockValue = crypto.randomBytes(16).toString('hex');
        const result = await redis.client.set(
            key,
            lockValue,
            'PX',
            ttl,
            'NX'
        );
        
        if (result === 'OK') {
            // Store lock value for safe release
            this[`lock_${key}`] = lockValue;
            return true;
        }
        
        return false;
    }

    /**
     * Release distributed lock
     */
    async releaseLock(key) {
        if (!redis.client || !this[`lock_${key}`]) {
            return;
        }
        
        const lockValue = this[`lock_${key}`];
        
        // Lua script for atomic check and delete
        const luaScript = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        
        await redis.client.eval(luaScript, 1, key, lockValue);
        delete this[`lock_${key}`];
    }

    /**
     * Validate identifier format
     */
    validateIdentifierFormat(identifier) {
        if (!identifier || identifier.length !== this.IDENTIFIER_LENGTH) {
            return false;
        }
        
        const regex = new RegExp(`^[${this.IDENTIFIER_CHARS}]{${this.IDENTIFIER_LENGTH}}$`);
        return regex.test(identifier);
    }

    /**
     * Get VPA by QR code ID
     */
    async getVPAByQRId(qrId) {
        const query = 'SELECT full_vpa FROM qr_codes WHERE id = $1';
        const result = await db.query(query, [qrId]);
        
        if (result.rows.length > 0) {
            return result.rows[0].full_vpa;
        }
        
        return null;
    }

    /**
     * Get QR details by VPA
     */
    async getQRByVPA(vpa) {
        const query = 'SELECT * FROM qr_codes WHERE full_vpa = $1 AND status = $2';
        const result = await db.query(query, [vpa, 'active']);
        
        if (result.rows.length > 0) {
            return result.rows[0];
        }
        
        return null;
    }
}

// Create singleton instance
const vpaService = new VPAService();

// Initialize pool on startup
vpaService.initializeVPAPool().catch(error => {
    logger.error('Failed to initialize VPA pool:', error);
});

module.exports = vpaService;