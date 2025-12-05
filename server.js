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

// -------------------- API Endpoints --------------------
app.get('/', (_, res) => res.json({
    success: true, message: '🚀 Forbes Selfie Server is running',
    version: '2.0.0', timestamp: new Date().toISOString(),
    endpoints: {
        test: '/api/test', encrypt: '/api/encrypt', saveSelfie: '/api/save-selfie',
        checkStatus: '/api/check-status', getResult: '/api/get-result',
        selfieLink: '/selfie/link', debugEncrypt: '/api/debug-encrypt'
    }
}));

app.get('/api/test', (_, res) => res.json({
    success: true, status: 'ok', message: 'Forbes Selfie Server is working ✅',
    server_time: new Date().toISOString(), uptime: process.uptime(),
    memory_usage: process.memoryUsage()
}));

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
      const ozUrl = 'https://liveness.ozforensics.com/verify?' + // غيّر إلى الرابط الحقيقي
        'user_id='+encodeURIComponent(u)+
        '&transaction_id='+encodeURIComponent(t)+
        '&redirect_url='+encodeURIComponent(location.origin + location.pathname + '?callback=1');
      window.open(ozUrl, 'ozLiveness', 'width=900,height=650');
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
    res.json({ success: true, test_data: plain, encrypted: enc, decrypted: dec, encryption_works: plain === dec });
});

// -------------------- 404 & 500 --------------------
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint not found' }));
app.use((err, req, res, next) => {
    console.error('Unhandled:', err);
    res.status(500).json({ success: false, message: 'Internal error', error: process.env.NODE_ENV === 'production' ? null : err.message });
});

// -------------------- Listen --------------------
app.listen(PORT, () => console.log(`
🚀 Forbes Selfie (OzLiveness Edition) running!
Local: http://localhost:${PORT}
Encryption: AES-256-CBC + random IV
`));

process.on('SIGTERM', () => (console.log('SIGTERM'), process.exit(0)));
process.on('SIGINT',  () => (console.log('SIGINT'),  process.exit(0)));
