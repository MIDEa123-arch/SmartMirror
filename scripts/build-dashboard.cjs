// Compile editable Node-RED function / Vue sources into one importable flows.json.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'flows.json');
const privateMqtt = process.env.SMARTMIRROR_MQTT_MODE === 'private';
const mqttSettings = privateMqtt ? JSON.parse(fs.readFileSync(path.join(root,'.runtime','mosquitto','smartmirror-mqtt.json'),'utf8')) : null;
const outputFile = process.env.SMARTMIRROR_FLOW_OUTPUT ? path.resolve(process.env.SMARTMIRROR_FLOW_OUTPUT) : file;
let nodes = JSON.parse(fs.readFileSync(file,'utf8'));
const tab = nodes.find(n=>n.id==='sm-state')?.z || nodes.find(n=>n.type==='tab').id;
const base = nodes.find(n=>n.type==='ui-base');
const brokerConfig = nodes.find(n=>n.type==='mqtt-broker');
const broker = brokerConfig.id;
const admin = nodes.find(n=>n.type==='ui-page' && n.id!=='sm-mirror-page');
const theme = nodes.find(n=>n.type==='ui-theme');
const removeTypes = ['ui-dropdown','ui-switch','ui-slider'];
const removeIds = ['0b6550e29646b458','0b0643f02c50d643','10b40d889be99762','de154ce792883ea2','6f5ebc938f7f5bee','19ab4be81be58f55','aa77e6bd0abfd9ba','84f4f819b0687eba'];
nodes = nodes.filter(n=>!removeTypes.includes(n.type) && !removeIds.includes(n.id) && !n.id.startsWith('sm-'));
brokerConfig.broker=privateMqtt ? mqttSettings.host : 'broker.emqx.io';
brokerConfig.port=privateMqtt ? mqttSettings.port : 8883;
brokerConfig.usetls=true;
brokerConfig.verifyservercert=true;
brokerConfig.tls='sm-mqtt-tls-config';
delete brokerConfig.credentials;
nodes.push({id:'sm-mqtt-tls-config',type:'tls-config',name:'MQTT TLS · xác minh chứng chỉ',certType:'files',cert:'',key:'',p12:'',p12name:'',ca:'',certname:'',keyname:'',caname:'',servername:brokerConfig.broker,verifyservercert:true,alpnprotocol:'',certEnv:'',keyEnv:'',caEnv:'',credentials:{}});
const retiredTopics=new Set(['smartmirror/demo01/state/fan','smartmirror/demo01/state/mode','smartmirror/demo01/state/light-mode','smartmirror/demo01/state/light-manual']);
nodes=nodes.filter(n=>!(n.type==='mqtt in'&&retiredTopics.has(n.topic)));
const add = n=>nodes.push(n);
const fn = (id,name,func,wires,x,y,outputs=1) => add({id,type:'function',z:tab,name,func,outputs,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x,y,wires});
nodes.find(n=>n.type==='tab').label='SmartMirror · Thiết bị & giao diện';
base.name='SmartMirror'; base.allowInstall=false;
admin.name='Lịch hoạt động';admin.order=2;admin.icon='calendar-month';
admin.breakpoints=[{name:'Mobile',px:'0',cols:'3'},{name:'Tablet',px:'576',cols:'6'},{name:'Desktop',px:'1024',cols:'12'}];
theme.colors={surface:'#10191e',primary:'#83d9c3',bgPage:'#081014',groupBg:'#10191e',groupOutline:'#24363d'};
add({...admin,id:'sm-mirror-page',name:'Gương',path:'/guong',order:1,icon:'monitor',className:'sm-mirror-view'});
for(const [id,page] of [['sm-admin-group',admin.id],['sm-mirror-group','sm-mirror-page']]) add({id,type:'ui-group',name:'',page,width:'12',height:1,order:1,showTitle:false,className:'',visible:'true',disabled:'false',groupType:'default'});
const vue=fs.readFileSync(path.join(root,'node-red/dashboard.vue'),'utf8');
for(const [id,mirror,group] of [['sm-admin-ui',false,'sm-admin-group'],['sm-mirror-ui',true,'sm-mirror-group']]) {
    add({id,type:'ui-template',z:tab,group,page:'',ui:'',name:mirror?'Gương · 3 trang':'Lịch · ứng dụng di động',order:1,width:0,height:0,head:mirror?'':'<link rel="manifest" href="/mobile/manifest.webmanifest"><meta name="theme-color" content="#10201f"><meta name="mobile-web-app-capable" content="yes">',format:vue.replace('__MIRROR__',String(mirror)),storeOutMessages:false,passthru:false,resendOnRefresh:true,templateScope:'local',className:'',x:1100,y:mirror?180:240,wires:[['sm-state']]});
}
for(const n of nodes.filter(n=>n.type==='mqtt in')) {
    if(n.topic.endsWith('event/page')) continue;
    n.wires[0]=[...new Set([...n.wires[0],'sm-state'])];
}
const stateInputs = {lamp:'Đèn gương tự động',light:'Độ sáng tự động','light-sensor':'Cảm biến ánh sáng',page:'Trang TFT'};
for(const [suffix,name] of Object.entries(stateInputs)) add({id:'sm-input-'+suffix,type:'mqtt in',z:tab,name,topic:'smartmirror/demo01/state/'+suffix,qos:'1',datatype:'auto-detect',broker,nl:false,rap:true,rh:0,inputs:0,x:220,y:650,wires:[['sm-state']]});
for(const suffix of ['lamp','light']) {
    const id='sm-debug-'+suffix;
    add({id,type:'debug',z:tab,name:'',active:true,tosidebar:true,console:false,tostatus:false,complete:'payload',targetType:'msg',x:570,y:650,wires:[]});
    nodes.find(n=>n.id==='sm-input-'+suffix).wires[0].push(id);
}
const dedup=nodes.find(n=>n.id==='page-event-dedup');dedup.wires[0]=[...new Set([...dedup.wires[0],'sm-state'])];
dedup.func=dedup.func.replace("event.event !== 'NEXT'", "!['NEXT','PREV'].includes(event.event)").replace("msg.payload = 'NEXT';", "msg.payload = event.event;");
const stateWires=[['sm-admin-ui','sm-mirror-ui'],['sm-command-out'],['sm-http'],[]];
fn('sm-state','Trạng thái gương / xác thực lệnh',fs.readFileSync(path.join(root,'node-red/state.js'),'utf8'),stateWires,750,200,4);
nodes.find(n=>n.id==='sm-state').initialize="flow.set('mirror', null);";
fn('sm-mobile-api','API lịch cho ứng dụng Android',fs.readFileSync(path.join(root,'node-red/mobile-api.js'),'utf8'),[['sm-api-response'],['sm-state']],490,560,2);
for (const [id,name,url,method,y] of [
    ['sm-api-get','Đọc lịch','/api/calendar','get',470],
    ['sm-api-post','Thêm hoạt động','/api/calendar','post',520],
    ['sm-api-put','Sửa / hoàn tất','/api/calendar/:id','put',570],
    ['sm-api-delete','Xóa hoạt động','/api/calendar/:id','delete',620]
]) add({id,type:'http in',z:tab,name,url,method,upload:false,swaggerDoc:'',x:180,y,wires:[['sm-mobile-api']]});
add({id:'sm-api-response',type:'http response',z:tab,name:'Phản hồi JSON cho ứng dụng',statusCode:'',headers:{},x:800,y:550,wires:[]});
if (process.env.SMARTMIRROR_SERIAL_PORT) {
    const serialId='sm-serial-config';
    add({id:serialId,type:'serial-port',serialport:process.env.SMARTMIRROR_SERIAL_PORT,serialbaud:'115200',databits:'8',parity:'none',stopbits:'1',waitfor:'',dtr:'none',rts:'none',cts:'none',dsr:'none',newline:'\\n',bin:'false',out:'char',addchar:'',responsetimeout:'10000',serialConfig:null,enabled:true});
    add({id:'sm-serial-in',type:'serial in',z:tab,name:'ESP32 · trạng thái qua USB',serial:serialId,x:200,y:950,wires:[['sm-serial-normalize']]});
    fn('sm-serial-normalize','Chỉ nhận telemetria có tiền tố hợp lệ',"const raw=Buffer.isBuffer(msg.payload)?msg.payload.toString('utf8'):String(msg.payload||'');\nconst line=raw.replace(/[\\r\\n]+$/,'');\nconst m=line.match(/^@SMARTMIRROR\\|([a-z0-9/_-]{1,48})\\|([^\\r\\n]{1,64})$/);\nif(!m)return null;\nreturn {topic:'smartmirror/demo01/'+m[1],payload:m[2],serial:true};",[['sm-state']],490,950);
    add({id:'sm-serial-out',type:'serial out',z:tab,name:'Lịch trong ngày → ESP32',serial:serialId,x:1100,y:950,wires:[]});
    nodes.find(n=>n.id==='sm-state').wires[3]=['sm-serial-out'];
}
add({id:'sm-tick',type:'inject',z:tab,name:'Làm mới / phát hiện dữ liệu cũ',props:[{p:'topic',vt:'str'}],topic:'tick',repeat:'5',crontab:'',once:true,onceDelay:1,x:240,y:780,wires:[['sm-state']]});
add({id:'sm-command-out',type:'mqtt out',z:tab,name:'Lệnh được xác thực · QoS 1',topic:'',qos:'1',retain:'false',broker,x:1100,y:330,wires:[]});
add({id:'sm-broker-status',type:'status',z:tab,name:'Kết nối broker',scope:nodes.filter(n=>n.type==='mqtt in').map(n=>n.id),x:210,y:850,wires:[['sm-broker-normalize']]});
fn('sm-broker-normalize','Broker trực tuyến?',"return {topic:'broker',payload:msg.status?.fill === 'green'};",[['sm-state']],470,850);
add({id:'sm-http',type:'http request',z:tab,name:'Open-Meteo · HTTPS',method:'GET',ret:'obj',paytoqs:'ignore',url:'',tls:'',persist:false,proxy:'',insecureHTTPParser:false,authType:'',senderr:false,headers:[],requestTimeout:'15000',x:1100,y:420,wires:[['sm-state']]});
add({id:'sm-http-catch',type:'catch',z:tab,name:'API lỗi → thông báo, giữ dữ liệu cũ',scope:['sm-http'],uncaught:false,x:1070,y:490,wires:[['sm-state']]});
// Separate acquisition, processing and presentation. Link nodes keep long wires off-canvas.
const mqttTab='sm-tab-mqtt', uiTab='sm-tab-ui';
nodes.find(n=>n.id===tab).label='02 · Xử lý và API';
add({id:mqttTab,type:'tab',label:'01 · ESP32 và MQTT',disabled:false,info:'Nhận số đo và trạng thái, kiểm tra sự kiện nút nhấn, chuyển tới tab xử lý.'});
add({id:uiTab,type:'tab',label:'03 · Giao diện',disabled:false,info:'Hai màn hình Dashboard nhận chung trạng thái và gửi yêu cầu về tab xử lý.'});
function link(id,type,z,name,x,y,links,wires=[]) { add({id,type,z,name,mode:'link',links,x,y,wires}); }
link('sm-data-out','link out',mqttTab,'Sang xử lý',850,350,['sm-data-in']);
link('sm-data-in','link in',tab,'Dữ liệu ESP32',160,180,['sm-data-out'],[['sm-state']]);
link('sm-snapshot-out','link out',tab,'Sang giao diện',840,140,['sm-snapshot-in']);
link('sm-snapshot-in','link in',uiTab,'Trạng thái chung',140,180,['sm-snapshot-out'],[['sm-admin-ui','sm-mirror-ui']]);
link('sm-ui-out','link out',uiTab,'Yêu cầu người dùng',780,260,['sm-ui-in']);
link('sm-ui-in','link in',tab,'Từ giao diện',160,260,['sm-ui-out'],[['sm-state']]);
const inputNames={'sensor/temperature':'Nhiệt độ','sensor/humidity':'Độ ẩm','event/page':'Vuốt chuyển trang','state/active':'ACTIVE / SLEEP','status':'ESP32 online / offline'};
for(const [suffix,name] of Object.entries(stateInputs)) inputNames['state/'+suffix]=name;
let row=0;
for(const n of nodes.filter(n=>n.type==='mqtt in')) {
    n.z=mqttTab;n.x=210;n.y=130+row++*80;
    n.name=inputNames[n.topic.replace('smartmirror/demo01/','')];
    n.wires=n.wires.map(ws=>ws.map(id=>id==='sm-state'?'sm-data-out':id));
    for(const id of n.wires.flat()) { const d=nodes.find(d=>d.id===id);if(d?.type==='debug'){d.z=mqttTab;d.x=570;d.y=n.y;d.name='Xem '+n.name.toLowerCase();d.active=d.id.startsWith('sm-debug-');} }
}
dedup.z=mqttTab;dedup.x=520;dedup.y=290;dedup.name='Vuốt · loại bản tin trùng';
dedup.wires=dedup.wires.map(ws=>ws.map(id=>id==='sm-state'?'sm-data-out':id));
const pageDebug=nodes.find(n=>n.id==='22ce5028265d1c2f');pageDebug.z=mqttTab;pageDebug.x=800;pageDebug.y=240;pageDebug.name='Xem vuốt hợp lệ';pageDebug.active=false;
const brokerStatusY = 130 + row * 80 + 30;
const positions={ 'sm-state':[490,220], 'sm-tick':[260,360], 'sm-command-out':[850,220], 'sm-http':[850,380], 'sm-http-catch':[520,460], 'sm-admin-ui':[440,140], 'sm-mirror-ui':[440,300], 'sm-broker-status':[210,brokerStatusY], 'sm-broker-normalize':[560,brokerStatusY], 'sm-mobile-api':[490,640], 'sm-api-response':[820,700] };
for(const [id,[x,y]] of Object.entries(positions)){const n=nodes.find(n=>n.id===id);n.x=x;n.y=y;}
for(const id of ['sm-admin-ui','sm-mirror-ui']) {const n=nodes.find(n=>n.id===id);n.z=uiTab;n.wires=[['sm-ui-out']];}
for(const id of ['sm-broker-status','sm-broker-normalize'])nodes.find(n=>n.id===id).z=mqttTab;
nodes.find(n=>n.id==='sm-broker-normalize').wires=[['sm-data-out']];
nodes.find(n=>n.id==='sm-state').wires[0]=['sm-snapshot-out'];
function comment(id,z,name,x,y){add({id,type:'comment',z,name,info:'',x,y,wires:[]});}
comment('sm-heading-mqtt',mqttTab,'01  NHẬN DỮ LIỆU TỪ ESP32',240,50);
comment('sm-heading-state',tab,'02  QUẢN LÝ TRẠNG THÁI VÀ API',340,60);
comment('sm-heading-ui',uiTab,'03  HIỂN THỊ VÀ ĐIỀU KHIỂN',320,60);
nodes=[...nodes.filter(n=>n.type==='tab').sort((a,b)=>a.label.localeCompare(b.label)),...nodes.filter(n=>n.type!=='tab')];
for(const n of nodes) if(n.wires) n.wires=n.wires.map(ws=>[...new Set(ws)]);
fs.mkdirSync(path.dirname(outputFile),{recursive:true});
fs.writeFileSync(outputFile,JSON.stringify(nodes,null,4)+'\n');
console.log('Built '+path.relative(root,outputFile)+': '+nodes.length+' nodes'+(privateMqtt?' · private MQTT/TLS':''));

