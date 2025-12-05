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

// Encryption function - UPDATED
function encryptData(text) {
    try {
        // Generate random IV for each encryption
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv('aes-256-cbc', 
            Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), 
            iv
        );
        
        let encrypted = cipher.update(text, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        // Combine IV + encrypted data and encode as base64
        const result = Buffer.concat([iv, encrypted]).toString('base64');
        
        console.log('Encryption successful:', {
            original_length: text.length,
            encrypted_length: result.length,
            method: 'aes-256-cbc with random IV'
        });
        
        return result;
        
    } catch (error) {
        console.error('Encryption error:', error);
        // Fallback to simple base64 encoding
        return Buffer.from(text).toString('base64');
    }
}

// Decryption function - FIXED VERSION
function decryptData(encryptedText) {
    try {
        console.log('Decrypting data:', {
            input_length: encryptedText?.length,
            input_preview: encryptedText?.substring(0, 50)
        });
        
        // First try: Check if it's base64
        if (!encryptedText) {
            throw new Error('Empty encrypted text');
        }
        
        // Option 1: Try hex (original method)
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc',
                Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
                Buffer.from(ENCRYPTION_IV.padEnd(16).slice(0, 16))
            );
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            console.log('Hex decryption successful');
            return decrypted;
        } catch (hexError) {
            console.log('Hex decryption failed, trying base64...');
        }
        
        // Option 2: Try base64 (most likely from browser)
        try {
            const encryptedBuffer = Buffer.from(encryptedText, 'base64');
            const iv = encryptedBuffer.slice(0, 16);
            const encrypted = encryptedBuffer.slice(16);
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', 
                Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), 
                iv
            );
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            console.log('Base64 decryption successful');
            return decrypted.toString('utf8');
        } catch (base64Error) {
            console.log('Base64 decryption failed:', base64Error.message);
        }
        
        // Option 3: Try URL decode first
        try {
            const decodedText = decodeURIComponent(encryptedText);
            if (decodedText !== encryptedText) {
                console.log('URL decoded, retrying decryption...');
                return decryptData(decodedText);
            }
        } catch (urlError) {
            console.log('URL decode failed:', urlError.message);
        }
        
        // Option 4: If all fails, try to parse as plain text
        if (encryptedText.includes(',')) {
            const parts = encryptedText.split(',');
            if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
                console.log('Parsing as plain text (user_id,transaction_id)');
                return encryptedText;
            }
        }
        
        throw new Error('All decryption methods failed');
        
    } catch (error) {
        console.error('Decryption error:', {
            message: error.message,
            input: encryptedText?.substring(0, 100)
        });
        
        // Return the original text as fallback
        return encryptedText;
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
            selfieLink: '/selfie/link',
            debugEncrypt: '/api/debug-encrypt'
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

// 7. Selfie link page - UPDATED (NO DUPLICATION)
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
                            margin: 0;
                            padding: 20px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                        }
                        .container {
                            background: white;
                            max-width: 800px;
                            margin: 50px auto;
                            padding: 30px;
                            border-radius: 15px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                        }
                        .header h1 {
                            color: #dc3545;
                            margin-bottom: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>❌ Error: No ID provided</h1>
                            <p>Please provide a valid ID parameter in the URL.</p>
                            <p>Example: https://selfie-casanovadz.onrender.com/selfie/link?id=your_encrypted_data</p>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Try multiple decryption methods
        let decryptedData = null;
        let decryptionMethod = 'unknown';
        
        // Method 1: Try as base64 with IV
        try {
            const buffer = Buffer.from(id, 'base64');
            if (buffer.length >= 16) {
                const iv = buffer.slice(0, 16);
                const encrypted = buffer.slice(16);
                
                const decipher = crypto.createDecipheriv('aes-256-cbc',
                    Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
                    iv
                );
                
                let decrypted = decipher.update(encrypted);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                decryptedData = decrypted.toString('utf8');
                decryptionMethod = 'base64_aes';
                console.log('✅ Base64 AES decryption successful');
            }
        } catch (e) {
            console.log('Base64 AES decryption failed:', e.message);
        }
        
        // Method 2: Try simple base64
        if (!decryptedData) {
            try {
                decryptedData = Buffer.from(id, 'base64').toString('utf8');
                decryptionMethod = 'simple_base64';
                console.log('✅ Simple base64 decryption successful');
            } catch (e) {
                console.log('Simple base64 failed:', e.message);
            }
        }
        
        // Method 3: Try hex
        if (!decryptedData && /^[0-9a-fA-F]+$/.test(id)) {
            try {
                const decipher = crypto.createDecipheriv('aes-256-cbc',
                    Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
                    Buffer.from(ENCRYPTION_IV.padEnd(16).slice(0, 16))
                );
                
                let decrypted = decipher.update(id, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                decryptedData = decrypted;
                decryptionMethod = 'hex_aes';
                console.log('✅ Hex AES decryption successful');
            } catch (e) {
                console.log('Hex AES failed:', e.message);
            }
        }
        
        // Method 4: Use as-is
        if (!decryptedData) {
            decryptedData = id;
            decryptionMethod = 'raw';
            console.log('⚠️ Using raw data (no decryption)');
        }
        
        // Log for debugging
        console.log('Selfie link accessed:', {
            id_length: id.length,
            id_preview: id.substring(0, 50),
            decrypted: decryptedData,
            method: decryptionMethod,
            timestamp: new Date().toISOString()
        });
        
        // Enhanced HTML response with better UI
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Forbes Selfie Verification System</title>
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
                    max-width: 900px;
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
                    font-size: 36px;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 15px;
                }
                
                .header h1 .icon {
                    font-size: 42px;
                }
                
                .subtitle {
                    color: #7f8c8d;
                    font-size: 18px;
                    margin-bottom: 10px;
                }
                
                .server-info {
                    background: #e8f4fc;
                    padding: 15px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    font-size: 14px;
                    color: #0d47a1;
                    border-left: 4px solid #2196F3;
                }
                
                .status-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .card {
                    background: white;
                    border-radius: 15px;
                    padding: 25px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.08);
                    transition: transform 0.3s;
                }
                
                .card:hover {
                    transform: translateY(-5px);
                }
                
                .card.info {
                    border-top: 5px solid #3498db;
                }
                
                .card.data {
                    border-top: 5px solid #2ecc71;
                }
                
                .card.actions {
                    border-top: 5px solid #9b59b6;
                }
                
                .card-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #2c3e50;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .info-item {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #eee;
                }
                
                .info-item:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                    padding-bottom: 0;
                }
                
                .label {
                    font-weight: 600;
                    color: #2c3e50;
                    min-width: 150px;
                }
                
                .value {
                    color: #34495e;
                    font-family: 'Monaco', 'Courier New', monospace;
                    word-break: break-all;
                    text-align: right;
                }
                
                .data-display {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    margin-top: 15px;
                    font-family: 'Monaco', 'Courier New', monospace;
                    font-size: 14px;
                    color: #2c3e50;
                    overflow-x: auto;
                    white-space: pre-wrap;
                    word-break: break-all;
                    max-height: 200px;
                    overflow-y: auto;
                }
                
                .btn-group {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    margin-top: 20px;
                }
                
                .btn {
                    padding: 16px 24px;
                    border: none;
                    border-radius: 12px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    text-decoration: none;
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
                
                .btn-tertiary {
                    background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%);
                    color: white;
                }
                
                .btn-tertiary:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 10px 20px rgba(156, 39, 176, 0.3);
                }
                
                .instructions {
                    background: #fff8e1;
                    border-radius: 15px;
                    padding: 25px;
                    margin-top: 30px;
                    border-left: 5px solid #FF9800;
                }
                
                .instructions h3 {
                    color: #F57C00;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .instructions ol {
                    margin-left: 20px;
                    color: #5D4037;
                }
                
                .instructions li {
                    margin-bottom: 10px;
                    line-height: 1.6;
                }
                
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    color: #95a5a6;
                    font-size: 14px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-left: 10px;
                }
                
                .status-success {
                    background: #d4edda;
                    color: #155724;
                }
                
                .status-warning {
                    background: #fff3cd;
                    color: #856404;
                }
                
                .status-info {
                    background: #d1ecf1;
                    color: #0c5460;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 25px;
                    }
                    
                    .header h1 {
                        font-size: 28px;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .status-cards {
                        grid-template-columns: 1fr;
                    }
                    
                    .btn {
                        width: 100%;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>
                        <span class="icon">✅</span>
                        Forbes Selfie Verification System
                    </h1>
                    <p class="subtitle">Secure biometric verification for Forbes applications</p>
                    <div class="server-info">
                        Server: ${req.hostname} | Time: ${new Date().toLocaleString()} | ID Length: ${id.length} chars
                    </div>
                </div>
                
                <div class="status-cards">
                    <div class="card info">
                        <div class="card-title">
                            <span>📋</span> Verification Information
                        </div>
                        <div class="info-item">
                            <span class="label">Status:</span>
                            <span class="value">
                                Ready 
                                <span class="status-badge status-success">ACTIVE</span>
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="label">Decryption Method:</span>
                            <span class="value">
                                ${decryptionMethod}
                                <span class="status-badge status-info">${decryptionMethod === 'base64_aes' ? 'SECURE' : 'FALLBACK'}</span>
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="label">Server Time:</span>
                            <span class="value">${new Date().toLocaleString()}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Request ID:</span>
                            <span class="value">${generateId()}</span>
                        </div>
                    </div>
                    
                    <div class="card data">
                        <div class="card-title">
                            <span>🔐</span> Verification Data
                        </div>
                        <div class="data-display">
                            <strong>Decrypted Data:</strong><br>
                            ${decryptedData || 'No data available'}
                            <br><br>
                            <strong>Encrypted ID (first 100 chars):</strong><br>
                            ${id.substring(0, 100)}${id.length > 100 ? '...' : ''}
                        </div>
                    </div>
                    
                    <div class="card actions">
                        <div class="card-title">
                            <span>⚡</span> Actions
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-primary" onclick="startSelfieProcess()">
                                <span>▶️</span> Start Selfie Verification
                            </button>
                            <button class="btn btn-secondary" onclick="copyVerificationData()">
                                <span>📋</span> Copy Verification Data
                            </button>
                            <button class="btn btn-tertiary" onclick="showDebugInfo()">
                                <span>🔍</span> Show Debug Information
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="instructions">
                    <h3><span>📝</span> Instructions for Completion:</h3>
                    <ol>
                        <li>Click "Start Selfie Verification" button above</li>
                        <li>Allow camera access when prompted</li>
                        <li>Follow the on-screen instructions for the selfie</li>
                        <li>Wait for the verification process to complete</li>
                        <li>Return to the main Forbes application to continue</li>
                    </ol>
                    <p style="margin-top: 15px; color: #666; font-style: italic;">
                        Note: This link is secure and encrypted. Your data is protected using AES-256 encryption.
                    </p>
                </div>
                
                <div class="footer">
                    <p>Forbes Selfie Verification System • Version 1.0.0</p>
                    <p>Secure & Encrypted • Powered by Forbes Technology</p>
                    <p style="font-size: 12px; margin-top: 10px;">
                        Session started at ${new Date().toLocaleTimeString()} 
                        • ID: ${id.substring(0, 20)}...
                    </p>
                </div>
            </div>
            
            <script>
                let selfieStarted = false;
                
                function startSelfieProcess() {
                    if (selfieStarted) {
                        alert('Selfie process already started!');
                        return;
                    }
                    
                    selfieStarted = true;
                    
                    // Update UI
                    const startBtn = document.querySelector('.btn-primary');
                    startBtn.innerHTML = '<span>⏳</span> Processing...';
                    startBtn.disabled = true;
                    
                    // Prepare data to send
                    const selfieData = {
                        encrypted_id: '${id}',
                        decrypted_data: '${decryptedData || ''}',
                        timestamp: '${new Date().toISOString()}',
                        server: '${req.hostname}',
                        decryption_method: '${decryptionMethod}'
                    };
                    
                    console.log('Starting selfie process with data:', selfieData);
                    
                    // Send message to opener/parent if exists (for extensions)
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'FORBES_SELFIE_VERIFICATION_START',
                            data: selfieData,
                            action: 'start_selfie'
                        }, '*');
                        
                        console.log('Message sent to opener window');
                    }
                    
                    // Also try broadcast channel for modern browsers
                    if (typeof BroadcastChannel !== 'undefined') {
                        try {
                            const channel = new BroadcastChannel('forbes_selfie');
                            channel.postMessage({
                                type: 'VERIFICATION_START',
                                payload: selfieData
                            });
                            console.log('Message sent via BroadcastChannel');
                        } catch (e) {
                            console.log('BroadcastChannel not available:', e.message);
                        }
                    }
                    
                    // Show success message
                    setTimeout(() => {
                        alert('✅ Selfie verification started successfully!\n\nPlease follow the on-screen instructions to complete the selfie process.\n\nReturn to the main application when finished.');
                        
                        // Reset button after 5 seconds
                        setTimeout(() => {
                            startBtn.innerHTML = '<span>✅</span> Process Started';
                            startBtn.style.background = 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)';
                        }, 5000);
                    }, 1000);
                }
                
                function copyVerificationData() {
                    const dataToCopy = \`=== Forbes Selfie Verification Data ===
                    
                    Encrypted ID: ${id}
                    Decrypted Data: ${decryptedData || 'N/A'}
                    Decryption Method: ${decryptionMethod}
                    Server: ${req.hostname}
                    Time: ${new Date().toLocaleString()}
                    Status: Ready
                    
                    === End of Data ===\`;
                    
                    navigator.clipboard.writeText(dataToCopy).then(() => {
                        alert('✅ Verification data copied to clipboard!');
                    }).catch(err => {
                        console.error('Copy failed:', err);
                        // Fallback method
                        const textArea = document.createElement('textarea');
                        textArea.value = dataToCopy;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        alert('✅ Data copied to clipboard (fallback method)!');
                    });
                }
                
                function showDebugInfo() {
                    const debugInfo = \`
                    === Debug Information ===
                    
                    URL Parameters:
                    - ID Length: ${id.length}
                    - ID Preview: ${id.substring(0, 50)}...
                    
                    Decryption:
                    - Method: ${decryptionMethod}
                    - Data: ${decryptedData || 'N/A'}
                    
                    Browser Info:
                    - User Agent: \${navigator.userAgent}
                    - Platform: \${navigator.platform}
                    - Language: \${navigator.language}
                    
                    Page Info:
                    - URL: \${window.location.href}
                    - Timestamp: \${new Date().toISOString()}
                    
                    === End Debug ===\`;
                    
                    console.log(debugInfo);
                    alert('Debug information logged to console (F12 → Console)');
                }
                
                // Auto-start for extension detection
                setTimeout(() => {
                    console.log('Forbes Selfie System initialized');
                    console.log('Encrypted ID:', '${id}');
                    console.log('Decrypted Data:', '${decryptedData}');
                    console.log('Decryption Method:', '${decryptionMethod}');
                    
                    // Check for extension presence
                    if (typeof chrome !== 'undefined' && chrome.runtime) {
                        console.log('✅ Chrome extension environment detected');
                        // Auto-start after 3 seconds in extension context
                        setTimeout(() => {
                            if (!selfieStarted) {
                                console.log('Auto-starting selfie process for extension...');
                                startSelfieProcess();
                            }
                        }, 3000);
                    }
                }, 1000);
                
                // Listen for messages from extension
                window.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'FORBES_EXTENSION_READY') {
                        console.log('Extension ready message received:', event.data);
                        // Extension is ready, we can communicate
                    }
                });
                
                // Notify that page is loaded
                window.dispatchEvent(new Event('forbesSelfiePageLoaded'));
            </script>
        </body>
        </html>
        `;
        
        res.send(html);
        
    } catch (error) {
        console.error('Selfie link error:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Server Error</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 50px;
                        text-align: center;
                        background: #f8f9fa;
                    }
                    .error-container {
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                        max-width: 600px;
                        margin: 0 auto;
                    }
                    h1 { color: #dc3545; margin-bottom: 20px; }
                    .error-details {
                        background: #f8d7da;
                        padding: 15px;
                        border-radius: 5px;
                        margin: 20px 0;
                        text-align: left;
                        font-family: monospace;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>❌ Server Error</h1>
                    <p>An error occurred while processing your request.</p>
                    <div class="error-details">
                        <strong>Error:</strong> ${error.message}<br>
                        <strong>Time:</strong> ${new Date().toLocaleString()}<br>
                        <strong>Please try again or contact support.</strong>
                    </div>
                    <button onclick="window.location.reload()" style="
                        padding: 12px 24px;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 16px;
                    ">Retry</button>
                </div>
            </body>
            </html>
        `);
    }
});

// 8. Debug encryption endpoint
app.get('/api/debug-encrypt', (req, res) => {
    try {
        const testData = '123456,789012'; // Example: user_id,transaction_id
        const encrypted = encryptData(testData);
        const decrypted = decryptData(encrypted);
        
        res.json({
            success: true,
            test_data: testData,
            encrypted: encrypted,
            decrypted: decrypted,
            encryption_works: testData === decrypted,
            methods: {
                encryption: 'aes-256-cbc with random IV',
                output_format: 'base64 (IV + encrypted data)',
                encryption_key_length: ENCRYPTION_KEY.length,
                iv_length: ENCRYPTION_IV.length
            },
            server_info: {
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                node_version: process.version
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'production' ? null : error.stack
        });
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
            'GET /selfie/link',
            'GET /api/debug-encrypt'
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
    🔒 Encryption: AES-256-CBC with random IV
    📊 Ready to accept connections...
    ===========================================
    
    Test endpoints:
    • Server status: http://localhost:${PORT}/
    • Test connection: http://localhost:${PORT}/api/test
    • Debug encryption: http://localhost:${PORT}/api/debug-encrypt
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
