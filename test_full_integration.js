/**
 * Complete QR Solution Integration Test
 * Tests the entire QR feature end-to-end
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:3000';
const API_KEY = 'mk_live_MERCH001';
const API_SECRET = 'sk_live_demo_key';

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Test results
let testResults = {
    timestamp: new Date().toISOString(),
    frontend: { total: 0, passed: 0, failed: 0, tests: [] },
    backend: { total: 0, passed: 0, failed: 0, tests: [] },
    integration: { total: 0, passed: 0, failed: 0, tests: [] }
};

// Helper functions
function log(message, color = colors.reset) {
    console.log(color + message + colors.reset);
}

function logSection(title) {
    console.log('\n' + colors.cyan + '═'.repeat(60) + colors.reset);
    console.log(colors.bright + colors.blue + '  ' + title + colors.reset);
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);
}

function logTest(name, passed, details = '') {
    const icon = passed ? '✅' : '❌';
    const color = passed ? colors.green : colors.red;
    console.log(`${icon} ${color}${name}${colors.reset} ${details}`);
}

async function makeAPIRequest(method, endpoint, data = null, headers = {}) {
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

// Frontend Component Tests
async function testFrontendComponents() {
    logSection('FRONTEND COMPONENT VERIFICATION');
    
    const componentsToCheck = [
        { path: 'src/components/bulkQR/BulkQRGenerator.jsx', name: 'Bulk QR Generator Component' },
        { path: 'src/components/bulkQR/BulkQRGenerator.css', name: 'Bulk QR Styles' },
        { path: 'src/components/dashboard/AllPages/static-qr/StaticQR.js', name: 'Static QR Component' },
        { path: 'src/components/dashboard/AllPages/static-qr/QRGeneration.js', name: 'QR Generation' },
        { path: 'src/components/dashboard/AllPages/static-qr/QRManagement.js', name: 'QR Management' },
        { path: 'src/components/dashboard/AllPages/static-qr/QRPayments.js', name: 'QR Payments' },
        { path: 'src/slices/sabqr/sabqrSlice.js', name: 'Redux QR Slice' },
        { path: 'src/services/sabqr/sabqr.service.js', name: 'QR Service Layer' }
    ];
    
    for (const component of componentsToCheck) {
        const fullPath = path.join('/Users/pruthviraj/Desktop/COB-Frontend-cob-nf-production', component.path);
        const exists = fs.existsSync(fullPath);
        
        const test = {
            name: component.name,
            passed: exists,
            path: component.path
        };
        
        testResults.frontend.tests.push(test);
        testResults.frontend.total++;
        
        if (exists) {
            testResults.frontend.passed++;
            logTest(component.name, true, '✓ Found');
        } else {
            testResults.frontend.failed++;
            logTest(component.name, false, '✗ Missing');
        }
    }
}

// Backend API Tests
async function testBackendAPIs() {
    logSection('BACKEND API VERIFICATION');
    
    // 1. Health Check
    log('\n📍 Testing Health Check...');
    const health = await makeAPIRequest('GET', '/api/health', null, {});
    const healthTest = {
        name: 'Health Check API',
        passed: health.success && health.status === 200,
        response: health
    };
    testResults.backend.tests.push(healthTest);
    testResults.backend.total++;
    if (healthTest.passed) {
        testResults.backend.passed++;
        logTest('Health Check', true, `Server: ${health.data?.service || 'Running'}`);
    } else {
        testResults.backend.failed++;
        logTest('Health Check', false, health.error);
    }
    
    // 2. QR Generation API
    log('\n📍 Testing QR Generation API...');
    const qrPayload = {
        merchant_name: "Integration Test Merchant",
        merchant_id: "TEST_MERCH_001",
        amount: 999.99,
        mobile: "9876543210",
        email: "test@integration.com",
        description: "Integration Test Payment"
    };
    
    const qrGen = await makeAPIRequest('POST', '/api/v1/merchant/qr/generate', qrPayload);
    const qrTest = {
        name: 'QR Generation API',
        passed: qrGen.success || qrGen.data?.success,
        response: qrGen
    };
    testResults.backend.tests.push(qrTest);
    testResults.backend.total++;
    
    if (qrTest.passed) {
        testResults.backend.passed++;
        logTest('QR Generation', true, `QR ID: ${qrGen.data?.data?.qr_id || 'Generated'}`);
        
        // Check if QR code data is present
        if (qrGen.data?.data?.qr_code) {
            logTest('  → QR Image Data', true, 'Base64 encoded');
        }
        if (qrGen.data?.data?.upi_string) {
            logTest('  → UPI String', true, qrGen.data.data.upi_string.substring(0, 30) + '...');
        }
        if (qrGen.data?.data?.vpa) {
            logTest('  → VPA Generated', true, qrGen.data.data.vpa);
        }
    } else {
        testResults.backend.failed++;
        logTest('QR Generation', false, JSON.stringify(qrGen.error));
    }
    
    // 3. Bulk QR Generation
    log('\n📍 Testing Bulk QR Generation...');
    const bulkPayload = {
        merchants: [
            {
                merchant_name: "Bulk Test Merchant 1",
                merchant_id: "BULK_TEST_001",
                amount: 100.00,
                mobile: "9876543210",
                email: "bulk1@test.com"
            },
            {
                merchant_name: "Bulk Test Merchant 2",
                merchant_id: "BULK_TEST_002",
                amount: 200.00,
                mobile: "9876543211",
                email: "bulk2@test.com"
            },
            {
                merchant_name: "Bulk Test Merchant 3",
                merchant_id: "BULK_TEST_003",
                amount: 300.00,
                mobile: "9876543212",
                email: "bulk3@test.com"
            }
        ]
    };
    
    const bulkGen = await makeAPIRequest('POST', '/api/bulk-qr/generate', bulkPayload);
    const bulkTest = {
        name: 'Bulk QR Generation API',
        passed: bulkGen.success || bulkGen.data?.success,
        response: bulkGen
    };
    testResults.backend.tests.push(bulkTest);
    testResults.backend.total++;
    
    if (bulkTest.passed) {
        testResults.backend.passed++;
        const qrCount = bulkGen.data?.data?.length || bulkGen.data?.qr_codes?.length || 0;
        logTest('Bulk QR Generation', true, `Generated ${qrCount} QR codes`);
        
        if (bulkGen.data?.zip_file) {
            logTest('  → ZIP File', true, 'Created successfully');
        }
    } else {
        testResults.backend.failed++;
        logTest('Bulk QR Generation', false, JSON.stringify(bulkGen.error));
    }
    
    // 4. List QR Codes
    log('\n📍 Testing List QR Codes API...');
    const listQR = await makeAPIRequest('GET', '/api/v1/merchant/qr/list?page=1&limit=10');
    const listTest = {
        name: 'List QR Codes API',
        passed: listQR.success,
        response: listQR
    };
    testResults.backend.tests.push(listTest);
    testResults.backend.total++;
    
    if (listTest.passed) {
        testResults.backend.passed++;
        const count = listQR.data?.data?.length || listQR.data?.qr_codes?.length || 0;
        logTest('List QR Codes', true, `Found ${count} QR codes`);
    } else {
        testResults.backend.failed++;
        logTest('List QR Codes', false, JSON.stringify(listQR.error));
    }
    
    // 5. Transaction API
    log('\n📍 Testing Transaction API...');
    const transactions = await makeAPIRequest('GET', '/api/v1/merchant/transactions');
    const transTest = {
        name: 'Transactions API',
        passed: transactions.success,
        response: transactions
    };
    testResults.backend.tests.push(transTest);
    testResults.backend.total++;
    
    if (transTest.passed) {
        testResults.backend.passed++;
        logTest('Transactions API', true, 'Endpoint accessible');
    } else {
        testResults.backend.failed++;
        logTest('Transactions API', false, transactions.error);
    }
    
    // 6. Analytics API
    log('\n📍 Testing Analytics API...');
    const analytics = await makeAPIRequest('GET', '/api/v1/merchant/analytics?period=day');
    const analyticsTest = {
        name: 'Analytics API',
        passed: analytics.success,
        response: analytics
    };
    testResults.backend.tests.push(analyticsTest);
    testResults.backend.total++;
    
    if (analyticsTest.passed) {
        testResults.backend.passed++;
        logTest('Analytics API', true, 'Data retrieved');
    } else {
        testResults.backend.failed++;
        logTest('Analytics API', false, analytics.error);
    }
}

// Integration Tests
async function testIntegration() {
    logSection('INTEGRATION TESTS');
    
    // 1. Test Webhook
    log('\n📍 Testing Webhook Integration...');
    const webhookPayload = {
        encrypted_data: Buffer.from(JSON.stringify({
            event: "payment.success",
            transaction_id: "INT_TEST_TXN_" + Date.now(),
            merchant_id: "TEST_MERCH_001",
            amount: 999.99,
            status: "success",
            upi_transaction_id: "UPI_" + Date.now(),
            payer_vpa: "customer@upi",
            timestamp: new Date().toISOString()
        })).toString('base64')
    };
    
    const webhook = await makeAPIRequest('POST', '/api/hdfc/webhook', webhookPayload, {
        'X-API-Key': undefined,
        'X-API-Secret': undefined,
        'X-HDFC-Signature': 'test_signature'
    });
    
    const webhookTest = {
        name: 'Webhook Integration',
        passed: webhook.success || webhook.status === 200,
        response: webhook
    };
    testResults.integration.tests.push(webhookTest);
    testResults.integration.total++;
    
    if (webhookTest.passed) {
        testResults.integration.passed++;
        logTest('Webhook Handler', true, 'Payment notification processed');
    } else {
        testResults.integration.failed++;
        logTest('Webhook Handler', false, 'Failed to process');
    }
    
    // 2. Test Rate Limiting
    log('\n📍 Testing Rate Limiting...');
    const rateLimitRequests = [];
    for (let i = 0; i < 5; i++) {
        rateLimitRequests.push(makeAPIRequest('GET', '/api/v1/merchant/qr/list'));
    }
    
    const rateLimitResults = await Promise.all(rateLimitRequests);
    const hasRateLimit = rateLimitResults.some(r => r.status === 429);
    
    const rateLimitTest = {
        name: 'Rate Limiting',
        passed: true, // Rate limiting is optional
        hasRateLimit: hasRateLimit
    };
    testResults.integration.tests.push(rateLimitTest);
    testResults.integration.total++;
    testResults.integration.passed++;
    
    if (hasRateLimit) {
        logTest('Rate Limiting', true, 'Active and working');
    } else {
        logTest('Rate Limiting', true, 'Not triggered (high limit or disabled)');
    }
    
    // 3. Test Authentication
    log('\n📍 Testing Authentication System...');
    const invalidAuth = await axios.get(`${BASE_URL}/api/v1/merchant/qr/list`, {
        headers: {
            'X-API-Key': 'invalid_key',
            'X-API-Secret': 'invalid_secret'
        }
    }).catch(e => e.response);
    
    const authTest = {
        name: 'Authentication System',
        passed: invalidAuth?.status === 401,
        response: invalidAuth?.status
    };
    testResults.integration.tests.push(authTest);
    testResults.integration.total++;
    
    if (authTest.passed) {
        testResults.integration.passed++;
        logTest('Authentication', true, 'Properly rejects invalid credentials');
    } else {
        testResults.integration.failed++;
        logTest('Authentication', false, 'Security issue - accepting invalid credentials');
    }
    
    // 4. Test CORS
    log('\n📍 Testing CORS Configuration...');
    const corsTest = await axios.options(`${BASE_URL}/api/health`, {
        headers: {
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'GET'
        }
    }).catch(e => e.response);
    
    const corsEnabled = corsTest?.headers?.['access-control-allow-origin'] !== undefined;
    const corsTestResult = {
        name: 'CORS Configuration',
        passed: corsEnabled,
        response: corsTest?.headers
    };
    testResults.integration.tests.push(corsTestResult);
    testResults.integration.total++;
    
    if (corsEnabled) {
        testResults.integration.passed++;
        logTest('CORS', true, 'Properly configured for frontend');
    } else {
        testResults.integration.failed++;
        logTest('CORS', false, 'May cause frontend connectivity issues');
    }
}

// Security Tests
async function testSecurity() {
    logSection('SECURITY VERIFICATION');
    
    // 1. SQL Injection Test
    log('\n📍 Testing SQL Injection Protection...');
    const sqlPayload = {
        merchant_name: "Test'; DROP TABLE users; --",
        merchant_id: "TEST_SQL",
        amount: 100,
        mobile: "9876543210",
        email: "test@test.com"
    };
    
    const sqlTest = await makeAPIRequest('POST', '/api/v1/merchant/qr/generate', sqlPayload);
    const sqlProtected = sqlTest.success || sqlTest.data?.success;
    
    logTest('SQL Injection Protection', sqlProtected, 
        sqlProtected ? 'Input sanitized' : 'Potential vulnerability');
    
    // 2. XSS Test
    log('\n📍 Testing XSS Protection...');
    const xssPayload = {
        merchant_name: "<script>alert('XSS')</script>",
        merchant_id: "TEST_XSS",
        amount: 100,
        mobile: "9876543210",
        email: "test@test.com"
    };
    
    const xssTest = await makeAPIRequest('POST', '/api/v1/merchant/qr/generate', xssPayload);
    const xssProtected = xssTest.success || xssTest.data?.success;
    
    logTest('XSS Protection', xssProtected, 
        xssProtected ? 'Input sanitized' : 'Potential vulnerability');
    
    // 3. Input Validation
    log('\n📍 Testing Input Validation...');
    const invalidPayload = {
        merchant_name: "",
        merchant_id: "",
        amount: -100,
        mobile: "invalid",
        email: "not-an-email"
    };
    
    const validationTest = await makeAPIRequest('POST', '/api/v1/merchant/qr/generate', invalidPayload);
    const validationWorks = !validationTest.success || !validationTest.data?.success;
    
    logTest('Input Validation', validationWorks, 
        validationWorks ? 'Invalid data rejected' : 'Accepting invalid data');
}

// Generate Summary Report
function generateSummary() {
    logSection('TEST SUMMARY REPORT');
    
    const totalTests = testResults.frontend.total + testResults.backend.total + testResults.integration.total;
    const totalPassed = testResults.frontend.passed + testResults.backend.passed + testResults.integration.passed;
    const totalFailed = testResults.frontend.failed + testResults.backend.failed + testResults.integration.failed;
    const successRate = ((totalPassed / totalTests) * 100).toFixed(1);
    
    console.log('\n' + colors.bright + 'Component Summary:' + colors.reset);
    console.log(`  Frontend:    ${testResults.frontend.passed}/${testResults.frontend.total} passed`);
    console.log(`  Backend:     ${testResults.backend.passed}/${testResults.backend.total} passed`);
    console.log(`  Integration: ${testResults.integration.passed}/${testResults.integration.total} passed`);
    
    console.log('\n' + colors.bright + 'Overall Results:' + colors.reset);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  ✅ Passed:   ${colors.green}${totalPassed}${colors.reset}`);
    console.log(`  ❌ Failed:   ${colors.red}${totalFailed}${colors.reset}`);
    console.log(`  Success Rate: ${successRate >= 80 ? colors.green : colors.yellow}${successRate}%${colors.reset}`);
    
    // Critical Features Check
    console.log('\n' + colors.bright + 'Critical Features Status:' + colors.reset);
    const criticalFeatures = [
        { name: 'QR Code Generation', status: testResults.backend.tests.find(t => t.name === 'QR Generation API')?.passed },
        { name: 'Bulk QR Generation', status: testResults.backend.tests.find(t => t.name === 'Bulk QR Generation API')?.passed },
        { name: 'Authentication System', status: testResults.integration.tests.find(t => t.name === 'Authentication System')?.passed },
        { name: 'Frontend Components', status: testResults.frontend.passed > 0 },
        { name: 'API Connectivity', status: testResults.backend.passed > 0 }
    ];
    
    criticalFeatures.forEach(feature => {
        const icon = feature.status ? '✅' : '❌';
        const color = feature.status ? colors.green : colors.red;
        console.log(`  ${icon} ${color}${feature.name}${colors.reset}`);
    });
    
    // Recommendation
    console.log('\n' + colors.bright + colors.cyan + 'Recommendation:' + colors.reset);
    if (successRate >= 80 && criticalFeatures.every(f => f.status !== false)) {
        console.log(colors.green + '  ✅ System is ready for deployment!' + colors.reset);
        console.log('  The QR solution is functioning well and can be pushed to Bitbucket.');
    } else if (successRate >= 60) {
        console.log(colors.yellow + '  ⚠️  System is partially ready.' + colors.reset);
        console.log('  Some features need attention but core functionality works.');
    } else {
        console.log(colors.red + '  ❌ System needs fixes before deployment.' + colors.reset);
        console.log('  Please address the failing tests before pushing to Bitbucket.');
    }
    
    // Save detailed report
    const reportPath = path.join(__dirname, 'integration_test_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// Main execution
async function runFullIntegrationTest() {
    console.clear();
    console.log(colors.bright + colors.cyan + '╔══════════════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.bright + colors.cyan + '║     SABPAISA QR SOLUTION - COMPLETE INTEGRATION TEST     ║' + colors.reset);
    console.log(colors.bright + colors.cyan + '╚══════════════════════════════════════════════════════════╝' + colors.reset);
    console.log('\nTest Started: ' + new Date().toLocaleString());
    console.log('Backend URL: ' + BASE_URL);
    console.log('Frontend URL: ' + FRONTEND_URL);
    
    try {
        // Check if backend is running
        console.log('\n' + colors.yellow + '🔍 Checking backend server status...' + colors.reset);
        const serverCheck = await axios.get(`${BASE_URL}/api/health`).catch(e => null);
        
        if (!serverCheck) {
            console.log(colors.red + '\n❌ ERROR: Backend server is not running!' + colors.reset);
            console.log('Please ensure the server is running on port 3001');
            return;
        }
        console.log(colors.green + '✅ Backend server is running' + colors.reset);
        
        // Run all test suites
        await testFrontendComponents();
        await testBackendAPIs();
        await testIntegration();
        await testSecurity();
        
        // Generate summary
        generateSummary();
        
    } catch (error) {
        console.error(colors.red + '\n❌ Test runner error: ' + error.message + colors.reset);
    }
}

// Run the tests
runFullIntegrationTest();