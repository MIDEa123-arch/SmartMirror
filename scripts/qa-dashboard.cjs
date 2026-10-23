// Optional visual/API smoke check. npm install --prefix .runtime/qa playwright
const assert = require('node:assert/strict');
const {chromium} = require('../.runtime/qa/node_modules/playwright');
(async()=>{
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1881/dashboard/guong-thong-minh');
 await page.locator('.sm h1').waitFor();
 assert.equal(await page.locator('.sm h1').innerText(),'Không gian của bạn');
 await page.screenshot({path:'.runtime/dashboard-desktop.png',fullPage:true});
 await page.locator('.sm-form input[placeholder]').last().fill('Da Nang');
 await page.getByRole('button',{name:'Tìm địa điểm',exact:true}).click();
 await page.locator('.sm-places button').first().waitFor({timeout:20000});
 console.log('PASS live geocoding:',await page.locator('.sm-places button').first().innerText());
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'.runtime/dashboard-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile overflow');
 await page.goto('http://127.0.0.1:1881/dashboard/guong');
 await page.locator('.sm-sleep-label').waitFor();
 await page.screenshot({path:'.runtime/mirror-sleep.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS desktop/mobile UI, sleep view and no browser errors');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
