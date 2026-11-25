// Node-RED Function body. Outputs: UI snapshot, MQTT command, HTTPS request, USB serial command.
const now = Date.now();
let saved = {};
try { saved = flow.get('preferences', 'file') || {}; } catch (_) { saved = flow.get('preferences') || {}; }
const s = flow.get('mirror') || {
    page: 0, active: false, broker: false, reportedOnline: false, heartbeatAt: null,
    serialOnline: false, serialAt: null,
    readings: {}, device: { lamp: null, light: null, lightSensor: null, page: null },
    location: saved.location || null, weather: null, weatherError: '', places: [],
    tasks: saved.tasks || [], history: [], pending: {}, error: '', lastSample: 0
};
let command = null, request = null, serialCommand = null;
let displayChanged = false;
const text = v => Buffer.isBuffer(v) ? v.toString() : String(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const online = () => (s.broker && s.reportedOnline &&
    ((s.heartbeatAt != null && now - s.heartbeatAt < 15000) ||
        ['temperature','humidity'].some(k => s.readings[k] && now - s.readings[k].at < 15000))) ||
    (s.serialOnline && s.serialAt != null && now - s.serialAt < 15000);
const privateDisplay = typeof env !== 'undefined' && env.get('SMARTMIRROR_TFT_PRIVATE') === '1';
const vietnamDay = at => new Date(at + 7 * 3600000).toISOString().slice(0,10);
function displayText(value) {
    let result = '';
    for (const ch of String(value || '').normalize('NFC').replace(/[^\x20-\x7E\u00A0-\u017F\u1EA0-\u1EF9]/g, ' ').trim()) {
        if (Buffer.byteLength(result + ch, 'utf8') > 48) break;
        result += ch;
    }
    return result;
}
function displayContent() {
    const c = s.weather?.current;
    const age = Math.floor((now - (s.weather?.at || 0)) / 1000);
    const weather = c && finite(c.temperature_2m) && finite(c.relative_humidity_2m) &&
        Number.isInteger(c.weather_code) && age >= 0 && age <= 86400 ? {
            temperature:c.temperature_2m, humidity:Math.round(c.relative_humidity_2m), code:c.weather_code, age
        } : null;
    const today = vietnamDay(now);
    const todayTasks = s.tasks.filter(t => vietnamDay(t.at) === today).slice(0,3);
    return {
        topic:'smartmirror/demo01/display/content',
        payload:JSON.stringify({
            v:1, time:Math.floor(now / 1000), weather,
            location:privateDisplay ? displayText(s.location?.name || '') : '',
            privateTasks:true,
            tasks:todayTasks.map(t => ({title:displayText(t.title), at:Math.floor(t.at / 1000)}))
        }),
        qos:1, retain:false
    };
}
function weatherRequest() {
    if (!s.location || now - (s.requestAt || 0) < 10000) return;
    s.requestAt = now;
    const {lat, lon} = s.location;
    request = { kind: 'weather', locationKey: `${lat},${lon}`,
        url: `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=Asia%2FHo_Chi_Minh`, payload: '' };
}
if (msg.topic && msg.topic.startsWith('smartmirror/demo01/')) {
    const tail = msg.topic.slice('smartmirror/demo01/'.length);
    const v = text(msg.payload);
    if (msg.serial) {
        const serialWasFresh = s.serialOnline && s.serialAt != null && now - s.serialAt < 15000;
        s.serialAt = now;
        if (tail === 'status') s.serialOnline = v === 'online';
        if (tail === 'status' && v === 'online' && !serialWasFresh) {
            const content = displayContent();
            serialCommand = {payload:`SMIRROR ${content.payload}\n`};
        }
    }
    if (tail === 'sensor/temperature' || tail === 'sensor/humidity') {
        const k = tail.split('/')[1], n = Number(v);
        if (v.trim() && Number.isFinite(n) && n >= (k === 'temperature' ? -40 : 0) && n <= (k === 'temperature' ? 80 : 100) && !msg.retain) {
            s.readings[k] = {value:n, at:now};
        }
    } else if (tail === 'status' && ['online','offline'].includes(v) && !msg.serial) {
        s.reportedOnline = v === 'online';
        if (!s.reportedOnline) {
            s.heartbeatAt = null;
            s.readings = {};
            s.pending = {};
            s.device.page = null;
        } else if (!msg.retain) s.heartbeatAt = now;
    } else if (tail === 'state/active' && ['ACTIVE','SLEEP'].includes(v)) {
        if (v === 'ACTIVE' && !s.active) s.page = 0;
        s.active = v === 'ACTIVE';
    } else if (tail === 'state/lamp' && ['ON','OFF'].includes(v)) {
        s.device.lamp = v;
    } else if (tail === 'state/light' && /^\d{1,3}$/.test(v) && Number(v) <= 255) {
        s.device.light = Number(v);
    } else if (tail === 'state/light-sensor' && ['OK','FALLBACK'].includes(v)) {
        s.device.lightSensor = v;
    } else if (tail === 'state/page' && /^[0-2]$/.test(v) && !msg.retain) {
        displayChanged = s.device.page == null;
        s.device.page = Number(v);
        if (s.active) s.page = s.device.page;
        if (s.pending.page?.value === v) delete s.pending.page;
    } else if (tail === 'event/page' && ['NEXT','PREV'].includes(msg.payload) && s.active && online() && s.device.page == null) {
        s.page = (s.page + (msg.payload === 'NEXT' ? 1 : 2)) % 3;
    }
} else if (msg.topic === 'broker') {
    s.broker = msg.payload === true;
    if (!s.broker) {
        s.reportedOnline = false;
        s.heartbeatAt = null;
        s.readings = {}; // Reconnect must receive new telemetry before enabling controls.
        s.pending = {};
        s.device.page = null;
    }
} else if (msg.kind === 'weather') {
    if (s.location && msg.locationKey === `${s.location.lat},${s.location.lon}`) {
        const w = msg.payload;
        if (msg.statusCode === 200 && w?.current && finite(w.current.temperature_2m) && w.daily?.time) {
            s.weather = {current:w.current, daily:w.daily, at:now}; s.weatherError = '';
            displayChanged = true;
        } else s.weatherError = 'Không lấy được thời tiết. Sẽ tự thử lại.';
    }
} else if (msg.kind === 'geocode') {
    if (msg.statusCode === 200 && Array.isArray(msg.payload?.results)) {
        s.places = msg.payload.results.slice(0,5).map(p => ({name:[p.name,p.admin1,p.country].filter(Boolean).join(', '), lat:p.latitude, lon:p.longitude}));
        s.error = s.places.length ? '' : 'Không tìm thấy địa điểm.';
    } else { s.places = []; s.error = 'Không tìm thấy hoặc không kết nối được API địa điểm.'; }
} else if (msg.topic === 'ui') {
    const p = msg.payload || {};
    s.error = '';
    if (p.action === 'next' && s.active && online()) {
        if (s.device.page == null) s.page = (s.page + 1) % 3;
        else if (!s.pending.page) {
            const value = String((s.page + 1) % 3);
            command = {topic:'smartmirror/demo01/cmd/page',payload:value,qos:1,retain:false};
            s.pending.page = {value,at:now};
        }
    }
    else if (p.action === 'search') {
        if (typeof p.query === 'string' && p.query.trim().length >= 2 && now - (s.searchAt || 0) >= 2000) {
            s.searchAt = now; s.places = [];
            request = {kind:'geocode', url:`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(p.query.trim().slice(0,80))}&count=5&language=vi&format=json`, payload:''};
        }
    } else if (p.action === 'location') {
        if (finite(p.lat) && finite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) {
            s.location = {lat:Number(p.lat.toFixed(4)), lon:Number(p.lon.toFixed(4)), name:typeof p.name === 'string' ? p.name.slice(0,120) : 'Vị trí của tôi'};
            s.weather = null; s.weatherError = ''; s.places = []; s.requestAt = 0; weatherRequest();
        }
    } else if (p.action === 'clearLocation') {
        s.location = null; s.weather = null; s.weatherError = ''; s.places = [];
    } else if (p.action === 'saveTask') {
        const at = Date.parse(p.at);
        if (typeof p.title === 'string' && p.title.trim() && Number.isFinite(at) && at > 0) {
            const existing = s.tasks.find(t => t.id === p.id);
            if (existing) { existing.title = p.title.trim().slice(0,120); existing.at = at; }
            else if (s.tasks.length < 100) s.tasks.push({id:typeof p.id === 'string' && p.id.length <= 64 ? p.id : `${now}-${Math.random().toString(36).slice(2,8)}`, title:p.title.trim().slice(0,120), at, done:false});
            else s.error = 'Lịch đã có tối đa 100 hoạt động.';
        } else s.error = 'Nhập tên hoạt động và ngày giờ hợp lệ.';
    } else if (p.action === 'toggleTask') {
        const t = s.tasks.find(t => t.id === p.id); if (t) t.done = !t.done;
    } else if (p.action === 'updateTask') {
        const t = s.tasks.find(t => t.id === p.id), at = Date.parse(p.at);
        if (t && typeof p.title === 'string' && p.title.trim() && Number.isFinite(at) && typeof p.done === 'boolean') {
            t.title = p.title.trim().slice(0,120); t.at = at; t.done = p.done;
        }
    } else if (p.action === 'deleteTask') s.tasks = s.tasks.filter(t => t.id !== p.id);
    else if (p.action === 'refreshWeather') weatherRequest();
}
if (msg.topic === 'tick' && s.location && now - (s.requestAt || 0) >= 900000) weatherRequest();
for (const [key,p] of Object.entries(s.pending)) {
    if (now - p.at > 8000) { delete s.pending[key]; s.error = 'Chưa nhận trạng thái xác nhận từ ESP32. Kiểm tra thiết bị trước khi thử lại.'; }
}
if (online() && now - s.lastSample >= 60000 && ['temperature','humidity'].every(k => s.readings[k] && now - s.readings[k].at < 15000)) {
    s.lastSample = now;
    s.history.push({at:now, temperature:s.readings.temperature.value, humidity:s.readings.humidity.value});
}
s.history = s.history.filter(h => now - h.at < 86400000).slice(-1440);
s.tasks.sort((a,b) => a.at - b.at);
// Persist preferences and user tasks; volatile presence/telemetry never restored as current.
if (msg.topic === 'ui' && ['location','clearLocation','saveTask','toggleTask','updateTask','deleteTask'].includes(msg.payload?.action)) {
    const preferences = {location:s.location,tasks:s.tasks};
    try { flow.set('preferences', preferences, 'file'); } catch (_) { flow.set('preferences', preferences); }
    displayChanged = true;
}
if (msg.topic === 'ui' && ['saveTask','toggleTask','updateTask','deleteTask'].includes(msg.payload?.action) && s.serialOnline && s.serialAt != null && now - s.serialAt < 15000) {
    const content = displayContent();
    serialCommand = {payload:`SMIRROR ${content.payload}\n`};
}
const snapshot = {...s, now, online:online(), weatherStale:!s.weather || now - s.weather.at > 1800000};
snapshot.fresh = Object.fromEntries(['temperature','humidity'].map(k => [k, online() && !!s.readings[k] && now - s.readings[k].at < 15000]));
snapshot.reminders = s.tasks.filter(t => !t.done && t.at >= now - 60000 && t.at <= now + 900000);
snapshot.alerts = [];
if (snapshot.fresh.temperature && s.readings.temperature.value >= 32) snapshot.alerts.push('Nhiệt độ phòng cao');
if (snapshot.fresh.humidity && s.readings.humidity.value >= 80) snapshot.alerts.push('Độ ẩm phòng cao');
if (snapshot.online && s.device.page != null && (displayChanged || now - (s.lastDisplayAt || 0) >= 15000)) {
    s.lastDisplayAt = now;
    const content = displayContent();
    command = command ? [command, content] : content;
}
flow.set('mirror', s);
return [{payload:snapshot}, command, request, serialCommand];
