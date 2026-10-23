const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nodes = JSON.parse(fs.readFileSync('flows.json', 'utf8'));
const input = nodes.find(n => n.topic === 'smartmirror/demo01/event/page');
assert.equal(input.qos, '1');
const filter = nodes.find(n => n.id === input.wires[0][0]);
const values = new Map();
const context = { get: key => values.get(key), set: (key, value) => values.set(key, value) };
function receive(payload, retain = false) {
  return vm.runInNewContext('(function(msg) {' + filter.func + '\n})(msg)', {msg:{payload, retain}, context, Buffer});
}
const event = {event:'NEXT', bootId:'0123456789abcdef', sequence:1};
assert.equal(receive(JSON.stringify(event)).payload, 'NEXT');
assert.equal(receive(event), null, 'Duplicate must not advance twice');
assert.equal(receive({...event, sequence:2}).payload, 'NEXT');
assert.equal(receive(event), null, 'Older events must be ignored');
assert.equal(receive({...event, bootId:'abcdef0123456789'}).payload, 'NEXT', 'New boot can restart sequence');
assert.equal(receive({...event, sequence:3}, true), null, 'Retained events must not advance');
for (const invalid of ['NEXT', '{', null, {...event, sequence:-1}, {...event, sequence:1.5}, {...event, bootId:'bad'}, {...event, event:'OTHER'}]) {
  assert.equal(receive(invalid), null);
}
assert.equal(receive(Buffer.from(JSON.stringify({...event, sequence:3}))).payload, 'NEXT');
const ids = new Set(nodes.map(n => n.id));
for (const n of nodes) for (const outputs of n.wires || []) for (const id of outputs) assert.ok(ids.has(id), 'Dangling wire: ' + id);
console.log('PASS: QoS 1 subscription, duplicates, order, reboot, invalid/retained events, Buffer and flow wiring');
