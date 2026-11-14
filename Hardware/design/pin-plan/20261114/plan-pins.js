'use strict';
// Assign GPIOs using the existing pad locations. This is not a PCB router and
// never modifies PCB files, footprints, pad nets, copper, or component positions.
const fs=require('fs'),path=require('path');
const l=require('./pcb-readonly.json');
const E=require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/eprj3');
const nets=['LCD_PWR_EN','LCD_RST_N','LCD_DC','LCD_BL_N','AMP_PWR_EN','AMP_SD'];
const controller=l.layout.find(c=>c.ref==='U1');
const records=E.readRecords(path.resolve(__dirname,'../../../桌灵 · DeskSprite/sch/Schematic1/03_主控与按键.esch2'));
const pinToGpio={};let docType;
for(const r of records){if(r.type==='DOCHEAD'){docType=r.body.docType;continue;}if(docType!=='SYMBOL'||r.type!=='ATTR'||r.body.key!=='Pin Number')continue;
 const label=records.find(v=>v.type==='ATTR'&&v.body.parentId===r.body.parentId&&v.body.partId===r.body.partId&&v.body.key==='Pin Name');
 const m=/^P(\d+)(?:\/|$)/.exec(label?.body.value||'');if(m&&Number(r.body.value)<=40)pinToGpio[r.body.value]=Number(m[1]);
}
const gpioToPin=Object.fromEntries(Object.entries(pinToGpio).map(([p,g])=>[g,p]));
const current=Object.fromEntries(nets.map(net=>[net,pinToGpio[controller.pads.find(p=>p.net===net).n]]));
if(Object.values(current).some(v=>v===undefined))throw Error('Cannot resolve GPIO names from actual symbol');
const allowed={LCD_PWR_EN:[1,6,7,9,24,25,28],LCD_RST_N:[1,6,7,9,24,25,28],LCD_DC:[1,5,6,7,9,24,25,28],LCD_BL_N:[6,7,9,18,19,24,25],AMP_PWR_EN:[14,15,16,17,18,19,40,41,42,43],AMP_SD:[14,15,16,17,18,19,40,41,42,43]};
const excluded=new Set(['GND','3V3','VDDGPIO']);
const signalNames=[...new Set(controller.pads.map(p=>p.net).filter(n=>n&&!excluded.has(n)))];
function tree(points,net){if(points.length<2)return[];const connected=new Set([0]),out=[];while(connected.size<points.length){let best;for(const i of connected)for(let j=0;j<points.length;j++)if(!connected.has(j)){const a=points[i],b=points[j],length=Math.hypot(a.x-b.x,a.y-b.y);if(!best||length<best.length)best={a,b,j,length,net};}connected.add(best.j);out.push(best);}return out;}
function edges(net,gpio){const points=l.layout.flatMap(c=>c.ref==='U1'?[controller.pads.find(p=>p.n===(gpio===undefined?controller.pads.find(p=>p.net===net).n:gpioToPin[gpio]))]:c.pads.filter(p=>p.net===net));return tree(points,net);}
function cross(a,b){if(a.net===b.net)return false;const side=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return side(a.a,a.b,b.a)*side(a.a,a.b,b.b)<-1e-7&&side(b.a,b.b,a.a)*side(b.a,b.b,a.b)<-1e-7;}
const fixed=signalNames.filter(n=>!nets.includes(n)).flatMap(n=>edges(n));
const fixedCross=fixed.reduce((sum,e,i)=>sum+fixed.slice(i+1).filter(f=>cross(e,f)).length,0);
const candidates=nets.map(net=>allowed[net].map(gpio=>{const e=edges(net,gpio);return {net,gpio,pin:gpioToPin[gpio],edges:e,fixedCross:e.reduce((n,a)=>n+fixed.filter(b=>cross(a,b)).length,0),lengthMm:e.reduce((n,a)=>n+a.length*.0254,0),changed:current[net]!==gpio};}));
const pair=new Map();for(let i=0;i<nets.length;i++)for(let j=i+1;j<nets.length;j++)for(const a of candidates[i])for(const b of candidates[j])pair.set(i+':'+a.gpio+':'+j+':'+b.gpio,a.edges.reduce((n,e)=>n+b.edges.filter(f=>cross(e,f)).length,0));
function metrics(items){let related=0,length=0,changed=0;for(let i=0;i<items.length;i++){const a=items[i];related+=a.fixedCross;length+=a.lengthMm;changed+=a.changed?1:0;for(let j=0;j<i;j++)related+=pair.get(j+':'+items[j].gpio+':'+i+':'+a.gpio)||0;}return {controlRelatedCrossings:related,allSignalCrossings:fixedCross+related,controlTreeLengthMm:length,changedGpios:changed,secondaryCost:length+changed*.5};}
let best,checked=0;
function search(i,chosen,used,crossCount,length,changes){if(best&&crossCount>best.metrics.controlRelatedCrossings)return;if(i===nets.length){checked++;const m=metrics(chosen);if(!best||m.controlRelatedCrossings<best.metrics.controlRelatedCrossings||(m.controlRelatedCrossings===best.metrics.controlRelatedCrossings&&m.secondaryCost<best.metrics.secondaryCost))best={items:[...chosen],metrics:m};return;}
 for(const c of candidates[i]){if(used.has(c.gpio))continue;let count=crossCount+c.fixedCross;for(let j=0;j<i;j++)count+=pair.get(j+':'+chosen[j].gpio+':'+i+':'+c.gpio)||0;chosen.push(c);used.add(c.gpio);search(i+1,chosen,used,count,length+c.lengthMm,changes+(c.changed?1:0));used.delete(c.gpio);chosen.pop();}}
search(0,[],new Set(),0,0,0);
const beforeItems=nets.map(n=>{const gpio=current[n],e=edges(n,gpio);return {net:n,gpio,edges:e,fixedCross:e.reduce((n,a)=>n+fixed.filter(b=>cross(a,b)).length,0),lengthMm:e.reduce((n,a)=>n+a.length*.0254,0),changed:false};});
// The baseline may use GPIO8/23, which are deliberately excluded from the new
// sensitive outputs. Evaluate its pair crossings directly instead of cache.
function baselineMetrics(items){let related=0,length=0;for(let i=0;i<items.length;i++){related+=items[i].fixedCross;length+=items[i].lengthMm;for(let j=0;j<i;j++)for(const a of items[i].edges)related+=items[j].edges.filter(b=>cross(a,b)).length;}return {controlRelatedCrossings:related,allSignalCrossings:fixedCross+related,controlTreeLengthMm:length};}
const result={pcbSha256:l.sha256,assumptions:['Exact PCB pad positions are read only.','Count proper intersections in straight-line minimum spanning trees for MCU signal nets; omit GND/3V3/VDDGPIO planes.','This is an aid to pin planning, not proof of routed length, layer count, or achievable DRC.','Pinout of J2, hardware SPI1, UART0, fixed analog pins, and all PCB data remain unchanged.','New power/shutdown/PWM pins avoid the documented power-up glitch GPIO list.'],checkedAssignments:checked,fixedSignalCrossings:fixedCross,before:baselineMetrics(beforeItems),after:best.metrics,mapping:best.items.map(c=>({net:c.net,beforeGpio:current[c.net],beforePin:gpioToPin[current[c.net]],gpio:c.gpio,pin:c.pin,edges:c.edges})),gpioToPin};
fs.writeFileSync(path.join(__dirname,'pin-plan.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checkedAssignments:checked,before:result.before,after:result.after,mapping:result.mapping.map(({edges,...p})=>p)}));
