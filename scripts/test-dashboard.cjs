const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('node-red/state.js','utf8');
let clock = Date.parse('2026-10-23T12:00:00Z');
class Clock extends Date { static now() { return clock; } }
const stores = new Map();
const flow = { get:(k,store='memory')=>stores.get(store+':'+k), set:(k,v,store='memory')=>stores.set(store+':'+k,v) };
const env = { get:()=>undefined };
function run(msg) { return vm.runInNewContext('(function(){'+code+'\n})()', {msg,flow,Buffer,Date:Clock,env}); }
const mqtt = (tail,payload,retain=false)=>run({topic:'smartmirror/demo01/'+tail,payload,retain});
const ui = p=>run({topic:'ui',payload:p});

run({topic:'broker',payload:true}); mqtt('status','online');
mqtt('sensor/temperature','27'); mqtt('sensor/humidity','60');
mqtt('state/active','ACTIVE'); mqtt('state/lamp','ON'); mqtt('state/light','140');
mqtt('state/light-sensor','OK');
assert.equal(run({topic:'tick'})[0].payload.device.lamp,'ON');
assert.equal(run({topic:'tick'})[0].payload.device.light,140);
assert.equal(ui({action:'control',key:'lamp',value:'OFF'})[1],null,'App does not expose manual lamp control');
assert.equal(ui({action:'control',key:'light',value:0})[1],null,'App does not expose manual brightness control');

assert.equal(mqtt('event/page','NEXT')[0].payload.page,1);
assert.equal(mqtt('event/page','NEXT')[0].payload.page,2);
assert.equal(mqtt('event/page','PREV')[0].payload.page,1);
assert.equal(mqtt('event/page','NEXT')[0].payload.page,2);
mqtt('state/active','SLEEP'); assert.equal(mqtt('event/page','PREV')[0].payload.page,2);
mqtt('state/active','ACTIVE'); assert.equal(run({topic:'tick'})[0].payload.page,0);

const todayEvent = {id:'event-a',title:'Họp nhóm',at:Date.parse('2026-10-23T20:30:00+07:00'),done:false};
ui({action:'saveTask',id:todayEvent.id,title:todayEvent.title,at:'2026-10-23T20:30:00+07:00'});
assert.equal(stores.get('file:preferences').tasks.length,1,'Calendar activity persists to file context');
ui({action:'saveTask',id:todayEvent.id,title:'Họp đồ án',at:'2026-10-23T21:00:00+07:00'});
assert.equal(stores.get('file:preferences').tasks[0].title,'Họp đồ án','Edit updates existing event');
ui({action:'saveTask',title:'Gym',at:'2026-10-23T18:00:00+07:00'});
ui({action:'toggleTask',id:'event-a'});
assert.equal(stores.get('file:preferences').tasks.find(t=>t.id==='event-a').done,true);
ui({action:'deleteTask',id:'event-a'});
assert.equal(stores.get('file:preferences').tasks.length,1,'Delete removes selected event');
ui({action:'deleteTask',id:stores.get('file:preferences').tasks[0].id});
ui({action:'saveTask',id:todayEvent.id,title:todayEvent.title,at:'2026-10-23T20:30:00+07:00'});
const displayState = mqtt('state/page','0');
assert.ok(displayState[1]?.payload.includes('Họp nhóm'),'Today agenda is sent to TFT display');
const screen = JSON.parse(displayState[1].payload);
assert.equal(screen.privateTasks,true);
assert.equal(screen.tasks.length,1);

flow.set('mirror',null);
let out=run({topic:'tick'});
assert.equal(out[0].payload.tasks.length,1,'Calendar data survives a state restart');
assert.equal(out[0].payload.online,false);
run({topic:'broker',payload:true}); mqtt('status','online'); mqtt('state/active','ACTIVE');

out=ui({action:'search',query:'Da Nang'}); assert.match(out[2].url,/geocoding-api/);
out=ui({action:'location',lat:16.05,lon:108.2,name:'Đà Nẵng'}); assert.match(out[2].url,/latitude=16.05/);
run({kind:'weather',locationKey:'wrong',statusCode:200,payload:{current:{temperature_2m:25},daily:{time:[]}}});
assert.equal(run({topic:'tick'})[0].payload.weather,null);
run({kind:'weather',locationKey:'16.05,108.2',statusCode:200,payload:{current:{temperature_2m:25},daily:{time:[]}}});
assert.ok(run({topic:'tick'})[0].payload.weather);
mqtt('state/page','0');
assert.equal(ui({action:'next'})[1].topic,'smartmirror/demo01/cmd/page');
assert.equal(ui({action:'next'})[1],null,'Wait for ESP32 page acknowledgement');
out=mqtt('state/page','1'); assert.equal(out[0].payload.pending.page,undefined);
out=ui({action:'saveTask',id:'event-a',title:'Họp nhóm',at:'2026-10-23T20:30:00+07:00'});
const privatePayload=JSON.parse(out[1].payload);
assert.equal(privatePayload.tasks[0].title,'Họp nhóm');
assert.ok(Buffer.byteLength(out[1].payload,'utf8')<=640);
console.log('PASS: automatic lamp/screen state, no manual controls, calendar CRUD/persistence, today agenda delivery, page events and weather data');
