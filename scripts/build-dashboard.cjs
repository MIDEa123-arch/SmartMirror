// Compile editable Node-RED function / Vue sources into one importable flows.json.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'flows.json');
let nodes = JSON.parse(fs.readFileSync(file,'utf8'));
const tab = nodes.find(n=>n.type==='tab').id;
const base = nodes.find(n=>n.type==='ui-base');
const broker = nodes.find(n=>n.type==='mqtt-broker').id;
const admin = nodes.find(n=>n.type==='ui-page' && n.id!=='sm-mirror-page');
const theme = nodes.find(n=>n.type==='ui-theme');
const removeTypes = ['ui-dropdown','ui-switch','ui-slider'];
const removeIds = ['0b6550e29646b458','0b0643f02c50d643','10b40d889be99762','de154ce792883ea2','6f5ebc938f7f5bee','19ab4be81be58f55','aa77e6bd0abfd9ba','84f4f819b0687eba'];
nodes = nodes.filter(n=>!removeTypes.includes(n.type) && !removeIds.includes(n.id) && !n.id.startsWith('sm-'));
const add = n=>nodes.push(n);
const fn = (id,name,func,wires,x,y,outputs=1) => add({id,type:'function',z:tab,name,func,outputs,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x,y,wires});
nodes.find(n=>n.type==='tab').label='SmartMirror · Thiết bị & giao diện';
base.name='SmartMirror'; base.allowInstall=false;
admin.name='Điều khiển';admin.order=2;
admin.breakpoints=[{name:'Mobile',px:'0',cols:'3'},{name:'Tablet',px:'576',cols:'6'},{name:'Desktop',px:'1024',cols:'12'}];
theme.colors={surface:'#10191e',primary:'#83d9c3',bgPage:'#081014',groupBg:'#10191e',groupOutline:'#24363d'};
add({...admin,id:'sm-mirror-page',name:'Gương',path:'/guong',order:1,icon:'monitor',className:'sm-mirror-view'});
for(const [id,page] of [['sm-admin-group',admin.id],['sm-mirror-group','sm-mirror-page']]) add({id,type:'ui-group',name:'',page,width:'12',height:1,order:1,showTitle:false,className:'',visible:'true',disabled:'false',groupType:'default'});
const vue=fs.readFileSync(path.join(root,'node-red/dashboard.vue'),'utf8');
for(const [id,mirror,group] of [['sm-admin-ui',false,'sm-admin-group'],['sm-mirror-ui',true,'sm-mirror-group']]) {
    add({id,type:'ui-template',z:tab,group,page:'',ui:'',name:mirror?'Gương · 3 trang':'Điều khiển · di động',order:1,width:0,height:0,head:'',format:vue.replace('__MIRROR__',String(mirror)),storeOutMessages:false,passthru:false,resendOnRefresh:true,templateScope:'local',className:'',x:1100,y:mirror?180:240,wires:[['sm-state']]});
}
for(const n of nodes.filter(n=>n.type==='mqtt in')) {
    if(n.topic.endsWith('event/page')) continue;
    n.wires[0]=[...new Set([...n.wires[0],'sm-state'])];
}
for(const suffix of ['mode','light']) add({id:'sm-input-'+suffix,type:'mqtt in',z:tab,name:'Trạng thái '+suffix,topic:'smartmirror/demo01/state/'+suffix,qos:'1',datatype:'auto-detect',broker,nl:false,rap:true,rh:0,inputs:0,x:220,y:suffix==='mode'?650:710,wires:[['sm-state']]});
const dedup=nodes.find(n=>n.id==='page-event-dedup');dedup.wires[0]=[...new Set([...dedup.wires[0],'sm-state'])];
fn('sm-state','Trạng thái gương / xác thực lệnh',fs.readFileSync(path.join(root,'node-red/state.js'),'utf8'),[['sm-admin-ui','sm-mirror-ui'],['sm-command-out'],['sm-http']],750,200,3);
nodes.find(n=>n.id==='sm-state').initialize="flow.set('mirror', null);";
add({id:'sm-tick',type:'inject',z:tab,name:'Làm mới / phát hiện dữ liệu cũ',props:[{p:'topic',vt:'str'}],topic:'tick',repeat:'5',crontab:'',once:true,onceDelay:1,x:240,y:780,wires:[['sm-state']]});
add({id:'sm-command-out',type:'mqtt out',z:tab,name:'Lệnh được xác thực · QoS 1',topic:'',qos:'1',retain:'false',broker,x:1100,y:330,wires:[]});
add({id:'sm-broker-status',type:'status',z:tab,name:'Kết nối broker',scope:nodes.filter(n=>n.type==='mqtt in').map(n=>n.id),x:210,y:850,wires:[['sm-broker-normalize']]});
fn('sm-broker-normalize','Broker trực tuyến?',"return {topic:'broker',payload:msg.status?.fill === 'green'};",[['sm-state']],470,850);
add({id:'sm-http',type:'http request',z:tab,name:'Open-Meteo · HTTPS',method:'GET',ret:'obj',paytoqs:'ignore',url:'',tls:'',persist:false,proxy:'',insecureHTTPParser:false,authType:'',senderr:false,headers:[],requestTimeout:'15000',x:1100,y:420,wires:[['sm-state']]});
add({id:'sm-http-catch',type:'catch',z:tab,name:'API lỗi → thông báo, giữ dữ liệu cũ',scope:['sm-http'],uncaught:false,x:1070,y:490,wires:[['sm-state']]});
fs.writeFileSync(file,JSON.stringify(nodes,null,4)+'\n');
console.log('Built flows.json: '+nodes.length+' nodes');

