const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const stateSource = fs.readFileSync('node-red/state.js', 'utf8');
const now = Date.now();
const vnToday = new Date(now + 7 * 3600000).toISOString().slice(0,10);
const state = {
  page: 0, active: true, broker: false, reportedOnline: false, heartbeatAt: null,
  serialOnline: true, serialAt: now - 20000, readings: {},
  device: {lamp:'ON', light:120, lightSensor:'OK', page:2},
  tasks: [{id:'today', title:'Lịch hiện có', at:Date.parse(`${vnToday}T12:00:00+07:00`), done:false}],
  history:[], pending:{}, error:'', lastSample:0
};
let stored;
const flow = {
  get(key) { return key === 'mirror' ? state : {}; },
  set(key, value) { if (key === 'mirror') stored = value; }
};
const run = new Function('msg','flow','env','Buffer','Date','Math',stateSource);
const outputs = run({topic:'smartmirror/demo01/status',payload:'online',serial:true},flow,{get:()=>null},Buffer,Date,Math);
assert.equal(outputs.length,4);
assert.ok(outputs[3]?.payload.startsWith('SMIRROR '));
assert.ok(outputs[3].payload.endsWith('\n'));
const display = JSON.parse(outputs[3].payload.slice(8).trim());
assert.equal(display.privateTasks,true);
assert.equal(display.tasks[0].title,'Lịch hiện có');
assert.equal(stored.serialOnline,true);

const serialLine = '@SMARTMIRROR|state/lamp|ON';
const matcher = /^@SMARTMIRROR\|([a-z0-9/_-]{1,48})\|([^\r\n]{1,64})$/;
const normalize = raw => matcher.exec(String(raw).replace(/[\r\n]+$/,''))?.slice(1) || null;
assert.deepEqual(normalize(`${serialLine}\r\n`), ['state/lamp','ON']);
assert.equal(normalize('Debug: @SMARTMIRROR|state/lamp|ON'),null);
assert.equal(normalize('@SMARTMIRROR|state/lamp|ON\nextra'),null);
console.log('PASS: USB reconnect sends current schedule; status framing rejects unrelated serial text');
