# QR Payment System - Backend API Documentation

## Base URL
```
Production: https://api.sabpaisa.com/v1
Staging: https://staging-api.sabpaisa.com/v1
```

## Authentication
All API endpoints require authentication using JWT tokens.

```
Headers:
Authorization: Bearer <jwt_token>
Content-Type: application/json
X-Merchant-ID: <merchant_id>
```

---

## 1. QR Code Management APIs

### 1.1 Generate QR Code
**POST** `/qr/generate`

**Request Body:**
```json
{
  "reference_name": "Store Main Counter",
  "amount": null,  // null for dynamic amount
  "purpose": "General Payment",
  "description": "Payment for Store Counter 1",
  "store_location": "Mumbai",
  "store_city": "Mumbai",
  "store_state": "Maharashtra",
  "store_pincode": "400001",
  "daily_limit": 100000,
  "monthly_limit": 3000000,
  "min_amount": 1,
  "max_amount": 50000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qr_identifier": "QR001234",
    "vpa": "sabpaisa.merchant001@okhdfcbank",
    "qr_string": "upi://pay?pa=sabpaisa.merchant001@okhdfcbank&pn=MerchantName&mc=5411",
    "qr_image_url": "https://cdn.sabpaisa.com/qr/QR001234.png",
    "download_url": "https://api.sabpaisa.com/qr/download/QR001234"
  }
}
```

### 1.2 List QR Codes
**GET** `/qr/list`

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `status` (active|inactive|all)
- `search` (search by name or ID)
- `sort_by` (created_at|reference_name|status)
- `sort_order` (asc|desc)

**Response:**
```json
{
  "success": true,
  "data": {
    "qr_codes": [...],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "total_pages": 8
    }
  }
}
```

### 1.3 Update QR Code
**PUT** `/qr/{qr_identifier}`

**Request Body:**
```json
{
  "reference_name": "Updated Name",
  "status": "active",
  "daily_limit": 150000,
  "max_amount": 75000
}
```

### 1.4 Deactivate QR Code
**POST** `/qr/{qr_identifier}/deactivate`

---

## 2. Transaction APIs

### 2.1 Get Transaction List
**GET** `/transactions`

**Query Parameters:**
- `from_date` (YYYY-MM-DD)
- `to_date` (YYYY-MM-DD)
- `qr_code` (QR identifier)
- `status` (success|pending|failed|refunded|all)
- `payment_method` (UPI|QR|NFC|all)
- `min_amount`
- `max_amount`
- `customer_vpa`
- `reference_number`
- `page` (default: 1)
- `limit` (default: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transaction_id": "TXN20240115001",
        "qr_identifier": "QR001",
        "qr_name": "Store Main Counter",
        "amount": 2500,
        "status": "success",
        "customer_vpa": "customer@upi",
        "customer_name": "John Doe",
        "payment_method": "UPI",
        "reference_number": "UPI400115103045",
        "bank_reference_number": "HDFC123456789",
        "initiated_at": "2024-01-15T10:30:45Z",
        "completed_at": "2024-01-15T10:30:55Z",
        "settlement_status": "settled",
        "settlement_date": "2024-01-16"
      }
    ],
    "pagination": {
      "total": 1543,
      "page": 1,
      "limit": 50,
      "total_pages": 31
    },
    "summary": {
      "total_amount": 4567890,
      "successful_amount": 4235678,
      "total_transactions": 1543,
      "successful_transactions": 1425
    }
  }
}
```

### 2.2 Get Transaction Details
**GET** `/transactions/{transaction_id}`

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "transaction_id": "TXN20240115001",
      "qr_code_details": {...},
      "customer_details": {...},
      "payment_details": {...},
      "settlement_details": {...},
      "refund_details": {...},
      "audit_trail": [...]
    }
  }
}
```

### 2.3 Transaction Enquiry (Search)
**POST** `/transactions/enquiry`

**Request Body:**
```json
{
  "transaction_id": "",
  "qr_code": "",
  "customer_vpa": "",
  "reference_number": "",
  "date_from": "2024-01-01",
  "date_to": "2024-01-31",
  "amount_from": 100,
  "amount_to": 10000,
  "status": "all"
}
```

---

## 3. Refund APIs

### 3.1 Initiate Refund
**POST** `/transactions/{transaction_id}/refund`

**Request Body:**
```json
{
  "refund_type": "full",  // or "partial"
  "refund_amount": 2500,  // required if partial
  "reason": "Customer request - product return",
  "initiated_by": "admin@merchant.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "refund_id": "REF20240115001",
    "transaction_id": "TXN20240115001",
    "refund_amount": 2500,
    "refund_status": "initiated",
    "estimated_completion": "2024-01-22T18:00:00Z"
  }
}
```

### 3.2 Get Refund Status
**GET** `/refunds/{refund_id}`

---

## 4. Settlement APIs

### 4.1 Get Settlement Report
**GET** `/settlements`

**Query Parameters:**
- `from_date` (YYYY-MM-DD)
- `to_date` (YYYY-MM-DD)
- `status` (completed|pending|failed|all)
- `type` (auto|manual|all)
- `page`
- `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "settlements": [
      {
        "settlement_id": "SETT20240116001",
        "batch_id": "BATCH20240116001",
        "settlement_date": "2024-01-16",
        "total_transactions": 45,
        "gross_amount": 125000,
        "charges": 2500,
        "tax": 450,
        "net_settlement": 122050,
        "status": "completed",
        "utr_number": "HDFC24011612345",
        "bank_reference": "HDFC20240116001"
      }
    ],
    "summary": {
      "total_settlements": 15,
      "total_amount": 1850000,
      "total_settled": 1805000,
      "pending_amount": 45000
    }
  }
}
```

### 4.2 Get Settlement Details
**GET** `/settlements/{settlement_id}`

### 4.3 Download Settlement Report
**GET** `/settlements/{settlement_id}/download`

**Query Parameters:**
- `format` (pdf|csv|excel)

### 4.4 Initiate Manual Settlement
**POST** `/settlements/manual`

**Request Body:**
```json
{
  "transaction_ids": [],  // optional, if empty settles all eligible
  "reason": "End of day settlement"
}
```

---

## 5. Dashboard & Analytics APIs

### 5.1 Get Dashboard Summary
**GET** `/dashboard/summary`

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_qr_codes": 25,
      "active_qr_codes": 23,
      "today_collections": 45678,
      "today_transactions": 123,
      "total_collections": 4567890,
      "monthly_collections": 1234567,
      "average_transaction_value": 372,
      "conversion_rate": 92.3
    },
    "collection_trend": [
      {
        "date": "2024-01-15",
        "amount": 45678,
        "transactions": 123
      }
    ],
    "top_performing_qrs": [...],
    "recent_payments": [...]
  }
}
```

### 5.2 Get Transaction Summary Report
**GET** `/reports/transaction-summary`

**Query Parameters:**
- `from_date`
- `to_date`
- `group_by` (day|week|month)

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_transactions": 15426,
      "total_amount": 4567890,
      "successful_transactions": 14235,
      "failed_transactions": 891,
      "refunded_transactions": 125,
      "average_transaction_value": 296,
      "conversion_rate": 92.3
    },
    "daily_trend": [...],
    "hourly_distribution": [...],
    "status_distribution": {...},
    "payment_method_distribution": {...},
    "top_qr_codes": [...],
    "peak_times": {
      "peak_hour": "14:00-15:00",
      "peak_day": "Saturday"
    }
  }
}
```

### 5.3 Get Transaction History Report
**GET** `/reports/transaction-history`

**Query Parameters:**
- All transaction list parameters
- `export` (true|false)
- `export_format` (csv|excel|pdf)

### 5.4 Export Reports
**POST** `/reports/export`

**Request Body:**
```json
{
  "report_type": "transactions",  // or "settlements", "summary"
  "format": "excel",  // or "csv", "pdf"
  "filters": {
    "from_date": "2024-01-01",
    "to_date": "2024-01-31",
    "status": "all"
  },
  "email_to": "admin@merchant.com"  // optional
}
```

---

## 6. Webhook APIs

### 6.1 Register Webhook
**POST** `/webhooks/register`

**Request Body:**
```json
{
  "url": "https://merchant.com/webhook/qr-payments",
  "events": ["transaction.success", "transaction.failed", "settlement.completed", "refund.completed"],
  "secret": "webhook_secret_key"
}
```

### 6.2 Test Webhook
**POST** `/webhooks/test`

### 6.3 Webhook Events

**Transaction Success Event:**
```json
{
  "event": "transaction.success",
  "timestamp": "2024-01-15T10:30:55Z",
  "data": {
    "transaction_id": "TXN20240115001",
    "amount": 2500,
    "qr_identifier": "QR001",
    "customer_vpa": "customer@upi",
    "reference_number": "UPI400115103045"
  }
}
```

---

## 7. Configuration APIs

### 7.1 Get Merchant Configuration
**GET** `/config/merchant`

### 7.2 Update Merchant Configuration
**PUT** `/config/merchant`

**Request Body:**
```json
{
  "settlement_type": "T+1",
  "min_settlement_amount": 100,
  "transaction_charge_percent": 2.0,
  "daily_transaction_limit": 500000,
  "webhook_url": "https://merchant.com/webhook"
}
```

---

## 8. Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request parameters",
    "details": {
      "field": "amount",
      "reason": "Amount must be greater than 0"
    }
  }
}
```

### Common Error Codes:
- `UNAUTHORIZED` - Invalid or expired token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `INVALID_REQUEST` - Invalid request parameters
- `DUPLICATE_ENTRY` - Resource already exists
- `LIMIT_EXCEEDED` - Transaction or rate limit exceeded
- `PROCESSING_ERROR` - Internal processing error
- `EXTERNAL_SERVICE_ERROR` - Bank or payment gateway error

---

## 9. Rate Limiting

- **Default Rate Limit:** 1000 requests per minute
- **Burst Limit:** 50 requests per second
- **Headers Returned:**
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time when limit resets

---

## 10. Pagination

All list endpoints support pagination:

```
?page=1&limit=50&sort_by=created_at&sort_order=desc
```

Response includes pagination metadata:
```json
{
  "pagination": {
    "total": 1543,
    "page": 1,
    "limit": 50,
    "total_pages": 31,
    "has_next": true,
    "has_prev": false
  }
}
```