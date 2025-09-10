# 🚀 Database Setup for Deployment

## Quick Setup (For Deployment Team)

### Step 1: Create Database and User
```sql
-- Connect to MySQL as admin/root
mysql -u root -p

-- Create database
CREATE DATABASE IF NOT EXISTS sabpaisa_qr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user (replace 'YOUR_SECURE_PASSWORD' with actual password)
CREATE USER IF NOT EXISTS 'sabpaisa'@'%' IDENTIFIED BY 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON sabpaisa_qr.* TO 'sabpaisa'@'%';
FLUSH PRIVILEGES;

-- Exit MySQL
exit;
```

### Step 2: Initialize All Tables
```bash
# Run the initialization script
mysql -u sabpaisa -p sabpaisa_qr < database/mysql-init.sql
```

### Step 3: Set Environment Variables
```bash
# Production environment variables
export DB_HOST=your-mysql-host
export DB_PORT=3306
export DB_USER=sabpaisa
export DB_PASSWORD=YOUR_SECURE_PASSWORD
export DB_NAME=sabpaisa_qr
export NODE_ENV=production
```

### Step 4: Start Application
```bash
npm start
```

## ✅ What Gets Created

### Tables (10 Total):
1. **qr_codes** - Stores all QR code information
2. **qr_transactions** - Payment transactions
3. **qr_scan_analytics** - Scan tracking
4. **qr_performance_metrics** - Performance data
5. **qr_status_history** - Status changes
6. **qr_audit_log** - Audit trail
7. **qr_bulk_batches** - Bulk operations
8. **qr_batch_queue** - Processing queue
9. **qr_notifications** - Webhooks/notifications
10. **qr_templates** - QR templates

### Views (2 Total):
1. **transactions** - Backward compatibility
2. **webhook_logs** - Legacy webhook support

### Test Data:
- 3 test QR codes
- 2 templates
- 1 sample transaction

## 🔍 Verify Installation

```sql
-- Check if everything is created
mysql -u sabpaisa -p sabpaisa_qr -e "
SELECT COUNT(*) as 'Total Tables' FROM information_schema.tables WHERE table_schema = 'sabpaisa_qr';
SELECT COUNT(*) as 'Test QR Codes' FROM qr_codes;
SELECT COUNT(*) as 'Test Transactions' FROM qr_transactions;
"
```

Expected output:
- Total Tables: 10
- Test QR Codes: 3
- Test Transactions: 1

## 🔧 For Different Environments

### Development
```bash
mysql -u root -p < database/mysql-init.sql
```

### Staging
```bash
mysql -h staging-db.example.com -u sabpaisa -p sabpaisa_qr < database/mysql-init.sql
```

### Production
```bash
mysql -h prod-db.example.com -u sabpaisa -p sabpaisa_qr < database/mysql-init.sql
```

## 📊 Database Features

- **Scalability**: Supports billions of records
- **Performance**: Optimized indexes
- **Compatibility**: Works with old and new code
- **Security**: Prepared for production use
- **Monitoring**: Built-in metrics tables

## 🚨 Important Notes

1. **Password Security**: Never use default passwords in production
2. **Backup**: Always backup before running initialization
3. **Permissions**: User needs CREATE, ALTER, INSERT, SELECT, UPDATE, DELETE permissions
4. **Character Set**: Uses utf8mb4 for emoji support
5. **Engine**: InnoDB for transaction support

## 🎯 Quick Test

After setup, test with:
```bash
curl http://localhost:3001/api/health
```

Should return:
```json
{
  "status": "OK",
  "database": {
    "connected": true,
    "type": "mysql",
    "features": "Full"
  }
}
```

---

**Ready for deployment!** 🚀