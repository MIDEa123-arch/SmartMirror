const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const runtime = path.resolve(__dirname, '../.runtime');
const apiRequests = new Map();
const bcrypt = process.env.SMARTMIRROR_BCRYPTJS_PATH ? require(process.env.SMARTMIRROR_BCRYPTJS_PATH) : null;
const editorPassword = process.env.SMARTMIRROR_EDITOR_PASSWORD || '';
module.exports = {
    uiPort: Number(process.env.PORT || 1881),
    uiHost: process.env.SMARTMIRROR_HOST || '127.0.0.1',
    https: {
        key: fs.readFileSync(path.join(runtime, 'tls', 'key.pem')),
        cert: fs.readFileSync(path.join(runtime, 'tls', 'cert.pem'))
    },
    adminAuth: bcrypt && editorPassword ? {
        type:'credentials',
        users:[{username:'admin',password:bcrypt.hashSync(editorPassword,10),permissions:'*'}]
    } : undefined,
    httpNodeMiddleware(req, res, next) {
        if (!req.path.startsWith('/api/calendar')) return next();
        const expected = Buffer.from(process.env.SMARTMIRROR_API_TOKEN || '');
        const supplied = Buffer.from((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
        if (!expected.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
            return res.status(401).json({error:'Mã kết nối không đúng.'});
        }
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || 'local';
        const recent = (apiRequests.get(key) || []).filter(at => now - at < 60000);
        if (recent.length >= 120) return res.status(429).json({error:'Thử lại sau một phút.'});
        recent.push(now);
        apiRequests.set(key, recent);
        if (apiRequests.size > 128) {
            for (const [client, times] of apiRequests) if (!times.length || now - times[times.length - 1] >= 60000) apiRequests.delete(client);
        }
        next();
    },
    httpStatic: path.resolve(__dirname, 'public'),
    flowFile: path.resolve(__dirname, '../.runtime/flows.json'),
    functionGlobalContext: {
        async searchWeatherPlaces(query) {
            const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
            url.search = new URLSearchParams({name:query,count:'5',language:'vi',format:'json'});
            const response = await fetch(url, {signal:AbortSignal.timeout(7000)});
            if (!response.ok) throw new Error('Geocoding request failed');
            const result = await response.json();
            return (result.results || []).map(p => ({
                name:[p.name,p.admin1,p.country].filter(Boolean).join(', '),
                lat:p.latitude,lon:p.longitude
            }));
        }
    },
    contextStorage: { default:'memoryOnly', memoryOnly:{module:'memory'}, file:{module:'localfilesystem'} },
    editorTheme: { projects:{enabled:false} },
    logging: {console:{level:'info',metrics:false,audit:false}}
};
