#!/usr/bin/env node

/**
 * Health Check Test Script
 * Tests all health endpoints to ensure they're working correctly
 */

const http = require('http');

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

const endpoints = [
    { path: '/health', name: 'Basic Health Check' },
    { path: '/health/detailed', name: 'Detailed Health Check' },
    { path: '/live', name: 'Liveness Probe' },
    { path: '/ready', name: 'Readiness Probe' },
    { path: '/startup', name: 'Startup Probe' },
    { path: '/metrics', name: 'Metrics Endpoint' }
];

console.log('=====================================');
console.log('Health Check Endpoint Testing');
console.log('=====================================');
console.log(`Testing server at: http://${HOST}:${PORT}`);
console.log('');

let allPassed = true;

async function testEndpoint(endpoint) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const options = {
            hostname: HOST,
            port: PORT,
            path: endpoint.path,
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const duration = Date.now() - startTime;
                const passed = res.statusCode === 200 || res.statusCode === 503;
                
                console.log(`[${passed ? '✓' : '✗'}] ${endpoint.name}`);
                console.log(`    Path: ${endpoint.path}`);
                console.log(`    Status: ${res.statusCode}`);
                console.log(`    Response Time: ${duration}ms`);
                
                try {
                    const json = JSON.parse(data);
                    console.log(`    Response: ${JSON.stringify(json).substring(0, 100)}...`);
                } catch (e) {
                    console.log(`    Response: ${data.substring(0, 100)}...`);
                }
                console.log('');
                
                resolve(passed);
            });
        });

        req.on('error', (error) => {
            console.log(`[✗] ${endpoint.name}`);
            console.log(`    Path: ${endpoint.path}`);
            console.log(`    Error: ${error.message}`);
            console.log('');
            resolve(false);
        });

        req.on('timeout', () => {
            console.log(`[✗] ${endpoint.name}`);
            console.log(`    Path: ${endpoint.path}`);
            console.log(`    Error: Request timeout (5s)`);
            console.log('');
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

async function runTests() {
    // First check if server is running
    const serverCheck = await testEndpoint({ path: '/health', name: 'Server Connectivity' });
    
    if (!serverCheck) {
        console.log('=====================================');
        console.log('❌ Server is not running!');
        console.log('=====================================');
        console.log('Please start the server with:');
        console.log('  npm start');
        console.log('or');
        console.log('  node server.js');
        process.exit(1);
    }

    // Test all endpoints
    for (const endpoint of endpoints) {
        const passed = await testEndpoint(endpoint);
        if (!passed && endpoint.path !== '/startup') {
            allPassed = false;
        }
    }

    // Summary
    console.log('=====================================');
    if (allPassed) {
        console.log('✅ All health checks passed!');
    } else {
        console.log('⚠️  Some health checks failed');
        console.log('This might be expected if certain services are not configured.');
    }
    console.log('=====================================');

    // Test root redirect
    console.log('\nTesting root redirect to /health...');
    const rootOptions = {
        hostname: HOST,
        port: PORT,
        path: '/',
        method: 'GET',
        timeout: 5000,
        followRedirect: false
    };

    const rootReq = http.request(rootOptions, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
            console.log('✅ Root redirect working (redirects to /health)');
        } else {
            console.log(`⚠️  Root returned status ${res.statusCode} instead of redirect`);
        }
        console.log('\n=====================================');
        console.log('Testing complete!');
        console.log('=====================================');
    });

    rootReq.on('error', (error) => {
        console.log('✗ Root redirect test failed:', error.message);
    });

    rootReq.end();
}

// Run the tests
runTests();