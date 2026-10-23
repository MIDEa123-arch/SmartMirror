// Node-RED Function body. Outputs: UI snapshot, MQTT command, HTTPS request.
const now = Date.now();
let saved = {};
try { saved = flow.get('preferences', 'file') || {}; } catch (_) { saved = flow.get('preferences') || {}; }
const s = flow.get('mirror') || {
    page: 0, active: false, broker: false, reportedOnline: false,
    readings: {}, device: { mode: null, fan: null, light: null },
    location: saved.location || null, weather: null, weatherError: '', places: [],
    tasks: saved.tasks || [], history: [], pending: {}, error: '', lastSample: 0
};
let command = null, request = null;
const text = v => Buffer.isBuffer(v) ? v.toString() : String(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const online = () => s.broker && s.reportedOnline &&
    ['temperature','humidity'].some(k => s.readings[k] && now - s.readings[k].at < 15000);
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
    if (tail === 'sensor/temperature' || tail === 'sensor/humidity') {
        const k = tail.split('/')[1], n = Number(v);
        if (v.trim() && Number.isFinite(n) && n >= (k === 'temperature' ? -40 : 0) && n <= (k === 'temperature' ? 80 : 100) && !msg.retain) {
            s.readings[k] = {value:n, at:now};
        }
    } else if (tail === 'status') s.reportedOnline = v === 'online';
    else if (tail === 'state/active' && ['ACTIVE','SLEEP'].includes(v)) {
        if (v === 'ACTIVE' && !s.active) s.page = 0;
        s.active = v === 'ACTIVE';
    } else if (tail === 'state/mode' && ['AUTO','MANUAL'].includes(v)) {
        s.device.mode = v;
        if (s.pending.mode?.value === v) delete s.pending.mode;
    } else if (tail === 'state/fan' && ['ON','OFF'].includes(v)) {
        s.device.fan = v;
        if (s.pending.fan?.value === v) delete s.pending.fan;
    } else if (tail === 'state/light' && /^\d{1,3}$/.test(v) && Number(v) <= 255) {
        s.device.light = Number(v);
        if (s.pending.light?.value === v) delete s.pending.light;
    } else if (tail === 'event/page' && msg.payload === 'NEXT' && s.active && online()) s.page = (s.page + 1) % 3;
} else if (msg.topic === 'broker') {
    s.broker = msg.payload === true;
    if (!s.broker) {
        s.reportedOnline = false;
        s.readings = {}; // Reconnect must receive new telemetry before enabling controls.
    }
} else if (msg.kind === 'weather') {
    if (s.location && msg.locationKey === `${s.location.lat},${s.location.lon}`) {
        const w = msg.payload;
        if (msg.statusCode === 200 && w?.current && finite(w.current.temperature_2m) && w.daily?.time) {
            s.weather = {current:w.current, daily:w.daily, at:now}; s.weatherError = '';
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
    if (p.action === 'next' && s.active && online()) s.page = (s.page + 1) % 3;
    else if (p.action === 'control') {
        const valid = (p.key === 'mode' && ['AUTO','MANUAL'].includes(p.value)) ||
            (p.key === 'fan' && ['ON','OFF'].includes(p.value) && s.device.mode === 'MANUAL') ||
            (p.key === 'light' && Number.isInteger(p.value) && p.value >= 0 && p.value <= 255 && s.active);
        if (!online()) s.error = 'ESP32 chưa có dữ liệu mới. Chưa gửi lệnh.';
        else if (!valid) s.error = 'Lệnh không phù hợp với chế độ hiện tại.';
        else if (String(s.device[p.key]) === String(p.value)) {
            delete s.pending[p.key]; // Already confirmed; no redundant command needed.
        } else {
            command = {topic:`smartmirror/demo01/cmd/${p.key}`, payload:String(p.value), qos:1, retain:false};
            s.pending[p.key] = {value:p.value, at:now};
        }
    } else if (p.action === 'search') {
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
    } else if (p.action === 'addTask') {
        const at = Date.parse(p.at);
        if (typeof p.title === 'string' && p.title.trim() && Number.isFinite(at) && at > now && s.tasks.length < 100) {
            s.tasks.push({id:`${now}-${Math.random().toString(36).slice(2,8)}`, title:p.title.trim().slice(0,120), at, done:false});
        } else s.error = 'Nhập tên và thời gian trong tương lai (tối đa 100 việc).';
    } else if (p.action === 'toggleTask') {
        const t = s.tasks.find(t => t.id === p.id); if (t) t.done = !t.done;
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
flow.set('mirror', s);
// Persist preferences and user tasks; volatile presence/telemetry never restored as current.
if (msg.topic === 'ui' && ['location','clearLocation','addTask','toggleTask','deleteTask'].includes(msg.payload?.action)) {
    const preferences = {location:s.location,tasks:s.tasks};
    try { flow.set('preferences', preferences, 'file'); } catch (_) { flow.set('preferences', preferences); }
}
const snapshot = {...s, now, online:online(), weatherStale:!s.weather || now - s.weather.at > 1800000};
snapshot.fresh = Object.fromEntries(['temperature','humidity'].map(k => [k, online() && !!s.readings[k] && now - s.readings[k].at < 15000]));
snapshot.reminders = s.tasks.filter(t => !t.done && t.at >= now - 60000 && t.at <= now + 900000);
snapshot.alerts = [];
if (snapshot.fresh.temperature && s.readings.temperature.value >= 32) snapshot.alerts.push('Nhiệt độ phòng cao');
if (snapshot.fresh.humidity && s.readings.humidity.value >= 80) snapshot.alerts.push('Độ ẩm phòng cao');
return [{payload:snapshot}, command, request];
