// Node-RED Function body: REST API for the separate Flutter calendar app.
const method = String(msg.req?.method || '').toUpperCase();
const id = String(msg.req?.params?.id || '');
const body = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
let saved = {};
try { saved = flow.get('preferences', 'file') || {}; }
catch (_) { saved = flow.get('preferences') || {}; }
const mirror = flow.get('mirror') || {};
const tasks = Array.isArray(mirror.tasks) ? mirror.tasks : Array.isArray(saved.tasks) ? saved.tasks : [];
const readings = mirror.readings || {};
const online = !!((mirror.broker && mirror.reportedOnline &&
    ((mirror.heartbeatAt != null && Date.now() - mirror.heartbeatAt < 15000) ||
        ['temperature','humidity'].some(key => readings[key] && Date.now() - readings[key].at < 15000))) ||
    (mirror.serialOnline && mirror.serialAt != null && Date.now() - mirror.serialAt < 15000));
const json = (statusCode, payload, followUp = null) => [
    {...msg,statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},payload},
    followUp
];
const validTitle = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120;
const validAt = value => Number.isSafeInteger(value) && value > 0 && value < 4102444800000;
const stateMessage = (action, properties) => ({topic:'ui',payload:{action,...properties}});

if (method === 'GET') {
    return json(200, {
        tasks:tasks.map(t => ({id:t.id,title:t.title,at:t.at,done:!!t.done})),
        serverTime:Date.now(),
        device:{
            online,
            active:!!mirror.active,
            lamp:mirror.device?.lamp || null,
            screenBrightness:Number.isInteger(mirror.device?.light) ? mirror.device.light : null,
            lightSensor:mirror.device?.lightSensor || null,
            temperature:readings.temperature && Date.now() - readings.temperature.at < 15000 ? readings.temperature.value : null,
            humidity:readings.humidity && Date.now() - readings.humidity.at < 15000 ? readings.humidity.value : null
        }
    });
}

if (method === 'POST') {
    if (!validTitle(body.title) || !validAt(body.at))
        return json(400, {error:'Tên hoạt động hoặc ngày giờ không hợp lệ.'});
    if (tasks.length >= 100) return json(409, {error:'Lịch đã có tối đa 100 hoạt động.'});
    const task = {id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title:body.title.trim(),at:body.at,done:false};
    return json(201, {task}, stateMessage('saveTask',{...task,at:new Date(task.at).toISOString()}));
}

const existing = tasks.find(task => task.id === id);
if (!existing) return json(404, {error:'Không tìm thấy hoạt động.'});

if (method === 'PUT') {
    const title = body.title === undefined ? existing.title : body.title;
    const at = body.at === undefined ? existing.at : body.at;
    const done = body.done === undefined ? !!existing.done : body.done;
    if (!validTitle(title) || !validAt(at) || typeof done !== 'boolean')
        return json(400, {error:'Tên hoạt động, ngày giờ hoặc trạng thái không hợp lệ.'});
    const task = {id:existing.id,title:title.trim(),at,done};
    return json(200, {task}, stateMessage('updateTask',{...task,at:new Date(task.at).toISOString()}));
}

if (method === 'DELETE')
    return json(200, {deleted:id}, stateMessage('deleteTask',{id}));

return json(405, {error:'Phương thức không được hỗ trợ.'});
