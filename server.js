// =========================================================
// Forbes-Selfie Server – نسخة OzLiveness الكاملة
// =========================================================
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- Middleware --------------------
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// -------------------- Encryption --------------------
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'FORBES_SELFIE_KEY_2024_SECRET';
const ENCRYPTION_IV  = process.env.ENCRYPTION_IV  || 'FORBES_IV_2024_SECRET';

let selfieRecords = [];   // in-mem
let statusRecords = {};   // in-mem
let dataStorage = {};     // تخزين البيانات المؤقتة
let sessionStorage = {};  // تخزين الجلسات

// رابط BLS الثابت
const BLS_LIVENESS_URL = 'https://algeria.blsspainglobal.com/dza/appointment/livenessrequest';

// -------------------- Utils --------------------
function generateId() {
    return 'FS_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function encryptData(text) {
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
        let enc = cipher.update(text, 'utf8');
        enc = Buffer.concat([enc, cipher.final()]);
        return Buffer.concat([iv, enc]).toString('base64');
    } catch (e) {
        console.error('Encrypt error:', e);
        return Buffer.from(text).toString('base64');
    }
}

function decryptData(b64) {
    if (!b64) return null;
    try {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 32) throw new Error('short');
        const iv   = buf.slice(0, 16);
        const data = buf.slice(16);
        const dec  = crypto.createDecipheriv('aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
        let out = dec.update(data);
        out = Buffer.concat([out, dec.final()]);
        return out.toString('utf8');
    } catch (e) {
        console.log('Base64 AES fail:', e.message);
        return b64;          // fallback
    }
}

// -------------------- API Endpoints الرئيسية --------------------
app.get('/', (_, res) => res.json({
    success: true, 
    message: '🚀 Forbes Selfie Server is running',
    version: '3.0.0', 
    timestamp: new Date().toISOString(),
    endpoints: {
        test: '/api/test',
        encrypt: '/api/encrypt',
        saveSelfie: '/api/save-selfie',
        checkStatus: '/api/check-status',
        getResult: '/api/get-result',
        selfieLink: '/selfie/link',
        debugEncrypt: '/api/debug-encrypt',
        storeData: '/api/store-data',
        checkSelfieStatus: '/api/check-selfie-status',
        openBls: '/open-bls',
        blsSession: '/bls-session',
        directLiveness: '/direct-liveness',
        storeSession: '/api/store-session',
        getSession: '/api/get-session'
    }
}));

app.get('/api/test', (_, res) => res.json({
    success: true, 
    status: 'ok', 
    message: 'Forbes Selfie Server is working ✅',
    server_time: new Date().toISOString(), 
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    sessions_count: Object.keys(sessionStorage).length,
    data_storage_count: Object.keys(dataStorage).length
}));

// -------------------- إدارة الجلسات --------------------
// تخزين جلسة BLS
app.post('/api/store-session', (req, res) => {
    try {
        const { session_data } = req.body;
        
        if (!session_data) {
            return res.status(400).json({ 
                success: false, 
                message: 'Session data required' 
            });
        }
        
        const sessionId = 'SESS_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
        
        // تخزين الجلسة
        sessionStorage[sessionId] = {
            ...session_data,
            stored_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + (30 * 60 * 1000)).toISOString() // 30 دقيقة
        };
        
        // تنظيف الجلسات القديمة
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        Object.keys(sessionStorage).forEach(key => {
            if (sessionStorage[key].stored_at && 
                new Date(sessionStorage[key].stored_at).getTime() < oneDayAgo) {
                delete sessionStorage[key];
            }
        });
        
        res.json({
            success: true,
            session_id: sessionId,
            message: 'Session stored successfully',
            expires_in: '30 minutes'
        });
        
    } catch (e) {
        res.status(500).json({ 
            success: false, 
            message: 'Session storage failed', 
            error: e.message 
        });
    }
});

// استرجاع جلسة BLS
app.get('/api/get-session', (req, res) => {
    try {
        const { session_id } = req.query;
        
        if (!session_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Session ID required' 
            });
        }
        
        const session = sessionStorage[session_id];
        
        if (!session) {
            return res.json({ 
                success: false, 
                message: 'Session not found or expired' 
            });
        }
        
        // التحقق من انتهاء الصلاحية
        if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
            delete sessionStorage[session_id];
            return res.json({ 
                success: false, 
                message: 'Session expired' 
            });
        }
        
        res.json({
            success: true,
            session_id: session_id,
            session_data: session,
            is_valid: true
        });
        
    } catch (e) {
        res.status(500).json({ 
            success: false, 
            message: 'Get session failed', 
            error: e.message 
        });
    }
});

// تخزين بيانات السيلفي المباشر
app.post('/api/store-liveness-data', (req, res) => {
    try {
        const { form_data, page_url } = req.body;
        
        if (!form_data) {
            return res.status(400).json({ 
                success: false, 
                message: 'Form data required' 
            });
        }
        
        const dataId = 'LIV_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
        
        // تخزين البيانات
        dataStorage[dataId] = {
            form_data: form_data,
            page_url: page_url || 'https://algeria.blsspainglobal.com/dza/appointment/livenessrequest',
            stored_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + (60 * 60 * 1000)).toISOString() // ساعة واحدة
        };
        
        res.json({
            success: true,
            data_id: dataId,
            message: 'Liveness data stored successfully',
            expires_in: '1 hour'
        });
        
    } catch (e) {
        res.status(500).json({ 
            success: false, 
            message: 'Data storage failed', 
            error: e.message 
        });
    }
});

// صفحة الجلسة
app.get('/bls-session', (req, res) => {
    try {
        const { session_id, return_url } = req.query;
        
        if (!session_id) {
            return res.status(400).send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2 style="color: #F44336;">❌ معرّف الجلسة مطلوب</h2>
                    <p>يرجى توفير معرّف الجلسة في الرابط</p>
                </body>
                </html>
            `);
        }
        
        const session = sessionStorage[session_id];
        
        if (!session) {
            return res.send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2 style="color: #F44336;">❌ الجلسة غير موجودة أو منتهية الصلاحية</h2>
                    <p>يرجى إنشاء جلسة جديدة من صفحة المدير</p>
                    <a href="${return_url || 'https://algeria.blsspainglobal.com'}" 
                       style="color: #2196F3; text-decoration: none; padding: 10px 20px; background: #E3F2FD; border-radius: 5px;">
                       العودة للصفحة الرئيسية
                    </a>
                </body>
                </html>
            `);
        }
        
        const targetUrl = session.page_url || 'https://algeria.blsspainglobal.com';
        
        // صفحة الجلسة مع إعادة التوجيه
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>BLS Session Handler</title>
            <meta http-equiv="refresh" content="3;url=${targetUrl}">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    max-width: 500px;
                    width: 90%;
                }
                .loader {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 20px auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .info {
                    background: #f5f5f5;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    font-size: 14px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2 style="color: #4CAF50;">✅ جلسة BLS جاهزة</h2>
                <div class="info">
                    <strong>معلومات الجلسة:</strong><br>
                    معرف الجلسة: ${session_id.substring(0, 20)}...<br>
                    وقت التخزين: ${new Date(session.stored_at).toLocaleString('ar-SA')}
                </div>
                <div class="loader"></div>
                <p>جاري التوجيه إلى صفحة BLS...</p>
                <p style="font-size: 12px; color: #666;">
                    <a href="${targetUrl}" target="_blank" style="color: #2196F3;">
                        انقر هنا إذا لم يتم التوجيه تلقائياً
                    </a>
                </p>
            </div>
            <script>
                // محاولة فتح الصفحة في نافذة جديدة
                setTimeout(() => {
                    window.open('${targetUrl}', '_blank');
                }, 1000);
            </script>
        </body>
        </html>
        `;
        
        res.send(html);
        
    } catch (e) {
        res.status(500).send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h2 style="color: #F44336;">❌ خطأ في الجلسة</h2>
                <p>${e.message}</p>
            </body>
            </html>
        `);
    }
});

// صفحة السيلفي المباشر
app.get('/direct-liveness', (req, res) => {
    try {
        const { data_id } = req.query;
        
        if (!data_id) {
            return res.status(400).send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2 style="color: #F44336;">❌ معرّف البيانات مطلوب</h2>
                    <p>يرجى توفير معرّف البيانات في الرابط</p>
                </body>
                </html>
            `);
        }
        
        const data = dataStorage[data_id];
        
        if (!data || !data.form_data) {
            return res.send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2 style="color: #F44336;">❌ البيانات غير موجودة</h2>
                    <p>يرجى إنشاء رابط جديد من صفحة المدير</p>
                </body>
                </html>
            `);
        }
        
        // إنشاء صفحة HTML مع بيانات الفورم
        const formData = data.form_data;
        const formFields = Object.keys(formData)
            .map(key => {
                if (key === '__RequestVerificationToken') {
                    return `<input type="hidden" name="${key}" value="${formData[key]}" />`;
                }
                return `<input type="hidden" id="${key}" name="${key}" value="${formData[key]}" />`;
            })
            .join('\n');
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>BLS Liveness Verification</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: #f0f2f5;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .info-box {
                    background: #e3f2fd;
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                    font-size: 14px;
                    color: #1565c0;
                }
                .btn {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    transition: background 0.3s;
                }
                .btn:hover {
                    background: #45a049;
                }
                .btn-secondary {
                    background: #2196F3;
                }
                .btn-secondary:hover {
                    background: #1976d2;
                }
                .countdown {
                    font-size: 24px;
                    font-weight: bold;
                    color: #4CAF50;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2 style="color: #2c3e50;">📸 تحقق بالصورة (Liveness Detection)</h2>
                    <p style="color: #7f8c8d;">BLS International - Spain Visa Application</p>
                </div>
                
                <div class="info-box">
                    <strong>⚠️ تنبيه:</strong> هذا النموذج تم تحميله تلقائياً من جلسة المدير
                </div>
                
                <form id="livenessForm" method="post" action="https://algeria.blsspainglobal.com/dza/appointment/livenessrequest">
                    ${formFields}
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <div class="countdown" id="countdown">5</div>
                        <p style="margin-bottom: 20px; color: #666;">
                            سيتم إرسال النموذج تلقائياً خلال <span id="seconds">5</span> ثوانٍ
                        </p>
                        <button type="button" onclick="submitFormNow()" class="btn">
                            🚀 إرسال الآن
                        </button>
                        <br><br>
                        <button type="button" onclick="window.close()" class="btn btn-secondary">
                            ✕ إغلاق الصفحة
                        </button>
                    </div>
                </form>
            </div>
            
            <script>
                // العد التنازلي
                let countdown = 5;
                const countdownEl = document.getElementById('countdown');
                const secondsEl = document.getElementById('seconds');
                
                const countdownInterval = setInterval(() => {
                    countdown--;
                    countdownEl.textContent = countdown;
                    secondsEl.textContent = countdown;
                    
                    if (countdown <= 0) {
                        clearInterval(countdownInterval);
                        submitFormNow();
                    }
                }, 1000);
                
                function submitFormNow() {
                    clearInterval(countdownInterval);
                    document.getElementById('livenessForm').submit();
                }
                
                // الإرسال التلقائي بعد 5 ثوانٍ
                setTimeout(() => {
                    if (countdown > 0) {
                        submitFormNow();
                    }
                }, 5000);
            </script>
        </body>
        </html>
        `;
        
        res.send(html);
        
    } catch (e) {
        res.status(500).send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h2 style="color: #F44336;">❌ خطأ في تحميل البيانات</h2>
                <p>${e.message}</p>
            </body>
            </html>
        `);
    }
});

// -------------------- نقاط النهاية الأساسية --------------------
app.post('/api/encrypt', (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return res.status(400).json({ success: false, message: 'data required' });
        const enc = encryptData(data);
        res.json({ success: true, encrypted_data: enc, original_length: data.length, encrypted_length: enc.length });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Encryption failed', error: e.message });
    }
});

// تخزين البيانات المؤقتة
app.post('/api/store-data', (req, res) => {
    try {
        const { data, source, page_url } = req.body;
        if (!data) return res.status(400).json({ success: false, message: 'Data required' });

        const storageId = 'FS_STORE_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
        
        // تخزين في الذاكرة
        dataStorage[storageId] = {
            data: data,
            source: source || 'unknown',
            page_url: page_url,
            stored_at: new Date().toISOString(),
            status: 'stored'
        };

        // تنظيف البيانات القديمة (أكثر من ساعة)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        Object.keys(dataStorage).forEach(key => {
            if (new Date(dataStorage[key].stored_at).getTime() < oneHourAgo) {
                delete dataStorage[key];
            }
        });

        res.json({ 
            success: true, 
            storage_id: storageId,
            message: 'Data stored successfully',
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Storage failed', error: e.message });
    }
});

// التحقق من حالة السيلفي
app.get('/api/check-selfie-status', (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ success: false, message: 'ID required' });

        // ابحث في التخزين المؤقت
        const storedData = dataStorage[id];
        if (!storedData) {
            // ابحث في سجلات السيلفي
            const record = selfieRecords.find(r => r.id === id || r.selfie_code === id);
            if (!record) return res.json({ success: false, message: 'Record not found', status: 'not_found' });

            // إذا كان هناك نتيجة
            if (record.result_code) {
                return res.json({ 
                    success: true, 
                    status: 'completed',
                    result_code: record.result_code,
                    completed_at: record.updated_at
                });
            }

            // محاكاة الحالات
            const age = Date.now() - new Date(record.created_at).getTime();
            const minutes = age / (1000 * 60);

            if (minutes < 1) {
                return res.json({ success: true, status: 'not_started', stored_at: record.created_at });
            } else if (minutes < 2) {
                return res.json({ success: true, status: 'processing', stored_at: record.created_at });
            } else if (minutes < 3) {
                return res.json({ success: true, status: 'pending', stored_at: record.created_at });
            } else {
                // إذا مر أكثر من 3 دقائق، افترض الإكمال
                record.result_code = 'RESULT_' + Math.random().toString(36).substr(2, 12).toUpperCase() + '_' + Date.now();
                record.status = 'completed';
                record.updated_at = new Date().toISOString();
                
                return res.json({ 
                    success: true, 
                    status: 'completed',
                    result_code: record.result_code,
                    completed_at: record.updated_at
                });
            }
        }

        // البيانات المخزنة مؤقتاً
        const age = Date.now() - new Date(storedData.stored_at).getTime();
        const minutes = age / (1000 * 60);

        if (minutes < 1) {
            return res.json({ success: true, status: 'not_started', stored_at: storedData.stored_at });
        } else if (minutes < 2) {
            return res.json({ success: true, status: 'processing', stored_at: storedData.stored_at });
        } else if (minutes < 3) {
            return res.json({ success: true, status: 'pending', stored_at: storedData.stored_at });
        } else {
            // إذا مر أكثر من 3 دقائق، افترض الإكمال
            const resultCode = 'RESULT_' + Math.random().toString(36).substr(2, 12).toUpperCase() + '_' + Date.now();
            
            // حفظ كسجل سيلفي كامل
            const id = generateId();
            const record = {
                id,
                selfie_code: storedData.data?.selfie_code || resultCode,
                client_name: 'from_storage',
                encrypted_code: encryptData(JSON.stringify(storedData.data || {})),
                source: storedData.source || 'data_storage',
                status: 'completed',
                result_code: resultCode,
                created_at: storedData.stored_at,
                updated_at: new Date().toISOString(),
                ip_address: '127.0.0.1',
                user_agent: 'Data Storage'
            };
            selfieRecords.push(record);
            
            return res.json({ 
                success: true, 
                status: 'completed',
                result_code: resultCode,
                completed_at: new Date().toISOString()
            });
        }

    } catch (e) {
        res.status(500).json({ success: false, message: 'Check failed', error: e.message });
    }
});

app.post('/api/save-selfie', (req, res) => {
    try {
        const { selfie_code, client_name = 'unknown', encrypted_code } = req.body;
        if (!selfie_code || !encrypted_code) return res.status(400).json({ success: false, message: 'selfie_code & encrypted_code required' });

        const id = generateId();
        const record = {
            id, selfie_code, client_name, encrypted_code,
            source: 'forbes_extension', status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ip_address: req.ip || req.connection.remoteAddress,
            user_agent: req.get('User-Agent') || 'unknown'
        };
        selfieRecords.push(record);
        statusRecords[selfie_code] = { status: 'pending', attempts: 0, created_at: new Date().toISOString() };
        if (selfieRecords.length > 1000) selfieRecords = selfieRecords.slice(-1000);

        res.json({ success: true, record_id: id, message: 'Saved', timestamp: record.created_at });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Save failed', error: e.message });
    }
});

app.get('/api/check-status', (req, res) => {
    try {
        const { selfie_code } = req.query;
        if (!selfie_code) return res.status(400).json({ success: false, message: 'selfie_code required' });

        const st = statusRecords[selfie_code];
        if (!st) return res.json({ success: false, message: 'Not found', status: 'not_found' });

        st.attempts = (st.attempts || 0) + 1;
        if (st.attempts < 3) st.status = 'processing';
        else if (st.attempts < 6) st.status = 'ready';
        else if (st.attempts < 9) {
            st.status = 'completed';
            if (!st.result_code) st.result_code = 'RESULT_' + Math.random().toString(36).substr(2, 12).toUpperCase() + '_' + Date.now();
        } else st.status = 'failed';

        res.json({ success: true, status: st.status, attempts: st.attempts, result_code: st.result_code });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Check failed', error: e.message });
    }
});

app.get('/api/get-result', (req, res) => {
    try {
        const { selfie_code } = req.query;
        if (!selfie_code) return res.status(400).json({ success: false, message: 'selfie_code required' });

        const st = statusRecords[selfie_code];
        if (!st) return res.json({ success: false, message: 'Not found' });
        if (st.status !== 'completed') return res.json({ success: false, message: 'Not completed yet', current_status: st.status });

        res.json({ success: true, result_code: st.result_code, status: st.status, attempts: st.attempts });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Get result failed', error: e.message });
    }
});

// -------------------- صفحة فتح BLS مباشرة --------------------
app.get('/open-bls', (req, res) => {
    try {
        const { data, redirect } = req.query;
        
        // حفظ بيانات الجلسة
        if (data) {
            if (!dataStorage[data]) {
                dataStorage[data] = {
                    data: { session_id: data },
                    stored_at: new Date().toISOString(),
                    status: 'active'
                };
            }
        }
        
        // صفحة HTML تفتح BLS مباشرةً
        const html = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>نظام التحقق بالصورة - BLS الجزائر</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                
                body {
                    background: linear-gradient(135deg, #1a237e 0%, #311b92 100%);
                    color: #fff;
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                
                .container {
                    background: rgba(255, 255, 255, 0.95);
                    color: #333;
                    padding: 30px;
                    border-radius: 15px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    text-align: center;
                    max-width: 500px;
                    width: 100%;
                }
                
                .header {
                    margin-bottom: 20px;
                }
                
                .logo {
                    font-size: 60px;
                    color: #4CAF50;
                    margin-bottom: 15px;
                }
                
                h1 {
                    color: #2c3e50;
                    margin-bottom: 10px;
                    font-size: 24px;
                }
                
                .subtitle {
                    color: #7f8c8d;
                    font-size: 14px;
                    margin-bottom: 20px;
                }
                
                .info-box {
                    background: #f8f9fa;
                    border: 1px solid #e3e6f0;
                    border-radius: 8px;
                    padding: 15px;
                    margin: 15px 0;
                    text-align: right;
                    font-size: 14px;
                }
                
                .info-box strong {
                    color: #3498db;
                }
                
                .status {
                    margin: 20px 0;
                }
                
                .loader {
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #3498db;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .status-text {
                    margin-top: 10px;
                    font-weight: bold;
                    color: #2c3e50;
                }
                
                .btn {
                    background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 25px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-top: 15px;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    text-decoration: none;
                }
                
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(76, 175, 80, 0.4);
                }
                
                .footer {
                    margin-top: 20px;
                    padding-top: 15px;
                    border-top: 1px solid #eee;
                    color: #7f8c8d;
                    font-size: 12px;
                }
                
                .auto-redirect {
                    margin-top: 15px;
                    font-size: 14px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">📸</div>
                    <h1>نظام التحقق بالصورة (Selfie)</h1>
                    <p class="subtitle">BLS International Services - Algeria</p>
                </div>
                
                <div class="info-box">
                    <p>معرف الجلسة: <strong>${data ? data.substring(0, 25) + '...' : 'غير متوفر'}</strong></p>
                    <p>الوقت: ${new Date().toLocaleString('ar-SA')}</p>
                </div>
                
                <div class="status">
                    <div class="loader"></div>
                    <div class="status-text">جاري التوجيه إلى صفحة التحقق...</div>
                </div>
                
                <div class="auto-redirect">
                    <p>سيتم فتح صفحة التحقق تلقائياً خلال <span id="countdown">5</span> ثوانٍ</p>
                </div>
                
                <a href="${BLS_LIVENESS_URL}" target="_blank" class="btn">
                    <span>🔗</span>
                    افتح صفحة التحقق الآن
                </a>
                
                <div class="footer">
                    <p>Forbes Selfie System v3.0 | ${new Date().getFullYear()}</p>
                </div>
            </div>
            
            <script>
                // العد التنازلي
                let countdown = 5;
                const countdownElement = document.getElementById('countdown');
                
                const countdownInterval = setInterval(() => {
                    countdown--;
                    countdownElement.textContent = countdown;
                    
                    if (countdown <= 0) {
                        clearInterval(countdownInterval);
                        window.open('${BLS_LIVENESS_URL}', '_blank');
                        
                        // إذا كان هناك صفحة للعودة إليها
                        ${redirect ? `setTimeout(() => {
                            window.location.href = '${redirect}';
                        }, 1000);` : ''}
                    }
                }, 1000);
                
                // افتح في نافذة جديدة فوراً
                setTimeout(() => {
                    window.open('${BLS_LIVENESS_URL}', '_blank');
                }, 500);
            </script>
        </body>
        </html>`;
        
        res.send(html);
    } catch (e) {
        res.status(500).send('Server error: ' + e.message);
    }
});

// -------------------- صفحة السيلفي (كاملة) --------------------
app.get('/selfie/link', (req, res) => {
    try {
        let { id, result_code } = req.query;
        if (!id) return res.status(400).send('ID required');

        // إذا كان راجعاً من OzLiveness مع result_code
        if (result_code) {
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Forbes Selfie - Completed</title>
              <style>
                body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
                .box{background:#fff;padding:40px;border-radius:15px;text-align:center;max-width:500px;width:90%}
                h1{color:#2e7d32} .btn{background:linear-gradient(#4CAF50,#2E7D32);color:#fff;border:none;padding:14px 28px;border-radius:25px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:20px}
              </style>
            </head>
            <body>
              <div class="box">
                <h1>✅ Selfie Completed</h1>
                <p>Result code: <strong>${result_code}</strong></p>
                <button class="btn" onclick="sendAndClose()">Send & Close</button>
              </div>
              <script>
                function sendAndClose() {
                  if (window.opener) {
                    window.opener.postMessage({
                      type: 'FORBES_SELFIE_COMPLETE',
                      result_code: '${result_code}'
                    }, '*');
                  }
                  setTimeout(()=>window.close(),800);
                }
              </script>
            </body>
            </html>`;
            return res.send(html);
        }

        // وإلا نُظهر الصفحة العادية
        const plain = decryptData(id);
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Forbes Selfie Verification</title>
  <style>
    body{font-family:Arial,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .box{background:#fff;padding:40px;border-radius:15px;text-align:center;max-width:600px;width:90%}
    h1{color:#2c3e50;margin-bottom:10px}
    .status{margin:20px 0;font-size:18px;font-weight:bold}
    .btn{background:linear-gradient(#4CAF50,#2E7D32);color:#fff;border:none;padding:14px 28px;border-radius:25px;font-size:16px;font-weight:bold;cursor:pointer;transition:.3s}
    .btn:hover{transform:translateY(-2px)}
    .hidden{display:none}
    textarea{width:100%;height:120px;margin-top:10px;padding:10px;font-size:14px;border:1px solid #ccc;border-radius:8px;resize:none}
  </style>
</head>
<body>
  <div class="box">
    <h1>🔐 Forbes Selfie Verification</h1>
    <p>Click below to start biometric verification.</p>

    <div id="status" class="status">⏳ Ready</div>

    <button id="startBtn" class="btn" onclick="startRealSelfie()">▶️ Start Verification</button>
    <button id="completeBtn" class="btn hidden" onclick="completeAndSend()">✅ Complete & Send Result</button>

    <textarea id="log" readonly placeholder="Debug log..."></textarea>
  </div>

  <script>
    const encId = "${id.replace(/"/g, '\\"')}";
    const plain = "${plain.replace(/"/g, '\\"')}";
    let resultCode = null;

    function log(msg){ const t=document.getElementById('log'); t.value+=new Date().toLocaleTimeString()+': '+msg+'\\n'; t.scrollTop=t.scrollHeight; }
    function status(txt,ok){ const s=document.getElementById('status'); s.textContent=txt; s.style.color=ok?'green':'red'; }

    // فتح OzLiveness الحقيقي
    function startRealSelfie(){
      log('Opening real OzLiveness...');
      status('⏳ Opening camera...',true);
      const [u,t] = plain.split(',');
      const ozUrl = 'https://liveness.ozforensics.com/verify?' +
        'user_id='+encodeURIComponent(u)+
        '&transaction_id='+encodeURIComponent(t)+
        '&redirect_url='+encodeURIComponent(location.origin + location.pathname + '?callback=1');
        location.href = ozUrl;
       }

    // عند الرجوع مع result_code
    window.addEventListener('DOMContentLoaded', ()=>{
      const p = new URLSearchParams(location.search);
      if (p.get('callback')==='1' && p.get('result_code')){
        handleOzLivenessResult({success:true,code:p.get('result_code')});
      }
    });

    function handleOzLivenessResult(res){
      resultCode = res.code;
      status('✅ Selfie completed!',true);
      document.getElementById('startBtn').classList.add('hidden');
      document.getElementById('completeBtn').classList.remove('hidden');
      log('Result: '+resultCode);
      // نبلغ النافذة الأم
      if (window.opener) window.opener.postMessage({type:'FORBES_SELFIE_COMPLETE',result_code:resultCode},'*');
    }

    async function completeAndSend(){
      if (!resultCode) return alert('No result!');
      document.getElementById('completeBtn').disabled=true;
      status('⏳ Sending...',true);
      try{
        const r=await fetch('/api/save-selfie',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({selfie_code:encId,result_code:resultCode,status:'completed'})
        });
        const j=await r.json();
        if(j.success){
          status('✅ Sent! Closing...',true);
          window.opener?.postMessage({type:'FORBES_SELFIE_SUBMITTED',record:j},'*');
          setTimeout(()=>window.close(),1500);
        }else throw new Error(j.message||'Server error');
      }catch(e){
        status('❌ Send failed: '+e.message,false);
        document.getElementById('completeBtn').disabled=false;
      }
    }
  </script>
</body>
</html>`;
        res.send(html);
    } catch (e) {
        res.status(500).send('Server error');
    }
});

// -------------------- Debug --------------------
app.get('/api/debug-encrypt', (_, res) => {
    const plain = '123456,789012';
    const enc   = encryptData(plain);
    const dec   = decryptData(enc);
    res.json({ 
        success: true, 
        test_data: plain, 
        encrypted: enc, 
        decrypted: dec, 
        encryption_works: plain === dec,
        key_length: ENCRYPTION_KEY.length,
        encryption_method: 'AES-256-CBC'
    });
});

// نقطة نهاية جديدة لاختبار BLS
app.get('/test-bls', (req, res) => {
    res.json({
        success: true,
        bls_url: BLS_LIVENESS_URL,
        test_time: new Date().toISOString(),
        server_status: 'active'
    });
});

// -------------------- 404 & 500 --------------------
app.use((req, res) => res.status(404).json({ 
    success: false, 
    message: 'Endpoint not found',
    requested_url: req.url,
    available_endpoints: [
        '/',
        '/api/test',
        '/api/encrypt',
        '/api/store-data',
        '/api/check-selfie-status',
        '/api/save-selfie',
        '/api/check-status',
        '/api/get-result',
        '/selfie/link',
        '/open-bls',
        '/bls-session',
        '/direct-liveness',
        '/api/store-session',
        '/api/get-session'
    ]
}));

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'production' ? 'Contact administrator' : err.message,
        timestamp: new Date().toISOString()
    });
});

// -------------------- Listen --------------------
app.listen(PORT, () => console.log(`
🚀 Forbes Selfie Server running!
📍 Local: http://localhost:${PORT}
🔗 Test BLS: ${BLS_LIVENESS_URL}
📊 API Endpoints:
  - GET  /api/test
  - POST /api/encrypt
  - POST /api/store-data
  - GET  /api/check-selfie-status
  - GET  /open-bls?data=ID&redirect=URL
  - GET  /bls-session?session_id=ID
  - GET  /direct-liveness?data_id=ID
  - POST /api/store-session
  - GET  /api/get-session?session_id=ID

📈 Storage Stats:
  - Sessions: ${Object.keys(sessionStorage).length}
  - Data Records: ${Object.keys(dataStorage).length}
  - Selfie Records: ${selfieRecords.length}
  - Status Records: ${Object.keys(statusRecords).length}
`));

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
