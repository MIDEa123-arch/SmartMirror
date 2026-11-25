// Run against the isolated dashboard at 1881. Test traffic uses a local MQTT broker.
// npm install --prefix .runtime/qa playwright aedes@0.51.3 mqtt
const fs=require('node:fs');
const assert=require('node:assert/strict');
const net=require('node:net');
process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'; // The local test trusts the checked-in private CA only in the test process.
const aedes=require('../.runtime/qa/node_modules/aedes')();
const mqtt=require('../.runtime/qa/node_modules/mqtt');
const {chromium}=require('../.runtime/qa/node_modules/playwright');
const saved=fs.readFileSync('flows.json','utf8');
const pairingCode=fs.readFileSync('.runtime/app-pairing-code.txt','utf8').trim();
const editorPassword=fs.readFileSync('.runtime/editor-password.txt','utf8').trim();
let editorToken;
const deploy=async nodes=>{
 if(!editorToken){const login=await fetch('https://127.0.0.1:1881/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'node-red-editor',grant_type:'password',scope:'*',username:'admin',password:editorPassword})});assert.equal(login.status,200);editorToken=(await login.json()).access_token;}
 const r=await fetch('https://127.0.0.1:1881/flows',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${editorToken}`},body:JSON.stringify(nodes)});assert.equal(r.status,204)
};
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
   client.on('message',(topic,payload,packet)=>{commands.push({topic,payload:String(payload),qos:packet.qos});if(topic.endsWith('/page'))void pub('state/page',payload,true)});
   browser=await chromium.launch({headless:true,channel:'msedge'});
   const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://127.0.0.1:1881/dashboard/guong-thong-minh');await page.locator('.sm h1').waitFor();
   const apiRoot='https://127.0.0.1:1881/api/calendar';
   let apiResult=await fetch(apiRoot);assert.equal(apiResult.status,401);
   const auth={'Authorization':`Bearer ${pairingCode}`};
   apiResult=await fetch(apiRoot,{headers:auth});assert.equal(apiResult.status,200);
   assert.ok(Array.isArray((await apiResult.json()).tasks));
   apiResult=await fetch(apiRoot,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({title:'API calendar check',at:Date.now()+3600000})});
   assert.equal(apiResult.status,201);const apiTask=(await apiResult.json()).task;
   apiResult=await fetch(`${apiRoot}/${encodeURIComponent(apiTask.id)}`,{method:'PUT',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({title:'API calendar updated',at:apiTask.at+60000,done:true})});
   assert.equal(apiResult.status,200);assert.equal((await apiResult.json()).task.done,true);
   let apiTasks=[];for(let i=0;i<10;i++){apiResult=await fetch(apiRoot,{headers:auth});apiTasks=(await apiResult.json()).tasks;if(apiTasks.some(t=>t.id===apiTask.id&&t.done))break;await new Promise(r=>setTimeout(r,50))}
   assert.ok(apiTasks.some(t=>t.id===apiTask.id&&t.title==='API calendar updated'&&t.done));
   apiResult=await fetch(`${apiRoot}/${encodeURIComponent(apiTask.id)}`,{method:'DELETE',headers:auth});assert.equal(apiResult.status,200);
   const telemetry=async()=>{await pub('status','online',true);await pub('sensor/temperature','28.5');await pub('sensor/humidity','65')};
   timer=setInterval(()=>void telemetry(),2000);
   await telemetry();await pub('state/lamp','OFF',true);await pub('state/light','140',true);await pub('state/active','ACTIVE',true);
   await page.getByRole('heading',{name:'Lịch hoạt động',exact:true}).waitFor();
   await page.getByRole('button',{name:'＋ Thêm',exact:true}).click();
   await page.getByPlaceholder('Ví dụ: Họp nhóm, tập thể dục…').fill('QA reminder');
   const vnNow=new Date(Date.now()+7*3600000);vnNow.setMinutes(vnNow.getMinutes()+10);
   await page.locator('input[type=datetime-local]').fill(vnNow.toISOString().slice(0,16));
   await page.getByRole('button',{name:'Lưu hoạt động',exact:true}).click();
   await page.getByText('QA reminder',{exact:true}).waitFor();
   const mirror=await context.newPage();await mirror.goto('https://127.0.0.1:1881/dashboard/guong');await mirror.locator('.sm h1').waitFor();
   assert.equal(await mirror.locator('.sm h1').innerText(),'Tổng quan');
   const bootId=require('node:crypto').randomBytes(8).toString('hex');
   const event=JSON.stringify({event:'NEXT',bootId,sequence:1});
   await pub('event/page',event);await mirror.getByRole('heading',{name:'Thời tiết',exact:true}).waitFor();
   await pub('event/page',event);await mirror.waitForTimeout(500);assert.equal(await mirror.locator('.sm h1').innerText(),'Thời tiết');
   await pub('event/page',JSON.stringify({event:'NEXT',bootId,sequence:2}));await mirror.getByRole('heading',{name:'Lịch hôm nay',exact:true,level:1}).waitFor();
   await pub('state/page','2');
   await page.getByPlaceholder('Đà Nẵng, Hà Nội…').fill('Da Nang');await page.getByRole('button',{name:'Tìm địa điểm',exact:true}).click();
   await page.locator('.sm-places button').first().waitFor({timeout:20000});await page.locator('.sm-places button').first().click();
   await page.locator('.sm-weather').waitFor({timeout:25000});
   if (process.env.REPORT_CAPTURE) await mirror.screenshot({path:'.runtime/mirror-weather.png',fullPage:true});
   await mirror.getByText('QA reminder',{exact:true}).waitFor();
   await mirror.screenshot({path:'.runtime/mirror-agenda.png',fullPage:true});
   await pub('state/active','SLEEP',true);await mirror.locator('.sm-sleep-label').waitFor();
   await pub('state/active','ACTIVE',true);await mirror.getByRole('heading',{name:'Tổng quan',exact:true}).waitFor();
   await mirror.screenshot({path:'.runtime/mirror-active.png',fullPage:true});
   await page.screenshot({path:'.runtime/dashboard-populated.png',fullPage:true});
   clearInterval(timer);await pub('status','offline',true);
   await page.waitForFunction(()=>document.querySelector('.sm-status').textContent.includes('Chờ ESP32'));
   assert.ok((await page.locator('.sm-status').innerText()).includes('Chờ ESP32'));
   await page.locator('.sm-calendar-event').filter({hasText:'QA reminder'}).getByRole('button',{name:'Xóa hoạt động',exact:true}).click();
   await page.getByRole('button',{name:'Xóa vị trí đã lưu',exact:true}).click();
   assert.deepEqual(errors,[]);
   console.log('PASS: local MQTT state, mobile calendar CRUD, today agenda sync, page switching, deduplication, sleep/wake reset, live geocoding/weather and offline status');
 } finally {
   clearInterval(timer);if(browser)await browser.close();if(client)await client.endAsync();
   await deploy(JSON.parse(saved));fs.writeFileSync('flows.json',saved);
   await new Promise(r=>aedes.close(r));await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
