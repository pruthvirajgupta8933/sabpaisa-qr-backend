# SabPaisa QR Backend API Documentation

## Base URL
```
Production: https://api.sabpaisa.in
Development: http://localhost:3001
```

## Authentication
All API requests require authentication using API Key and Secret in headers:
```
X-API-Key: your_merchant_api_key
X-API-Secret: your_merchant_api_secret
```

## Endpoints

### 1. Generate QR Code
**POST** `/api/v1/merchant/qr/generate`

Generate a new static QR code for merchant.

**Request Body:**
```json
{
  "merchant_name": "Merchant Name",
  "merchant_id": "MERCH001",
  "amount": 1000.00,
  "mobile": "9876543210",
  "email": "merchant@example.com",
  "description": "Payment for services"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qr_id": "qr_12345",
    "qr_code": "base64_encoded_qr_image",
    "upi_string": "upi://pay?pa=merchant@paytm&pn=MerchantName&am=1000.00",
    "vpa": "MERCH001.sabpaisa@hdfc"
  }
}
```

### 2. Bulk QR Generation
**POST** `/api/bulk-qr/generate`

Generate multiple QR codes in bulk.

**Request Body:**
```json
{
  "merchants": [
    {
      "merchant_name": "Merchant 1",
      "merchant_id": "MERCH001",
      "amount": 1000.00,
      "mobile": "9876543210",
      "email": "merchant1@example.com"
    }
  ]
}
```

### 3. List QR Codes
**GET** `/api/v1/merchant/qr/list`

Get list of all QR codes for authenticated merchant.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by status (active/inactive)

### 4. Transaction List
**GET** `/api/v1/merchant/transactions`

Get transaction history for merchant.

**Query Parameters:**
- `from_date`: Start date (YYYY-MM-DD)
- `to_date`: End date (YYYY-MM-DD)
- `status`: Transaction status (success/pending/failed)
- `page`: Page number
- `limit`: Items per page

### 5. Analytics
**GET** `/api/v1/merchant/analytics`

Get payment analytics and statistics.

**Query Parameters:**
- `period`: Time period (day/week/month/year)
- `from_date`: Start date
- `to_date`: End date

### 6. HDFC Webhook
**POST** `/api/hdfc/webhook`

Webhook endpoint for HDFC payment notifications (Internal use only).

## Rate Limiting
- Production: 100 requests per minute
- Test: 50 requests per minute

## Error Codes
- `400`: Bad Request - Invalid parameters
- `401`: Unauthorized - Invalid API credentials
- `403`: Forbidden - Permission denied
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error

## Testing
Use test API keys:
- API Key: `mk_test_MERCH001`
- API Secret: `sk_test_demo_key`

## Webhook Integration
To receive payment notifications, configure your webhook URL:
```
https://your-domain.com/webhook/payment
```

Webhook payload:
```json
{
  "event": "payment.success",
  "transaction_id": "TXN123456",
  "merchant_id": "MERCH001",
  "amount": 1000.00,
  "status": "success",
  "timestamp": "2024-09-08T10:30:00Z",
  "signature": "hmac_sha256_signature"
}
```

## Support
For API support, contact: api-support@sabpaisa.in