const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeTls = path.join(root, '.runtime', 'tls');
const keyPath = path.join(runtimeTls, 'key.pem');
const certPath = path.join(runtimeTls, 'cert.pem');
const appCertPath = path.join(root, 'mobile_app', 'assets', 'local-server-cert.pem');

async function main() {
  fs.mkdirSync(runtimeTls, {recursive:true});
  fs.mkdirSync(path.dirname(appCertPath), {recursive:true});
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    const selfsigned = require(path.join(root, '.runtime', 'node_modules', 'selfsigned'));
    const pems = await selfsigned.generate(
      [{name:'commonName',value:'localhost'}],
      {
        algorithm:'sha256',
        keySize:2048,
        extensions:[
          {name:'basicConstraints',cA:true},
          {name:'keyUsage',digitalSignature:true,keyCertSign:true,keyEncipherment:true},
          {name:'extKeyUsage',serverAuth:true},
          {name:'subjectAltName',altNames:[
            {type:2,value:'localhost'},
            {type:7,ip:'127.0.0.1'}
          ]}
        ]
      }
    );
    fs.writeFileSync(keyPath,pems.private,{mode:0o600});
    fs.writeFileSync(certPath,pems.cert);
    console.log('Generated a new local HTTPS certificate. Rebuild/reinstall the Android app to trust this certificate.');
  }
  const cert = fs.readFileSync(certPath);
  if (!fs.existsSync(appCertPath) || !fs.readFileSync(appCertPath).equals(cert)) {
    fs.writeFileSync(appCertPath,cert);
    console.log('Updated the Android app trust certificate. Rebuild/reinstall the app before connecting.');
  }
}

main().catch(error => { console.error(error); process.exitCode=1; });
