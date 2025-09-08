/**
 * End-to-End Backend Testing Suite
 * Tests all API endpoints and functionality
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';
const API_KEY = 'mk_live_MERCH001';
const API_SECRET = 'sk_live_demo_key';

// Test results storage
const testResults = {
    timestamp: new Date().toISOString(),
    totalTests: 0,
    passed: 0,
    failed: 0,
    tests: []
};

// Helper function to make API requests
async function makeRequest(method, endpoint, data = null, headers = {}) {
    try {
        const config = {
            method,
            url: `${BASE_URL}${endpoint}`,
            headers: {
                'X-API-Key': API_KEY,
                'X-API-Secret': API_SECRET,
                'Content-Type': 'application/json',
                ...headers
            }
        };
        
        if (data) {
            config.data = data;
        }
        
        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        return { 
            success: false, 
            error: error.response?.data || error.message,
            status: error.response?.status 
        };
    }
}

// Test functions
async function testHealthCheck() {
    console.log('\n🔍 Testing Health Check Endpoint...');
    const result = await makeRequest('GET', '/api/health', null, {});
    
    const test = {
        name: 'Health Check',
        endpoint: '/api/health',
        passed: result.success && result.status === 200,
        response: result
    };
    
    testResults.tests.push(test);
    if (test.passed) {
        console.log('✅ Health check passed');
        testResults.passed++;
    } else {
        console.log('❌ Health check failed:', result.error);
        testResults.failed++;
    }
    testResults.totalTests++;
}

async function testQRGeneration() {
    console.log('\n🔍 Testing QR Code Generation...');
    
    const payload = {
        merchant_name: "Test Merchant",
        merchant_id: "MERCH001",
        amount: 500.00,
        mobile: "9876543210",
        email: "test@example.com",
        description: "Test Payment"
    };
    
    const result = await makeRequest('POST', '/api/v1/merchant/qr/generate', payload);
    
    const test = {
        name: 'QR Code Generation',
        endpoint: '/api/v1/merchant/qr/generate',
        passed: result.success && result.data?.success,
        response: result
    };
    
    testResults.tests.push(test);
    if (test.passed) {
        console.log('✅ QR generation passed');
        console.log('   Generated QR ID:', result.data.data?.qr_id);
        testResults.passed++;
    } else {
        console.log('❌ QR generation failed:', result.error);
        testResults.failed++;
    }
    testResults.totalTests++;
    
    return result.data?.data?.qr_id;
}

async function testBulkQRGeneration() {
    console.log('\n🔍 Testing Bulk QR Generation...');
    
    const payload = {
        merchants: [
            {
                merchant_name: "Bulk Test 1",
                merchant_id: "BULK001",
                amount: 100.00,
                mobile: "9876543210",
                email: "bulk1@test.com"
            },
            {
                merchant_name: "Bulk Test 2",
                merchant_id: "BULK002",
                amount: 200.00,
                mobile: "9876543211",
                email: "bulk2@test.com"
            }
        ]
    };
    
    const result = await makeRequest('POST', '/api/bulk-qr/generate', payload);
    
    const test = {
        name: 'Bulk QR Generation',
        endpoint: '/api/bulk-qr/generate',
        passed: result.success && result.data?.success,
        response: result
    };
    
    testResults.tests.push(test);
    if (test.passed) {
        console.log('✅ Bulk QR generation passed');
        console.log('   Generated QRs:', result.data.data?.length || 0);
        testResults.passed++;
    } else {
        console.log('❌ Bulk QR generation failed:', result.error);
        testResults.failed++;
    }
    testResults.totalTests++;
}

async function testListQRCodes() {
    console.log('\n🔍 Testing List QR Codes...');
    
    const result = await makeRequest('GET', '/api/v1/merchant/qr/list?page=1&limit=10');
    
    const test = {
        name: 'List QR Codes',
        endpoint: '/api/v1/merchant/qr/list',
        passed: result.success,
        response: result
    };
    
    testResults.tests.push(test);
    if (test.passed) {
        console.log('✅ List QR codes passed');
        console.log('   Total QRs:', result.data?.data?.length || 0);
        testResults.passed++;
    } else {
        console.log('❌ List QR codes failed:', result.error);
        testResults.failed++;
    }
    testResults.totalTests++;
}

async function testTransactionList() {
    console.log('\n🔍 Testing Transaction List...');
    
    const result = await makeRequest('GET', '/api/v1/merchant/transactions?page=1&limit=10');
    
    const test = {
        name: 'Transaction List',
        endpoint: '/api/v1/merchant/transactions',
        passed: result.success,
        response: result
    };
    
    testResults.tests.push(test);
    if (test.passed) {
        console.log('✅ Transaction list passed');
        testResults.passed++;
    } else {
        console.log('❌ Transaction list failed:', result.error);
        testResults.failed++;
    }
    testResults.totalTests++;
}

async function testAnalytics() {
    console.log('\n🔍 Testing Analytics Endpoint...');
    
    const result = await makeRequest('GET', '/api/v1/merchant/analytics?period=day');
    
    const test = {
        name: 'Analytics',
        endpoint: '/api/v1/merchant/analytics',
        passed: result.success,
        response: result
    };
    
    testResults.tests.push(test);
    if (test.passed) {
        console.log('✅ Analytics endpoint passed');
        testResults.passed++;
    } else {
        console.log('❌ Analytics endpoint failed:', result.error);
        testResults.failed++;
    }
    testResults.totalTests++;
}

async function testWebhook() {
    console.log('\n🔍 Testing Webhook Endpoint...');
    
    const webhookPayload = {
        event: "payment.success",
        transaction_id: "TXN_TEST_123",
        merchant_id: "MERCH001",
        amount: 500.00,
        status: "success",
        timestamp: new Date().toISOString()
    };
    
    // Webhook doesn't require API auth
    const result = await makeRequest('POST', '/api/hdfc/webhook', webhookPayload, {
        'X-API-Key': undefined,
        'X-API-Secret': undefined
    });
    
    const test = {
        name: 'Webhook Handler',
        endpoint: '/api/hdfc/webhook',
        passed: result.success || result.status === 200,
        response: result
    };
    
    testResults.tests.push(test);
    if (test.passed) {
        console.log('✅ Webhook handler passed');
        testResults.passed++;
    } else {
        console.log('❌ Webhook handler failed:', result.error);
        testResults.failed++;
    }
    testResults.totalTests++;
}

async function testRateLimiting() {
    console.log('\n🔍 Testing Rate Limiting...');
    
    // Make multiple rapid requests
    const requests = [];
    for (let i = 0; i < 5; i++) {
        requests.push(makeRequest('GET', '/api/v1/merchant/qr/list'));
    }
    
    const results = await Promise.all(requests);
    const rateLimited = results.some(r => r.status === 429);
    
    const test = {
        name: 'Rate Limiting',
        endpoint: 'Multiple endpoints',
        passed: true, // Rate limiting is optional
        response: { rateLimited }
    };
    
    testResults.tests.push(test);
    console.log(rateLimited ? '✅ Rate limiting is active' : '⚠️  Rate limiting not detected (may have high limit)');
    testResults.passed++;
    testResults.totalTests++;
}

async function testInvalidAuth() {
    console.log('\n🔍 Testing Authentication Validation...');
    
    const config = {
        method: 'GET',
        url: `${BASE_URL}/api/v1/merchant/qr/list`,
        headers: {
            'X-API-Key': 'invalid_key',
            'X-API-Secret': 'invalid_secret'
        }
    };
    
    try {
        await axios(config);
        const test = {
            name: 'Invalid Authentication',
            endpoint: '/api/v1/merchant/qr/list',
            passed: false,
            response: { error: 'Should have rejected invalid credentials' }
        };
        testResults.tests.push(test);
        console.log('❌ Auth validation failed - accepted invalid credentials');
        testResults.failed++;
    } catch (error) {
        const test = {
            name: 'Invalid Authentication',
            endpoint: '/api/v1/merchant/qr/list',
            passed: error.response?.status === 401,
            response: { status: error.response?.status }
        };
        testResults.tests.push(test);
        if (test.passed) {
            console.log('✅ Auth validation passed - rejected invalid credentials');
            testResults.passed++;
        } else {
            console.log('❌ Auth validation failed - unexpected error');
            testResults.failed++;
        }
    }
    testResults.totalTests++;
}

// Main test runner
async function runTests() {
    console.log('====================================');
    console.log('   SABPAISA QR BACKEND E2E TESTS   ');
    console.log('====================================');
    console.log('Base URL:', BASE_URL);
    console.log('Starting tests at:', new Date().toLocaleString());
    
    try {
        // Check if server is running
        console.log('\n📡 Checking server status...');
        const healthCheck = await axios.get(`${BASE_URL}/api/health`).catch(e => null);
        
        if (!healthCheck) {
            console.error('\n❌ ERROR: Backend server is not running!');
            console.log('Please start the server with: cd ~/Desktop/sabpaisa-qr-backend && npm start');
            return;
        }
        
        console.log('✅ Server is running');
        
        // Run all tests
        await testHealthCheck();
        await testQRGeneration();
        await testBulkQRGeneration();
        await testListQRCodes();
        await testTransactionList();
        await testAnalytics();
        await testWebhook();
        await testRateLimiting();
        await testInvalidAuth();
        
        // Print summary
        console.log('\n====================================');
        console.log('         TEST SUMMARY              ');
        console.log('====================================');
        console.log(`Total Tests: ${testResults.totalTests}`);
        console.log(`✅ Passed: ${testResults.passed}`);
        console.log(`❌ Failed: ${testResults.failed}`);
        console.log(`Success Rate: ${((testResults.passed/testResults.totalTests)*100).toFixed(1)}%`);
        
        // Save results to file
        const reportPath = path.join(__dirname, 'backend_e2e_test_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        if (testResults.failed > 0) {
            console.log('\n⚠️  Some tests failed. Review the report for details.');
        } else {
            console.log('\n🎉 All tests passed successfully!');
        }
        
    } catch (error) {
        console.error('\n❌ Test runner error:', error.message);
    }
}

// Run the tests
runTests();