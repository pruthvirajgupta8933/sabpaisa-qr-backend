const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const crypto = require('crypto');
const transactionStore = require('../services/LocalTransactionStore');
const security = require('../utils/security');

/**
 * Bulk QR Generation Endpoint
 * POST /api/bulk-qr/generate
 */
router.post('/generate', async (req, res) => {
    try {
        const { merchants } = req.body;
        
        if (!merchants || !Array.isArray(merchants) || merchants.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request. Please provide an array of merchants.'
            });
        }

        if (merchants.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 100 QR codes can be generated at once.'
            });
        }

        const results = [];
        const errors = [];

        for (const merchant of merchants) {
            try {
                // Validate and sanitize merchant data
                const validation = security.validateAndSanitizeMerchant(merchant);
                if (!validation.success) {
                    errors.push({
                        merchant_id: merchant.merchant_id || 'UNKNOWN',
                        error: validation.error
                    });
                    continue;
                }
                
                const sanitizedMerchant = validation.data;
                
                // Additional validation for required fields
                if (!sanitizedMerchant.merchant_id || !sanitizedMerchant.merchant_name || !sanitizedMerchant.reference_name) {
                    errors.push({
                        merchant_id: merchant.merchant_id || 'UNKNOWN',
                        error: 'Missing required fields'
                    });
                    continue;
                }

                // Generate unique VPA using sanitized data
                const merchantPrefix = sanitizedMerchant.merchant_name
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '')
                    .substring(0, 8);
                
                const identifier = sanitizedMerchant.merchant_id.toLowerCase();
                const vpa = `${merchantPrefix}.${identifier}@hdfc`;

                // Generate transaction reference
                const timestamp = Date.now().toString().slice(-6);
                const transactionRef = `BULK${identifier.toUpperCase()}${timestamp}`;

                // Create UPI string with sanitized data
                const upiString = [
                    'upi://pay?',
                    `pa=${vpa}`,
                    `&pn=${encodeURIComponent(sanitizedMerchant.reference_name)}`,
                    `&tn=${encodeURIComponent(sanitizedMerchant.description || 'Payment')}`,
                    '&cu=INR',
                    '&mc=6012',
                    `&tr=${transactionRef}`,
                    '&mode=01',
                    sanitizedMerchant.amount ? `&am=${sanitizedMerchant.amount}` : ''
                ].filter(Boolean).join('');

                // Generate QR Code
                const qrOptions = {
                    errorCorrectionLevel: 'M',
                    type: 'image/png',
                    width: 300,
                    margin: 1
                };

                const qrImageData = await QRCode.toDataURL(upiString, qrOptions);

                // Store QR data with sanitized values
                const qrData = {
                    id: crypto.randomBytes(8).toString('hex'),
                    merchant_id: sanitizedMerchant.merchant_id,
                    merchant_name: sanitizedMerchant.merchant_name,
                    reference_name: sanitizedMerchant.reference_name,
                    description: sanitizedMerchant.description || 'Payment',
                    amount: sanitizedMerchant.amount || null,
                    vpa: vpa,
                    upi_string: upiString,
                    transaction_ref: transactionRef,
                    qr_image: qrImageData,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    mobile_number: sanitizedMerchant.mobile_number || null,
                    email: sanitizedMerchant.email || null,
                    address: sanitizedMerchant.address || null
                };

                // Save to store
                await transactionStore.saveQRCode(qrData);

                results.push({
                    success: true,
                    ...qrData
                });

            } catch (error) {
                errors.push({
                    merchant_id: merchant.merchant_id,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            total: merchants.length,
            successful: results.length,
            failed: errors.length,
            results: results,
            errors: errors
        });

    } catch (error) {
        console.error('Bulk QR generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Get Bulk QR Generation Status
 * GET /api/bulk-qr/status/:batchId
 */
router.get('/status/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;
        
        // Retrieve batch status from store
        const batchStatus = await transactionStore.getBatchStatus(batchId);
        
        if (!batchStatus) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        res.json({
            success: true,
            data: batchStatus
        });

    } catch (error) {
        console.error('Error fetching batch status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Download Bulk QR Codes
 * GET /api/bulk-qr/download/:batchId
 */
router.get('/download/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;
        const { format = 'zip' } = req.query;

        // Retrieve batch data
        const batchData = await transactionStore.getBatchData(batchId);
        
        if (!batchData || batchData.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found or empty'
            });
        }

        if (format === 'zip') {
            // Create ZIP file with all QR codes
            const JSZip = require('jszip');
            const zip = new JSZip();
            const qrFolder = zip.folder('qr_codes');

            for (const qr of batchData) {
                if (qr.qr_image) {
                    const base64Data = qr.qr_image.replace(/^data:image\/(png|jpg);base64,/, '');
                    const fileName = `${qr.merchant_id}_${qr.merchant_name.replace(/[^a-z0-9]/gi, '_')}.png`;
                    qrFolder.file(fileName, base64Data, { base64: true });
                }
            }

            // Add CSV report
            const csvContent = generateCSVReport(batchData);
            zip.file('qr_report.csv', csvContent);

            // Generate ZIP
            const content = await zip.generateAsync({ type: 'nodebuffer' });
            
            res.set({
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="bulk_qr_${batchId}.zip"`
            });
            
            res.send(content);
            
        } else if (format === 'csv') {
            // Download CSV report only
            const csvContent = generateCSVReport(batchData);
            
            res.set({
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="qr_report_${batchId}.csv"`
            });
            
            res.send(csvContent);
        } else {
            res.status(400).json({
                success: false,
                error: 'Invalid format. Use zip or csv.'
            });
        }

    } catch (error) {
        console.error('Error downloading batch:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Helper function to generate CSV report
 */
function generateCSVReport(data) {
    const headers = [
        'Merchant ID',
        'Merchant Name',
        'VPA',
        'Transaction Reference',
        'Amount',
        'Status',
        'Created At'
    ];

    const rows = data.map(qr => [
        qr.merchant_id,
        qr.merchant_name,
        qr.vpa,
        qr.transaction_ref,
        qr.amount || 'N/A',
        qr.status,
        qr.created_at
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
}

module.exports = router;