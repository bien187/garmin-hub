import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:393,height:852}, isMobile:true, hasTouch:true, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,160)));
async function insets(){ await p.addStyleTag({content:":root{--sat:59px!important;--sab:34px!important}"}); }
await p.goto("http://localhost:3000/login",{waitUntil:"domcontentloaded"}); await insets();
await p.fill("input[type=password]","dev"); await p.click("button[type=submit]"); await p.waitForTimeout(3000);
await p.goto("http://localhost:3000/activities",{waitUntil:"domcontentloaded"}); await insets(); await p.waitForTimeout(3500);
const r = await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('a[href^="/activities/"]')];
  const sichtbar=rows.filter(a=>{const b=a.getBoundingClientRect();return b.top>=0&&b.bottom<=window.innerHeight-90&&b.height>10;});
  const gruppen=[...document.querySelectorAll('div')].filter(d=>/Diese Woche|Letzte Woche/.test(d.textContent||"")&&d.children.length===0).length;
  const h1=document.querySelector('h1');
  return { zeilenSichtbar:sichtbar.length, rowH:rows[0]?Math.round(rows[0].getBoundingClientRect().height):null, hScroll:document.documentElement.scrollWidth>window.innerWidth+1, hatH1:Boolean(h1) };
});
console.log(JSON.stringify(r), "| Fehler:", errs.length?errs.slice(0,2).join(" | "):"keine");
await p.screenshot({path:"/tmp/ghq-list.png"});
await b.close();
