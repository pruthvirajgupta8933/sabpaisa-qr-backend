/**
 * Security utilities for input validation and sanitization
 * Prevents XSS, SQL injection, and validates data formats
 */

// HTML/XSS sanitization - removes dangerous characters and tags
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    // Remove HTML tags and script content
    let sanitized = input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/[<>\"']/g, (match) => {
            const replacements = {
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;'
            };
            return replacements[match];
        });
    
    // Remove SQL injection patterns
    sanitized = sanitizeSQLInput(sanitized);
    
    return sanitized.trim();
};

// SQL injection prevention
const sanitizeSQLInput = (input) => {
    if (typeof input !== 'string') return input;
    
    // Remove common SQL injection patterns
    const sqlPatterns = [
        /(\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC|EXECUTE)\b)/gi,
        /(--|\||;|\/\*|\*\/|xp_|sp_|0x)/gi,
        /(\bUNION\b.*\bSELECT\b)/gi,
        /(\bOR\b.*\b=\b.*\bOR\b)/gi,
        /('.*\bOR\b.*')/gi
    ];
    
    let sanitized = input;
    sqlPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
    });
    
    return sanitized;
};

// Email validation
const validateEmail = (email) => {
    if (!email) return false;
    
    // RFC 5322 compliant email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    // Additional checks
    if (email.length > 254) return false; // Max email length
    if (email.includes('..')) return false; // No consecutive dots
    if (email.startsWith('.') || email.endsWith('.')) return false;
    
    return emailRegex.test(email);
};

// Mobile number validation (Indian format - 10 digits)
const validateMobile = (mobile) => {
    if (!mobile) return false;
    
    // Remove all non-numeric characters
    const cleaned = String(mobile).replace(/\D/g, '');
    
    // Check if it's exactly 10 digits
    if (cleaned.length !== 10) return false;
    
    // Check if it starts with valid Indian mobile prefixes (6-9)
    if (!['6', '7', '8', '9'].includes(cleaned[0])) return false;
    
    return true;
};

// Amount validation
const validateAmount = (amount) => {
    if (!amount && amount !== 0) return true; // Amount is optional
    
    const numAmount = parseFloat(amount);
    
    // Check if it's a valid number
    if (isNaN(numAmount)) return false;
    
    // Check if positive
    if (numAmount < 0) return false;
    
    // Check max amount (10 million)
    if (numAmount > 10000000) return false;
    
    // Check decimal places (max 2)
    const decimalPlaces = (String(amount).split('.')[1] || '').length;
    if (decimalPlaces > 2) return false;
    
    return true;
};

// Merchant ID validation
const validateMerchantId = (merchantId) => {
    if (!merchantId) return false;
    
    // Allow only alphanumeric and underscore
    const merchantIdRegex = /^[A-Z0-9_]{3,20}$/;
    
    return merchantIdRegex.test(merchantId);
};

// Sanitize all fields in merchant data
const sanitizeMerchantData = (merchant) => {
    const sanitized = {};
    
    // Sanitize text fields  
    const textFields = ['merchant_name', 'reference_name', 'description', 'address'];
    textFields.forEach(field => {
        if (merchant[field]) {
            sanitized[field] = sanitizeInput(merchant[field]);
        }
    });
    
    // Keep merchant_id uppercase and validate - sanitize but keep valid format
    if (merchant.merchant_id) {
        // First sanitize any dangerous patterns
        let cleanId = sanitizeInput(merchant.merchant_id);
        // Then apply merchant ID format rules
        sanitized.merchant_id = cleanId.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    }
    
    // Validate and clean email
    if (merchant.email) {
        const email = merchant.email.toLowerCase().trim();
        if (validateEmail(email)) {
            sanitized.email = email;
        } else {
            throw new Error(`Invalid email format: ${merchant.email}`);
        }
    }
    
    // Validate and clean mobile
    if (merchant.mobile_number) {
        const mobile = String(merchant.mobile_number).replace(/\D/g, '');
        if (validateMobile(mobile)) {
            sanitized.mobile_number = mobile;
        } else {
            throw new Error(`Invalid mobile number: ${merchant.mobile_number}`);
        }
    }
    
    // Validate amount - must be positive and max 2 decimal places
    if (merchant.amount !== undefined && merchant.amount !== null && merchant.amount !== '') {
        const numAmount = parseFloat(merchant.amount);
        if (!validateAmount(numAmount)) {
            throw new Error(`Invalid amount: ${merchant.amount}`);
        }
        sanitized.amount = numAmount.toFixed(2);
    }
    
    // Copy vpa_handle if present
    if (merchant.vpa_handle) {
        sanitized.vpa_handle = merchant.vpa_handle.toLowerCase().replace(/[^a-z]/g, '');
    }
    
    return sanitized;
};

// Validate required fields
const validateRequiredFields = (merchant) => {
    const required = ['merchant_name', 'merchant_id', 'reference_name'];
    const missing = [];
    
    required.forEach(field => {
        if (!merchant[field] || merchant[field].trim() === '') {
            missing.push(field);
        }
    });
    
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    return true;
};

// Main validation function for a single merchant
const validateAndSanitizeMerchant = (merchant) => {
    try {
        // First validate required fields
        validateRequiredFields(merchant);
        
        // Then sanitize all data
        const sanitized = sanitizeMerchantData(merchant);
        
        // Additional validation for merchant ID
        if (!validateMerchantId(sanitized.merchant_id)) {
            throw new Error(`Invalid merchant ID format: ${merchant.merchant_id}. Use 3-20 uppercase alphanumeric characters.`);
        }
        
        return { success: true, data: sanitized };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Batch validation for multiple merchants
const validateAndSanitizeBatch = (merchants) => {
    const results = {
        valid: [],
        invalid: []
    };
    
    merchants.forEach((merchant, index) => {
        const result = validateAndSanitizeMerchant(merchant);
        if (result.success) {
            results.valid.push(result.data);
        } else {
            results.invalid.push({
                index: index + 1,
                merchant_id: merchant.merchant_id || 'UNKNOWN',
                error: result.error
            });
        }
    });
    
    return results;
};

module.exports = {
    sanitizeInput,
    sanitizeSQLInput,
    validateEmail,
    validateMobile,
    validateAmount,
    validateMerchantId,
    sanitizeMerchantData,
    validateRequiredFields,
    validateAndSanitizeMerchant,
    validateAndSanitizeBatch
};