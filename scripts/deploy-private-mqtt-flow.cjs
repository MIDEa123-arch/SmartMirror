// Deploy the generated private flow through Node-RED's authenticated API so MQTT
// credentials are encrypted into flows_cred.json instead of being left in flows.json.
const fs=require('node:fs');
const https=require('node:https');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.PORT||1881);
const ca=fs.readFileSync(path.join(root,'.runtime','tls','cert.pem'));
const editorPassword=fs.readFileSync(path.join(root,'.runtime','editor-password.txt'),'utf8').trim();
const nodes=JSON.parse(fs.readFileSync(path.join(root,'.runtime','flows.json'),'utf8'));
const mqttSettings=JSON.parse(fs.readFileSync(path.join(root,'.runtime','mosquitto','smartmirror-mqtt.json'),'utf8'));
const broker=nodes.find(node=>node.type==='mqtt-broker');
const tlsConfig=nodes.find(node=>node.id===broker?.tls);
if(!broker||!tlsConfig||broker.broker!==mqttSettings.host||broker.port!==mqttSettings.port)throw new Error('Generated flow does not match the private Mosquitto settings.');
broker.credentials={user:mqttSettings.username,password:mqttSettings.password};
tlsConfig.credentials={cadata:mqttSettings.caCertificate};
function request(method,url,body,token,contentType='application/json'){
  return new Promise((resolve,reject)=>{
    const data=body==null?null:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
    const req=https.request(url,{method,ca,rejectUnauthorized:true,headers:{...(data?{'Content-Type':contentType,'Content-Length':data.length}:{}),...(token?{Authorization:`Bearer ${token}`}:{})}},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));
    });
    req.on('error',reject);if(data)req.write(data);req.end();
  });
}
(async()=>{
  const origin=`https://127.0.0.1:${port}`;
  let token;
  for(let attempt=0;attempt<40;attempt++){
    try{
      const login=await request('POST',`${origin}/auth/token`,new URLSearchParams({client_id:'node-red-editor',grant_type:'password',scope:'*',username:'admin',password:editorPassword}).toString(),null,'application/x-www-form-urlencoded');
      if(login.status===200){token=JSON.parse(login.body).access_token;break;}
    }catch(_){}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!token)throw new Error('Node-RED HTTPS did not become ready for private MQTT deployment.');
  const deployed=await request('POST',`${origin}/flows`,nodes,token);
  if(deployed.status!==204&&deployed.status!==200)throw new Error(`Node-RED rejected private flow (${deployed.status}): ${deployed.body}`);
  console.log('Private MQTT flow deployed; credentials are stored in Node-RED encrypted credentials.');
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
