#!/usr/bin/env node

const axios = require('axios');
const CryptoJS = require('crypto-js');

// Test configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3001/api/hdfc/webhook';
const MERCHANT_KEY = 'ef880fed3abe10d54102a24e05e41ca2'; // HDFC UAT test key

// Function to encrypt data using AES-128 ECB (same as HDFC)
function encryptAES128(plainText, key) {
    const keyUtf8 = CryptoJS.enc.Utf8.parse(key);
    const encrypted = CryptoJS.AES.encrypt(plainText, keyUtf8, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.toString();
}

// Generate test transaction data
function generateTestTransaction(status = 'SUCCESS') {
    const transactionId = `TXN${Date.now()}`;
    const amount = Math.floor(Math.random() * 5000) + 100;
    const bankRRN = `${Date.now()}`.slice(-12);
    
    // Create 21 pipe-separated fields as per HDFC format
    const fields = [
        'HDFC000010380443',                          // 0: merchantId
        'Test Merchant',                              // 1: merchantName
        'TERM001',                                    // 2: terminalId
        transactionId,                                // 3: transactionId
        bankRRN,                                      // 4: bankRRN
        `STQ001${Date.now()}`,                        // 5: merchantTxnId
        amount.toString(),                            // 6: amount
        status,                                       // 7: transactionStatus
        status === 'SUCCESS' ? 'Transaction successful' : 'Transaction failed', // 8: statusDescription
        'testuser@paytm',                            // 9: payerVPA
        'Test User',                                  // 10: payerName
        '9876543210',                                 // 11: mobileNumber
        new Date().toISOString(),                    // 12: transactionDateTime
        amount.toString(),                            // 13: settlementAmount
        new Date().toISOString(),                    // 14: settlementDateTime
        'UPI',                                        // 15: paymentMode
        '6012',                                       // 16: mcc
        '0',                                          // 17: tipAmount
        '0',                                          // 18: convenienceFee
        amount.toString(),                            // 19: netAmount
        'test-checksum'                               // 20: checksum
    ];
    
    return fields.join('|');
}

// Send test webhook
async function sendTestWebhook(status = 'SUCCESS') {
    try {
        console.log('===========================================');
        console.log('HDFC Webhook Test');
        console.log('===========================================');
        console.log(`Webhook URL: ${WEBHOOK_URL}`);
        console.log(`Transaction Status: ${status}`);
        
        // Generate test data
        const transactionData = generateTestTransaction(status);
        console.log('\nRaw Transaction Data:');
        console.log(transactionData);
        
        // Encrypt the data
        const encryptedData = encryptAES128(transactionData, MERCHANT_KEY);
        console.log('\nEncrypted Data:');
        console.log(encryptedData);
        
        // Send webhook request
        console.log('\nSending webhook request...');
        const response = await axios.post(WEBHOOK_URL, {
            encryptedData: encryptedData  // Changed from encryptedResponse to encryptedData
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Source': 'HDFC-TEST'
            }
        });
        
        console.log('\n✅ Webhook Response:');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        
        return response.data;
    } catch (error) {
        console.error('\n❌ Webhook Test Failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else if (error.request) {
            console.error('No response received. Is the webhook server running?');
            console.error('Try starting the backend server: cd backend && npm start');
        } else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}

// Test multiple scenarios
async function runTests() {
    console.log('Starting HDFC Webhook Tests...\n');
    
    // Test 1: Successful transaction
    console.log('Test 1: Successful Transaction');
    await sendTestWebhook('SUCCESS');
    
    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Failed transaction
    console.log('\n\nTest 2: Failed Transaction');
    await sendTestWebhook('FAILED');
    
    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Pending transaction
    console.log('\n\nTest 3: Pending Transaction');
    await sendTestWebhook('PENDING');
    
    console.log('\n===========================================');
    console.log('All tests completed!');
    console.log('Check the frontend application to see if transactions appear.');
    console.log('===========================================');
}

// Command line interface
const args = process.argv.slice(2);
const command = args[0];

if (command === 'success') {
    sendTestWebhook('SUCCESS');
} else if (command === 'failed') {
    sendTestWebhook('FAILED');
} else if (command === 'pending') {
    sendTestWebhook('PENDING');
} else if (command === 'all') {
    runTests();
} else {
    console.log('HDFC Webhook Test Script');
    console.log('========================');
    console.log('\nUsage:');
    console.log('  node test-webhook.js [command]');
    console.log('\nCommands:');
    console.log('  success  - Send successful transaction webhook');
    console.log('  failed   - Send failed transaction webhook');
    console.log('  pending  - Send pending transaction webhook');
    console.log('  all      - Run all test scenarios');
    console.log('\nExample:');
    console.log('  node test-webhook.js success');
    console.log('\nNote: Make sure the backend server is running on port 3001');
}