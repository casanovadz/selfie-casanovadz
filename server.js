const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middleware
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================
// Encryption Configuration
// ============================================
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'FORBES_SELFIE_KEY_2024_SECRET';
const ENCRYPTION_IV = process.env.ENCRYPTION_IV || 'FORBES_IV_2024_SECRET';

// ============================================
// In-memory storage (for demo purposes)
// ============================================
let selfieRecords = [];
let statusRecords = {};

// ============================================
// Helper Functions
// ============================================

// Generate unique ID
function generateId() {
    return 'FS_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Encryption function
function encryptData(text) {
    try {
        const cipher = crypto.createCipheriv('aes-256-cbc', 
            Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), 
            Buffer.from(ENCRYPTION_IV.padEnd(16).slice(0, 16))
        );
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        // Fallback to simple base64 encoding
        return Buffer.from(text).toString('base64');
    }
}

// Decryption function
function decryptData(encryptedText) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
            Buffer.from(ENCRYPTION_IV.padEnd(16).slice(0, 16))
        );
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        // Try base64 decoding as fallback
        try {
            return Buffer.from(encryptedText, 'base64').toString('utf8');
        } catch (e) {
            return null;
        }
    }
}

// ============================================
// API Endpoints
// ============================================

// 1. Root endpoint - Server status
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 Forbes Selfie Server is running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            test: '/api/test',
            encrypt: '/api/encrypt',
            saveSelfie: '/api/save-selfie',
            checkStatus: '/api/check-status',
            getResult: '/api/get-result',
            selfieLink: '/selfie/link'
        },
        stats: {
            total_records: selfieRecords.length,
            active_statuses: Object.keys(statusRecords).length
        }
    });
});

// 2. Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        message: 'Forbes Selfie Server is working ✅',
        server_time: new Date().toISOString(),
        uptime: process.uptime(),
        memory_usage: process.memoryUsage()
    });
});

// 3. Encrypt data
app.post('/api/encrypt', (req, res) => {
    try {
        const { data, action = 'encrypt' } = req.body;
        
        if (!data) {
            return res.status(400).json({
                success: false,
                message: 'Data parameter is required'
            });
        }
        
        if (action !== 'encrypt') {
            return res.status(400).json({
                success: false,
                message: 'Action must be "encrypt"'
            });
        }
        
        const encryptedData = encryptData(data);
        
        console.log('Encryption successful:', {
            original_length: data.length,
            encrypted_length: encryptedData.length,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            encrypted_data: encryptedData,
            original_length: data.length,
            encrypted_length: encryptedData.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Encryption endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Encryption failed',
            error: error.message
        });
    }
});

// 4. Save selfie data
app.post('/api/save-selfie', (req, res) => {
    try {
        const { 
            selfie_code, 
            client_name = 'unknown', 
            encrypted_code,
            source = 'forbes_extension' 
        } = req.body;
        
        if (!selfie_code || !encrypted_code) {
            return res.status(400).json({
                success: false,
                message: 'selfie_code and encrypted_code are required'
            });
        }
        
        const recordId = generateId();
        
        const record = {
            id: recordId,
            selfie_code,
            client_name,
            encrypted_code,
            source,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ip_address: req.ip || req.connection.remoteAddress,
            user_agent: req.get('User-Agent') || 'unknown'
        };
        
        // Save to memory
        selfieRecords.push(record);
        
        // Initialize status tracking
        statusRecords[selfie_code] = {
            status: 'pending',
            last_checked: new Date().toISOString(),
            attempts: 0,
            created_at: new Date().toISOString()
        };
        
        // Limit records to last 1000
        if (selfieRecords.length > 1000) {
            selfieRecords = selfieRecords.slice(-1000);
        }
        
        console.log('Selfie data saved:', {
            record_id: recordId,
            client_name,
            timestamp: record.created_at
        });
        
        res.json({
            success: true,
            record_id: recordId,
            message: 'Selfie data saved successfully',
            timestamp: record.created_at,
            selfie_code: selfie_code
        });
        
    } catch (error) {
        console.error('Save selfie error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save selfie data',
            error: error.message
        });
    }
});

// 5. Check selfie status
app.get('/api/check-status', (req, res) => {
    try {
        const { selfie_code } = req.query;
        
        if (!selfie_code) {
            return res.status(400).json({
                success: false,
                message: 'selfie_code parameter is required'
            });
        }
        
        const statusRecord = statusRecords[selfie_code];
        
        if (!statusRecord) {
            return res.json({
                success: false,
                message: 'Selfie code not found',
                status: 'not_found'
            });
        }
        
        // Update check attempts
        statusRecord.last_checked = new Date().toISOString();
        statusRecord.attempts = (statusRecord.attempts || 0) + 1;
        
        // Simulate status progression
        if (statusRecord.attempts < 3) {
            statusRecord.status = 'processing';
        } else if (statusRecord.attempts < 6) {
            statusRecord.status = 'ready';
        } else if (statusRecord.attempts < 9) {
            statusRecord.status = 'completed';
            // Generate result code
            if (!statusRecord.result_code) {
                statusRecord.result_code = 'RESULT_' + 
                    Math.random().toString(36).substr(2, 12).toUpperCase() + 
                    '_' + Date.now();
            }
        } else {
            statusRecord.status = 'failed';
        }
        
        // Find the record
        const record = selfieRecords.find(r => r.selfie_code === selfie_code);
        if (record) {
            record.status = statusRecord.status;
            record.updated_at = new Date().toISOString();
        }
        
        res.json({
            success: true,
            status: statusRecord.status,
            attempts: statusRecord.attempts,
            last_checked: statusRecord.last_checked,
            result_code: statusRecord.result_code,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Check status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check status',
            error: error.message
        });
    }
});

// 6. Get selfie result
app.get('/api/get-result', (req, res) => {
    try {
        const { selfie_code } = req.query;
        
        if (!selfie_code) {
            return res.status(400).json({
                success: false,
                message: 'selfie_code parameter is required'
            });
        }
        
        const statusRecord = statusRecords[selfie_code];
        
        if (!statusRecord) {
            return res.json({
                success: false,
                message: 'Selfie code not found'
            });
        }
        
        if (statusRecord.status !== 'completed') {
            return res.json({
                success: false,
                message: `Selfie is not completed yet. Current status: ${statusRecord.status}`,
                current_status: statusRecord.status
            });
        }
        
        res.json({
            success: true,
            result_code: statusRecord.result_code,
            status: statusRecord.status,
            attempts: statusRecord.attempts,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Get result error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get result',
            error: error.message
        });
    }
});

// 7. Selfie link page
app.get('/selfie/link', (req, res) => {
    try {
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Forbes Selfie - Error</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 50px;
                            text-align: center;
                            background: #f8f9fa;
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 10px;
                            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                            max-width: 600px;
                            margin: 0 auto;
                        }
                        h1 { color: #dc3545; }
                        .error { color: #dc3545; font-size: 18px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>❌ Error</h1>
                        <p class="error">No ID parameter provided</p>
                        <p>Please provide a valid ID in the URL.</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Try to decrypt the ID
        let decryptedData = null;
        try {
            decryptedData = decryptData(id);
        } catch (decryptError) {
            console.log('Decryption failed, using base64 fallback');
            try {
                decryptedData = Buffer.from(id, 'base64').toString('utf8');
            } catch (base64Error) {
                decryptedData = 'Could not decrypt data';
            }
        }
        
        // HTML response
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Forbes Selfie System</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .container {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    padding: 40px;
                    max-width: 800px;
                    width: 100%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    border: 1px solid rgba(255,255,255,0.2);
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                
                .header h1 {
                    color: #2c3e50;
                    font-size: 32px;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }
                
                .header h1 .checkmark {
                    color: #2ecc71;
                    font-size: 36px;
                }
                
                .subtitle {
                    color: #7f8c8d;
                    font-size: 18px;
                }
                
                .status-card {
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 25px;
                    border-left: 5px solid #3498db;
                }
                
                .status-item {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #eee;
                }
                
                .status-item:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                    padding-bottom: 0;
                }
                
                .label {
                    font-weight: 600;
                    color: #2c3e50;
                }
                
                .value {
                    color: #34495e;
                    font-family: monospace;
                    word-break: break-all;
                }
                
                .instructions {
                    background: #e8f4fc;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 30px 0;
                    border-left: 5px solid #2196f3;
                }
                
                .instructions h3 {
                    color: #0d47a1;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .instructions ol {
                    margin-left: 20px;
                    color: #37474f;
                }
                
                .instructions li {
                    margin-bottom: 10px;
                    line-height: 1.6;
                }
                
                .actions {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    flex-wrap: wrap;
                    margin-top: 30px;
                }
                
                .btn {
                    padding: 15px 30px;
                    border: none;
                    border-radius: 50px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    min-width: 200px;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
                    color: white;
                }
                
                .btn-primary:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 10px 20px rgba(76, 175, 80, 0.3);
                }
                
                .btn-secondary {
                    background: linear-gradient(135deg, #2196F3 0%, #0D47A1 100%);
                    color: white;
                }
                
                .btn-secondary:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 10px 20px rgba(33, 150, 243, 0.3);
                }
                
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    color: #95a5a6;
                    font-size: 14px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 25px;
                    }
                    
                    .header h1 {
                        font-size: 24px;
                    }
                    
                    .btn {
                        min-width: 100%;
                    }
                    
                    .actions {
                        flex-direction: column;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>
                        <span class="checkmark">✅</span>
                        Forbes Selfie System
                    </h1>
                    <p class="subtitle">Selfie verification link loaded successfully</p>
                </div>
                
                <div class="status-card">
                    <div class="status-item">
                        <span class="label">Status:</span>
                        <span class="value" style="color: #2ecc71; font-weight: bold;">Ready</span>
                    </div>
                    <div class="status-item">
                        <span class="label">Encrypted ID:</span>
                        <span class="value">${id.substring(0, 60)}...</span>
                    </div>
                    ${decryptedData ? `
                    <div class="status-item">
                        <span class="label">Decrypted Data:</span>
                        <span class="value">${decryptedData}</span>
                    </div>
                    ` : ''}
                    <div class="status-item">
                        <span class="label">Server Time:</span>
                        <span class="value">${new Date().toLocaleString()}</span>
                    </div>
                    <div class="status-item">
                        <span class="label">Request ID:</span>
                        <span class="value">${generateId()}</span>
                    </div>
                </div>
                
                <div class="instructions">
                    <h3>📋 Next Steps:</h3>
                    <ol>
                        <li>Complete the selfie verification process on your device</li>
                        <li>Wait for the verification to be processed</li>
                        <li>Return to the main application to continue</li>
                    </ol>
                </div>
                
                <div class="actions">
                    <button class="btn btn-primary" onclick="startSelfieProcess()">
                        <span>▶️</span> Start Selfie Process
                    </button>
                    <button class="btn btn-secondary" onclick="copyData()">
                        <span>📋</span> Copy Verification Data
                    </button>
                </div>
                
                <div class="footer">
                    <p>Forbes Selfie Verification System • Secure & Encrypted</p>
                    <p>Server: ${req.hostname} • Time: ${new Date().toLocaleTimeString()}</p>
                </div>
            </div>
            
            <script>
                function startSelfieProcess() {
                    const statusCard = document.querySelector('.status-card');
                    const statusItem = statusCard.querySelector('.status-item:first-child .value');
                    
                    statusItem.textContent = 'Processing...';
                    statusItem.style.color = '#f39c12';
                    
                    // Send data to parent window
                    const selfieData = {
                        encrypted_id: '${id}',
                        decrypted_data: '${decryptedData || ''}',
                        timestamp: '${new Date().toISOString()}'
                    };
                    
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'FORBES_SELFIE_DATA',
                            data: selfieData
                        }, '*');
                        
                        // Show success message after 2 seconds
                        setTimeout(() => {
                            statusItem.textContent = 'Started ✓';
                            statusItem.style.color = '#2ecc71';
                            alert('Selfie process started successfully! Return to the main application.');
                        }, 2000);
                    } else {
                        alert('Selfie process ready. Please return to the main application.');
                    }
                }
                
                function copyData() {
                    const data = \`Forbes Selfie Verification\\nEncrypted ID: ${id}\\nTime: ${new Date().toLocaleString()}\\nServer: ${req.hostname}\`;
                    
                    navigator.clipboard.writeText(data).then(() => {
                        alert('✅ Verification data copied to clipboard!');
                    }).catch(err => {
                        console.error('Copy failed:', err);
                        alert('⚠️ Could not copy to clipboard');
                    });
                }
                
                // Auto-start after 5 seconds
                setTimeout(() => {
                    console.log('Auto-starting selfie process...');
                }, 5000);
                
                console.log('Forbes Selfie System loaded successfully');
                console.log('Encrypted ID:', '${id}');
                console.log('Decrypted Data:', '${decryptedData}');
            </script>
        </body>
        </html>
        `;
        
        res.send(html);
        
    } catch (error) {
        console.error('Selfie link error:', error);
        res.status(500).send(`
            <html>
                <body style="font-family: Arial; padding: 50px; text-align: center;">
                    <h1 style="color: #dc3545;">❌ Server Error</h1>
                    <p>Error: ${error.message}</p>
                    <p>Please try again or contact support.</p>
                </body>
            </html>
        `);
    }
});

// ============================================
// Error handling middleware
// ============================================
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        requested_url: req.originalUrl,
        method: req.method,
        available_endpoints: [
            'GET /',
            'GET /api/test',
            'POST /api/encrypt',
            'POST /api/save-selfie',
            'GET /api/check-status',
            'GET /api/get-result',
            'GET /selfie/link'
        ]
    });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'production' ? null : err.message,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// Start the server
// ============================================
app.listen(PORT, () => {
    console.log(`
    🚀 Forbes Selfie Server started successfully!
    ===========================================
    📡 Local: http://localhost:${PORT}
    🌍 Environment: ${process.env.NODE_ENV || 'development'}
    ⏰ Time: ${new Date().toISOString()}
    📊 Ready to accept connections...
    ===========================================
    `);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});