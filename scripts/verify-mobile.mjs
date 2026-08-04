import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const p = await ctx.newPage();
async function insets(){ await p.addStyleTag({ content: ":root{--sat:59px!important;--sab:34px!important}" }); }
await p.goto("http://localhost:3000/login", { waitUntil:"domcontentloaded" });
await insets();
const inputFs = await p.$eval("input[type=password]", el => getComputedStyle(el).fontSize);
console.log("Input font-size:", inputFs);
await p.fill("input[type=password]","dev"); await p.click("button[type=submit]"); await p.waitForTimeout(3000);
async function check(pfad){
  await p.goto("http://localhost:3000"+pfad, { waitUntil:"domcontentloaded" }); await p.waitForTimeout(2500);
  await insets(); await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const sc = document.getElementById("app-scroll");
    const pt = sc ? parseFloat(getComputedStyle(sc).paddingTop) : null;
    const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sat"))||0;
    const nav = document.querySelector("nav.fixed");
    const inter=[...document.querySelectorAll("button,a,input")].filter(e=>{const b=e.getBoundingClientRect();return b.width>4&&b.height>4&&b.top>=0&&b.top<160;});
    const top=inter.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
    return { hScroll:document.documentElement.scrollWidth>window.innerWidth+1, navBottom:nav?Math.round(nav.getBoundingClientRect().bottom):null, innerH:window.innerHeight, sat, scrollerPadTop:pt, topInter:top?Math.round(top.getBoundingClientRect().top):null };
  });
  const clears = r.topInter==null || r.topInter>=r.sat;
  console.log(`${pfad}: sat=${r.sat} scrollerPadTop=${r.scrollerPadTop} hScroll=${r.hScroll} nav=${r.navBottom}/${r.innerH} topInter=${r.topInter} clearsIsland=${clears}`);
  await p.screenshot({ path:`/tmp/ghq-m${pfad.replaceAll("/","_")||"_home"}.png` });
}
for (const pfad of ["/", "/activities", "/plan", "/body", "/map"]) await check(pfad);
await b.close();
