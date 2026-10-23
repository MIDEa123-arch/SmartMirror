// Run against the isolated dashboard at 1881. Test traffic uses a local MQTT broker.
// npm install --prefix .runtime/qa playwright aedes@0.51.3 mqtt
const fs=require('node:fs');
const assert=require('node:assert/strict');
const net=require('node:net');
const aedes=require('../.runtime/qa/node_modules/aedes')();
const mqtt=require('../.runtime/qa/node_modules/mqtt');
const {chromium}=require('../.runtime/qa/node_modules/playwright');
const saved=fs.readFileSync('flows.json','utf8');
const deploy=async nodes=>{const r=await fetch('http://127.0.0.1:1881/flows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(nodes)});assert.equal(r.status,204)};
(async()=>{
 const server=net.createServer(aedes.handle);await new Promise(r=>server.listen(1884,'127.0.0.1',r));
 let client,browser,timer;
 try {
   const flow=JSON.parse(saved);const broker=flow.find(n=>n.type==='mqtt-broker');broker.broker='127.0.0.1';broker.port=1884;
   await deploy(flow);
   client=await mqtt.connectAsync('mqtt://127.0.0.1:1884');
   await client.subscribeAsync('smartmirror/demo01/cmd/#',{qos:1});
   const pub=(tail,payload,retain=false)=>client.publishAsync('smartmirror/demo01/'+tail,String(payload),{qos:1,retain});
   const commands=[];
   client.on('message',(topic,payload,packet)=>{commands.push({topic,payload:String(payload),qos:packet.qos});const key=topic.split('/').pop();void pub('state/'+key,payload,true)});
   browser=await chromium.launch({headless:true,channel:'msedge'});
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:1881/dashboard/guong-thong-minh');await page.locator('.sm h1').waitFor();
   const telemetry=async()=>{await pub('status','online',true);await pub('sensor/temperature','28.5');await pub('sensor/humidity','65')};
   timer=setInterval(()=>void telemetry(),2000);
   await telemetry();await pub('state/mode','MANUAL',true);await pub('state/fan','OFF',true);await pub('state/light','180',true);await pub('state/active','ACTIVE',true);
   await page.getByRole('button',{name:'Bật quạt',exact:true}).click();
   await page.getByRole('button',{name:'Tắt quạt',exact:true}).waitFor();
   assert.ok(commands.some(c=>c.topic.endsWith('/fan')&&c.payload==='ON'&&c.qos===1));
   const mirror=await browser.newPage();await mirror.goto('http://127.0.0.1:1881/dashboard/guong');await mirror.locator('.sm h1').waitFor();
   assert.equal(await mirror.locator('.sm h1').innerText(),'Tổng quan');
   const event=JSON.stringify({event:'NEXT',bootId:'0011223344556677',sequence:1});
   await pub('event/page',event);await mirror.getByRole('heading',{name:'Thời tiết',exact:true}).waitFor();
   await pub('event/page',event);await mirror.waitForTimeout(500);assert.equal(await mirror.locator('.sm h1').innerText(),'Thời tiết');
   await pub('event/page',JSON.stringify({event:'NEXT',bootId:'0011223344556677',sequence:2}));await mirror.getByRole('heading',{name:'Lịch & nhắc việc',exact:true,level:1}).waitFor();
   await page.getByPlaceholder('Đà Nẵng, Hà Nội…').fill('Da Nang');await page.getByRole('button',{name:'Tìm địa điểm',exact:true}).click();
   await page.locator('.sm-places button').first().waitFor({timeout:20000});await page.locator('.sm-places button').first().click();
   await page.locator('.sm-weather').waitFor({timeout:25000});
   await page.getByPlaceholder('Ví dụ: Họp nhóm đồ án').fill('QA reminder');
   const at=new Date(Date.now()+10*60000+7*3600000).toISOString().slice(0,16);
   await page.locator('input[type=datetime-local]').fill(at);await page.getByRole('button',{name:'Thêm nhắc việc',exact:true}).click();
   await mirror.getByText('QA reminder',{exact:true}).waitFor();
   await mirror.screenshot({path:'.runtime/mirror-agenda.png',fullPage:true});
   await pub('state/active','SLEEP',true);await mirror.locator('.sm-sleep-label').waitFor();
   await pub('state/active','ACTIVE',true);await mirror.getByRole('heading',{name:'Tổng quan',exact:true}).waitFor();
   await mirror.screenshot({path:'.runtime/mirror-active.png',fullPage:true});
   await page.screenshot({path:'.runtime/dashboard-populated.png',fullPage:true});
   clearInterval(timer);await pub('status','offline',true);
   await page.waitForFunction(()=>document.querySelector('.sm-status').textContent.includes('Chờ ESP32'));
   assert.equal(await page.getByRole('button',{name:'Tắt quạt',exact:true}).isDisabled(),true);
   await page.locator('.sm-task').filter({hasText:'QA reminder'}).getByRole('button',{name:'Xóa',exact:true}).click();
   await page.getByRole('button',{name:'Xóa vị trí đã lưu',exact:true}).click();
   assert.deepEqual(errors,[]);
   console.log('PASS: local MQTT QoS1, command/state acknowledgement, page switching, deduplication, sleep/wake reset, live geocoding/weather, reminder sync and offline controls');
 } finally {
   clearInterval(timer);if(browser)await browser.close();if(client)await client.endAsync();
   await deploy(JSON.parse(saved));fs.writeFileSync('flows.json',saved);
   await new Promise(r=>aedes.close(r));await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
