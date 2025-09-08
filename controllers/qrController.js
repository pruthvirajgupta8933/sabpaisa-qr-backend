const { v4: uuidv4 } = require('uuid');
const QRService = require('../services/qrService');
const VPAService = require('../services/vpaService');
const QRImageService = require('../services/qrImageService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/responseHandler');

class QRController {
    /**
     * Create a new QR code with unique VPA
     */
    async createQR(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return errorResponse(res, 'Validation failed', 400, errors.array());
            }

            const merchantId = req.user.merchantId;
            const userId = req.user.id;
            const data = req.body;

            // Check QR limit for merchant
            const qrCount = await QRService.getActiveQRCount(merchantId);
            if (qrCount >= process.env.MAX_QR_PER_MERCHANT || 100) {
                return errorResponse(res, 'Maximum QR limit reached', 400, { code: 'QR_004' });
            }

            // Generate unique identifier and VPA
            const qrIdentifier = await VPAService.generateUniqueIdentifier();
            const fullVPA = VPAService.formatVPA(qrIdentifier);

            // Validate VPA uniqueness
            const vpaExists = await QRService.checkVPAExists(fullVPA);
            if (vpaExists) {
                return errorResponse(res, 'VPA generation failed. Please try again.', 500, { code: 'QR_002' });
            }

            // Generate QR string
            const qrString = VPAService.generateUPIString({
                vpa: fullVPA,
                merchantName: data.reference_name,
                amount: data.max_amount_per_transaction,
                description: data.description
            });

            // Create QR code record
            const qrCode = await QRService.createQR({
                id: uuidv4(),
                merchant_id: merchantId,
                qr_identifier: qrIdentifier,
                full_vpa: fullVPA,
                reference_name: data.reference_name,
                description: data.description,
                max_amount_per_transaction: data.max_amount_per_transaction,
                category: data.category || 'general',
                design_config: data.design_config || {},
                customer_info: data.customer_info || {},
                notes: data.notes,
                qr_string: qrString,
                created_by: userId,
                status: 'active'
            });

            // Generate QR image
            const imageUrl = await QRImageService.generateAndUploadQR({
                qrString,
                qrIdentifier,
                designConfig: data.design_config,
                merchantId
            });

            // Update QR with image URL
            await QRService.updateQR(qrCode.id, { qr_image_url: imageUrl });

            // Log audit
            await QRService.logAudit({
                entity_type: 'qr_codes',
                entity_id: qrCode.id,
                action: 'CREATE',
                user_id: userId,
                new_values: qrCode
            });

            return successResponse(res, 'QR code created successfully', {
                ...qrCode,
                qr_image_url: imageUrl
            });

        } catch (error) {
            logger.error('Error creating QR code:', error);
            return errorResponse(res, 'Failed to create QR code', 500);
        }
    }

    /**
     * Get list of QR codes with filters and pagination
     */
    async getQRList(req, res) {
        try {
            const merchantId = req.user.merchantId;
            const {
                page = 1,
                limit = 10,
                status = 'all',
                search,
                category,
                from_date,
                to_date,
                sort_by = 'created_at',
                sort_order = 'desc'
            } = req.query;

            const filters = {
                merchant_id: merchantId,
                status: status !== 'all' ? status : undefined,
                search,
                category,
                from_date,
                to_date
            };

            const result = await QRService.getQRList({
                filters,
                page: parseInt(page),
                limit: parseInt(limit),
                sortBy: sort_by,
                sortOrder: sort_order
            });

            // Get summary statistics
            const summary = await QRService.getQRSummary(merchantId);

            return successResponse(res, 'QR codes fetched successfully', {
                qr_codes: result.data,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(result.total / limit),
                    total_items: result.total,
                    items_per_page: parseInt(limit)
                },
                summary
            });

        } catch (error) {
            logger.error('Error fetching QR list:', error);
            return errorResponse(res, 'Failed to fetch QR codes', 500);
        }
    }

    /**
     * Get detailed information about a specific QR code
     */
    async getQRDetails(req, res) {
        try {
            const { id } = req.params;
            const merchantId = req.user.merchantId;

            const qrCode = await QRService.getQRById(id, merchantId);
            if (!qrCode) {
                return errorResponse(res, 'QR code not found', 404, { code: 'QR_003' });
            }

            // Get recent transactions
            const recentTransactions = await QRService.getRecentTransactions(id, 10);

            // Get analytics
            const analytics = await QRService.getQRAnalytics(id);

            return successResponse(res, 'QR details fetched successfully', {
                ...qrCode,
                recent_transactions: recentTransactions,
                analytics
            });

        } catch (error) {
            logger.error('Error fetching QR details:', error);
            return errorResponse(res, 'Failed to fetch QR details', 500);
        }
    }

    /**
     * Update QR code information
     */
    async updateQR(req, res) {
        try {
            const { id } = req.params;
            const merchantId = req.user.merchantId;
            const userId = req.user.id;
            const updates = req.body;

            // Check if QR exists and belongs to merchant
            const qrCode = await QRService.getQRById(id, merchantId);
            if (!qrCode) {
                return errorResponse(res, 'QR code not found', 404, { code: 'QR_003' });
            }

            // Store old values for audit
            const oldValues = { ...qrCode };

            // Update QR code
            const updatedQR = await QRService.updateQR(id, {
                ...updates,
                updated_by: userId,
                updated_at: new Date()
            });

            // Log audit
            await QRService.logAudit({
                entity_type: 'qr_codes',
                entity_id: id,
                action: 'UPDATE',
                user_id: userId,
                old_values: oldValues,
                new_values: updatedQR
            });

            return successResponse(res, 'QR code updated successfully', updatedQR);

        } catch (error) {
            logger.error('Error updating QR code:', error);
            return errorResponse(res, 'Failed to update QR code', 500);
        }
    }

    /**
     * Delete QR code (soft delete)
     */
    async deleteQR(req, res) {
        try {
            const { id } = req.params;
            const merchantId = req.user.merchantId;
            const userId = req.user.id;

            // Check if QR exists and belongs to merchant
            const qrCode = await QRService.getQRById(id, merchantId);
            if (!qrCode) {
                return errorResponse(res, 'QR code not found', 404, { code: 'QR_003' });
            }

            // Check if QR has pending transactions
            const hasPendingTransactions = await QRService.hasPendingTransactions(id);
            if (hasPendingTransactions) {
                return errorResponse(res, 'Cannot delete QR with pending transactions', 400);
            }

            // Soft delete
            await QRService.deleteQR(id, userId);

            // Log audit
            await QRService.logAudit({
                entity_type: 'qr_codes',
                entity_id: id,
                action: 'DELETE',
                user_id: userId,
                old_values: qrCode
            });

            return successResponse(res, 'QR code deleted successfully');

        } catch (error) {
            logger.error('Error deleting QR code:', error);
            return errorResponse(res, 'Failed to delete QR code', 500);
        }
    }

    /**
     * Toggle QR code status (active/inactive)
     */
    async toggleQRStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const merchantId = req.user.merchantId;
            const userId = req.user.id;

            if (!['active', 'inactive'].includes(status)) {
                return errorResponse(res, 'Invalid status', 400);
            }

            // Check if QR exists and belongs to merchant
            const qrCode = await QRService.getQRById(id, merchantId);
            if (!qrCode) {
                return errorResponse(res, 'QR code not found', 404, { code: 'QR_003' });
            }

            // Update status
            const updatedQR = await QRService.updateQR(id, {
                status,
                updated_by: userId,
                updated_at: new Date()
            });

            // Log audit
            await QRService.logAudit({
                entity_type: 'qr_codes',
                entity_id: id,
                action: 'STATUS_CHANGE',
                user_id: userId,
                old_values: { status: qrCode.status },
                new_values: { status }
            });

            // Send real-time notification
            await QRService.sendStatusChangeNotification(merchantId, qrCode.qr_identifier, qrCode.status, status);

            return successResponse(res, 'QR status updated successfully', updatedQR);

        } catch (error) {
            logger.error('Error toggling QR status:', error);
            return errorResponse(res, 'Failed to update QR status', 500);
        }
    }

    /**
     * Validate QR identifier availability
     */
    async validateIdentifier(req, res) {
        try {
            const { identifier } = req.body;

            if (!identifier || identifier.length !== 5) {
                return errorResponse(res, 'Invalid identifier format', 400);
            }

            const exists = await VPAService.checkIdentifierExists(identifier);
            const alternatives = exists ? await VPAService.generateAlternatives(identifier) : [];

            return successResponse(res, 'Identifier validation completed', {
                available: !exists,
                identifier,
                suggested_alternatives: alternatives
            });

        } catch (error) {
            logger.error('Error validating identifier:', error);
            return errorResponse(res, 'Failed to validate identifier', 500);
        }
    }

    /**
     * Generate QR image with custom design
     */
    async generateQRImage(req, res) {
        try {
            const { id } = req.params;
            const merchantId = req.user.merchantId;
            const {
                format = 'png',
                size = 'medium',
                template = 'professional',
                include_logo = true,
                include_instructions = true,
                brand_config = {}
            } = req.body;

            // Get QR code
            const qrCode = await QRService.getQRById(id, merchantId);
            if (!qrCode) {
                return errorResponse(res, 'QR code not found', 404, { code: 'QR_003' });
            }

            // Generate image
            const imageData = await QRImageService.generateCustomQR({
                qrString: qrCode.qr_string,
                qrIdentifier: qrCode.qr_identifier,
                format,
                size,
                template,
                includeLogo: include_logo,
                includeInstructions: include_instructions,
                brandConfig: brand_config,
                merchantId
            });

            return successResponse(res, 'QR image generated successfully', imageData);

        } catch (error) {
            logger.error('Error generating QR image:', error);
            return errorResponse(res, 'Failed to generate QR image', 500);
        }
    }

    /**
     * Get dashboard summary
     */
    async getDashboardSummary(req, res) {
        try {
            const merchantId = req.user.merchantId;

            const summary = await QRService.getDashboardSummary(merchantId);

            return successResponse(res, 'Dashboard summary fetched successfully', summary);

        } catch (error) {
            logger.error('Error fetching dashboard summary:', error);
            return errorResponse(res, 'Failed to fetch dashboard summary', 500);
        }
    }

    /**
     * Upload merchant logo for QR customization
     */
    async uploadLogo(req, res) {
        try {
            const merchantId = req.user.merchantId;
            const file = req.file;

            if (!file) {
                return errorResponse(res, 'No file uploaded', 400);
            }

            // Validate file
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
            if (!allowedTypes.includes(file.mimetype)) {
                return errorResponse(res, 'Invalid file type. Only PNG and JPEG allowed.', 400);
            }

            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                return errorResponse(res, 'File size exceeds 2MB limit', 400);
            }

            // Upload and process logo
            const logoData = await QRImageService.uploadAndProcessLogo(file, merchantId);

            return successResponse(res, 'Logo uploaded successfully', logoData);

        } catch (error) {
            logger.error('Error uploading logo:', error);
            return errorResponse(res, 'Failed to upload logo', 500);
        }
    }
}

module.exports = new QRController();