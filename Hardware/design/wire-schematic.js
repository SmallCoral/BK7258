/* Routes schematic wires from coordinates returned by the actual EDA client.
 * No pin coordinate is inferred from the symbol library.
 */
'use strict';
const fs=require('fs'),path=require('path');
const E=require(path.join(process.env.EPRJ3_SKILL||'C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill','scripts/lib/eprj3'));
const base=__dirname,manifest=JSON.parse(fs.readFileSync(path.join(base,'evidence/placement-manifest.json')));
const measured=JSON.parse(fs.readFileSync(path.join(base,'evidence/placed-pins.json')));
const baseline=path.join(base,'evidence/placement-baseline');fs.mkdirSync(baseline,{recursive:true});
const supply=new Set(['GND','AGND','3V3','5V_SYS','USB_VBUS','LCD_3V3','AMP_3V3','VIO']);
const globals=new Set(['3V3','GND','AGND','UART_RX','UART_TX','RESET_N','KEY_TALK_N','LCD_PWR_EN','LCD_BL_N','LCD_SCK','LCD_MOSI','LCD_CS_N','LCD_DC','LCD_RST_N','AUDLP','AUDLN','AMP_PWR_EN','AMP_SD','MICBIAS','MICP1','MICN1','MICP2','MICN2']);
function powerGroup(n,key){
  if(n===1)return key==='B3'?1:key==='B4'?2:0;
  const groups={2:[['J1','R1','R2','D1','C28'],['U2','R3','R4','C1','C2'],['F1','U3','L1','C3','C4','C5','C6','C7']],3:[['U1A','C8','C9'],['U1B','C10'],['SW1','C11'],['SW2','R5','C12']],4:[['U4','C13','C14','R6','R7'],['J2','R8','C15'],['Q1','R9','R10','R11']],5:[['MIC1','R12','C16','C17','C18','R13'],['U5','C19','C20','R14','R15'],['U6','R16','R17','C21','C22','R18','C23','R19','R20','R21','C24','C25','J3','R22','R23','C26','C27']]};
  return groups[n]?.findIndex(g=>g.includes(key))??0;
}
const snap=n=>Math.round(n/5)*5;
const key=p=>p.x+','+p.y;
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function simplify(points){const p=[];for(const a of points){if(p.length&&same(p.at(-1),a))continue;while(p.length>1&&((p.at(-2).x===p.at(-1).x&&p.at(-1).x===a.x)||(p.at(-2).y===p.at(-1).y&&p.at(-1).y===a.y)))p.pop();p.push(a);}return p;}
class Heap{constructor(){this.a=[]}push(v){let i=this.a.length;this.a.push(v);while(i){let p=(i-1)>>1;if(this.a[p].f<=v.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const r=this.a[0],v=this.a.pop();if(this.a.length){let i=0;while(true){let c=i*2+1;if(c>=this.a.length)break;if(c+1<this.a.length&&this.a[c+1].f<this.a[c].f)c++;if(this.a[c].f>=v.f)break;this.a[i]=this.a[c];i=c;}this.a[i]=v;}return r;}get size(){return this.a.length}}
const report=[];
for(const page of manifest.pages){
  const file=path.join(manifest.stage,'sch/Schematic1',page.title+'.esch2'),cache=path.join(baseline,page.title+'.esch2');
  if(!fs.existsSync(cache)||process.argv.includes('--refresh-baseline'))fs.copyFileSync(file,cache);
  const lines=E.readLines(cache),records=lines.map(E.parseRecord),last=records.map(r=>r.type).lastIndexOf('DOCHEAD');
  const main=records.slice(last+1),liveMap=new Map();for(const r of main){if(!liveMap.has(r.id)||(liveMap.get(r.id).ticket||0)<=(r.ticket||0))liveMap.set(r.id,r);}
  const live=[...liveMap.values()].filter(r=>Object.keys(r.body).length),attrs=live.filter(r=>r.type==='ATTR');
  let t=Math.max(...records.map(r=>r.ticket||0))+1,z=500;
  const additions=[],embeds=[],obstacles=[],occupied=new Map(),wires=[],allPins=[],groups=new Map();
  const measuredPage=measured.find(p=>p.uuid===page.uuid);
  const libDocs=new Map();let d;for(const r of records){if(r.type==='DOCHEAD'){d={head:r.body,recs:[]};libDocs.set(r.body.uuid,d)}else d.recs.push(r);}
  for(const c of page.parts){
    const pins=measuredPage.components.find(v=>v.key===c.key)?.pins;if(!pins)throw new Error('No client pin readback '+c.key);
    const sd=libDocs.get(c.symbol),pr=sd.recs.find(r=>r.type==='PART'&&r.id===c.partId),bb=pr.body.BBOX;
    // Transform only the body obstruction, not any pin positions.
    const ang=c.rotation*Math.PI/180,co=Math.cos(ang),si=Math.sin(ang);
    const corners=[[bb[0],bb[1]],[bb[0],bb[3]],[bb[2],bb[1]],[bb[2],bb[3]]].map(([x,y])=>({x:c.x+x*co-y*si,y:c.y+x*si+y*co}));
    obstacles.push({x1:Math.min(...corners.map(v=>v.x))-4,y1:Math.min(...corners.map(v=>v.y))-4,x2:Math.max(...corners.map(v=>v.x))+4,y2:Math.max(...corners.map(v=>v.y))+4,owner:c.key});
    for(const p of pins){const net=c.nets[String(p.pinNumber)];const a={x:Math.round(p.x*1e6)/1e6,y:Math.round(p.y*1e6)/1e6,rotation:p.rotation,num:String(p.pinNumber),ref:c.key,net};allPins.push(a);if(!net)continue;
      const groupKey=net+'@'+(supply.has(net)?powerGroup(page.n,c.key):0);
      if(!groups.has(groupKey))groups.set(groupKey,{net,points:[]});groups.get(groupKey).points.push(a);
    }
  }
  // Keep wires clear of displayed component fields and independent notes.
  for(const r of live){const b=r.body;if(r.type==='ATTR'&&b.valueVisible&&b.x!=null&&b.y!=null&&['Name','Designator'].includes(b.key)){
    let txt=b.value;if(!txt){const c=page.parts.find(c=>c.id===b.parentId);txt=c?.value||'';}if(!txt)continue;
    const f=b.fontSize||6.75;obstacles.push({x1:b.x-2,y1:b.y-1,x2:b.x+String(txt).length*f*.63+3,y2:b.y+f*1.4+2,text:true});
  }}
  function blocked(x,y,allowed){if(x<55||x>1550||y<125||y>1040)return true;return obstacles.some(o=>x>o.x1&&x<o.x2&&y>o.y1&&y<o.y2&&!allowed?.has(o.owner));}
  function reserve(points,net){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dir=a.x===b.x?'v':'h';if(a.x!==b.x&&a.y!==b.y)throw new Error('Diagonal wire');
    const len=dist(a,b),sx=Math.sign(b.x-a.x),sy=Math.sign(b.y-a.y);for(let n=0;n<=len;n+=5){const p={x:a.x+n*sx,y:a.y+n*sy},k=key(p),old=occupied.get(k);if(!old)occupied.set(k,{net,dir,terminal:n===0||n===len});else if(old.net===net){old.terminal ||= n===0||n===len;if(old.dir!==dir)old.dir='j';}else if(n===0||n===len||old.terminal)report.push({page:page.title,type:'wire-touch',at:k,nets:[old.net,net]});}
  }}
  function emit(points,net,visible=false){points=simplify(points);if(points.length<2)return;const block=E.wireBlock({segs:points.slice(1).map((b,i)=>({startX:points[i].x,startY:points[i].y,endX:b.x,endY:b.y})),zIndex:z++,ticketBase:t});t=block.nextTicket;additions.push(...block.lines);reserve(points,net);wires.push({id:block.wireId,net,points});return block;}
  function label(pt,net,rotation=0,align='LEFT_BOTTOM'){
    // NET belongs to a genuine short WIRE. It is never a decorative text label.
    const b=E.wireBlock({segs:[{startX:pt.x,startY:pt.y,endX:pt.x+(rotation?0:5),endY:pt.y+(rotation?-5:0)}],net,zIndex:z++,ticketBase:t});t=b.nextTicket;
    b.lines=b.lines.map(l=>{const r=E.parseRecord(l);if(r.type==='ATTR'&&r.body.key==='NET')Object.assign(r.body,{x:snap(pt.x+(rotation?0:5)),y:snap(pt.y+(rotation?-5:5)),rotation,fontSize:6.75,align,valueVisible:true});return E.formatRecord(r.head,r.body)});additions.push(...b.lines);wires.push({id:b.wireId,net,points:[pt,{x:pt.x+(rotation?0:5),y:pt.y+(rotation?-5:0)}]});
  }
  const powerCache=new Map();
  function flag(pt,net){let lib=powerCache.get(net);if(!lib){const su=E.uuid16(),du=E.uuid16(),style=/GND$/.test(net)?'down':'up';const spec={uuid:su,title:net,net,style,client:'e3a83983d959c621',source:'',ms:Date.now()};const sd=E.buildPowerSymbolDoc(spec),dd=E.buildDeviceDoc({uuid:du,title:net,designator:null,symbolUuid:su,client:spec.client,source:'',ms:spec.ms,attributes:{'Global Net Name':net,Name:net,'Add into BOM':'no','Convert to PCB':'no'}});embeds.push(...sd,...dd);lib={su,du,style};powerCache.set(net,lib);}
    const b=E.powerComponentBlock({compId:E.randId(),x:pt.x,y:pt.y,zIndex:z++,symbolUuid:lib.su,deviceUuid:lib.du,net,style:lib.style,ticketBase:t});t=b.nextTicket;additions.push(...b.lines);
  }
  function outlet(p){const dx=Math.round(Math.cos(p.rotation*Math.PI/180)),dy=Math.round(Math.sin(p.rotation*Math.PI/180));
    const q={x:p.x+dx*20,y:p.y+dy*20},s={x:snap(q.x),y:snap(q.y)},pts=[p,q];
    if(q.x!==s.x&&q.y!==s.y)pts.push({x:s.x,y:q.y});pts.push(s);return {p,end:s,path:simplify(pts)};
  }
  function route(start,goal,net){if(same(start,goal))return [start];const h=new Heap(),seen=new Map(),parents=new Map();
    const enc=(x,y,d)=>x+','+y+','+d,sk=enc(start.x,start.y,4);h.push({x:start.x,y:start.y,d:4,g:0,f:dist(start,goal),k:sk});seen.set(sk,0);let finish=null,count=0;
    while(h.size&&count++<170000){const a=h.pop();if(a.g!==seen.get(a.k))continue;if(a.x===goal.x&&a.y===goal.y){finish=a;break;}
      const occHere=occupied.get(key(a));
      for(const [di,[dx,dy]] of [[5,0],[-5,0],[0,5],[0,-5]].entries()){
        const x=a.x+dx,y=a.y+dy,b={x,y};if(blocked(x,y)&&!same(b,goal))continue;
        if(allPins.some(p=>p.net!==net&&Math.abs(p.x-x)<4&&Math.abs(p.y-y)<4))continue;
        const occ=occupied.get(key(b)),axis=di<2?'h':'v';
        if(occ&&occ.net!==net&&(occ.terminal||occ.dir===axis||occ.dir==='j'||same(b,goal)))continue;
        if(occHere&&occHere.net!==net&&a.d!==di)continue;
        const turn=a.d!==4&&a.d!==di?12:0,penalty=occ&&occ.net!==net?20:0;
        const g=a.g+5+turn+penalty,k=enc(x,y,di);if(g>=(seen.get(k)??Infinity))continue;
        seen.set(k,g);parents.set(k,a);h.push({x,y,d:di,k,g,f:g+dist(b,goal)});
      }
    }
    if(!finish)return null;const pts=[];for(let a=finish;a;a=parents.get(a.k))pts.push({x:a.x,y:a.y});return simplify(pts.reverse());
  }
  // Reserve pin stubs first: subsequent routes cannot accidentally touch a different pin.
  const ordered=[...groups.values()].sort((a,b)=>(supply.has(a.net)?1:0)-(supply.has(b.net)?1:0)||a.points.length-b.points.length);
  for(const g of ordered){g.outlets=g.points.map(outlet);for(const o of g.outlets)emit(o.path,g.net);}
  for(const g of ordered){
    const ends=g.outlets.map(o=>o.end),tree=[ends[0]],pending=ends.slice(1),paths=[];
    while(pending.length){let pick;for(let i=0;i<pending.length;i++)for(const target of tree){const d=dist(pending[i],target);if(!pick||d<pick.d)pick={i,target,d};}
      const p=pending.splice(pick.i,1)[0];let routed=route(p,pick.target,g.net);
      if(!routed){if(supply.has(g.net)){flag(p,g.net);report.push({page:page.title,type:'local-power-symbol',net:g.net,at:p});}else{report.push({page:page.title,type:'unrouted',net:g.net,from:p,to:pick.target});label(p,g.net);}tree.push(p);continue;}
      emit(routed,g.net);paths.push(routed);tree.push(p,...routed.slice(1,-1));
    }
    if(supply.has(g.net)){const ground=/GND$/.test(g.net);const pt=ends.reduce((best,p)=>ground?(p.y<best.y?p:best):(p.y>best.y?p:best),ends[0]);flag(pt,g.net);}
    else {const o=g.outlets[0];if(o.p.rotation===270){label(o.end,g.net,90,'RIGHT_MIDDLE');}else if(o.p.rotation===180){label(o.end,g.net,0,'RIGHT_BOTTOM');}else label(o.end,g.net);}
  }
  // Native SCH netlists use WIRE identity, not geometric adjacency between WIREs.
  // Coalesce only physically touching branches of the same intended net.
  function segments(w){return w.points.slice(1).map((b,i)=>[w.points[i],b]);}
  function touches([a,b],[c,d]){
    const within=(v,l,h)=>v>=Math.min(l,h)-1e-6&&v<=Math.max(l,h)+1e-6;
    if(a.x===b.x&&c.x===d.x)return a.x===c.x&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))+1e-6;
    if(a.y===b.y&&c.y===d.y)return a.y===c.y&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+1e-6;
    if(a.x===b.x)return within(a.x,c.x,d.x)&&within(c.y,a.y,b.y);
    return within(c.x,a.x,b.x)&&within(a.y,c.y,d.y);
  }
  const parents=wires.map((_,i)=>i);const root=i=>parents[i]===i?i:(parents[i]=root(parents[i]));
  for(let i=0;i<wires.length;i++)for(let j=0;j<i;j++)if(wires[i].net===wires[j].net&&segments(wires[i]).some(a=>segments(wires[j]).some(b=>touches(a,b))))parents[root(i)]=root(j);
  const replacement=new Map(wires.map((w,i)=>[w.id,wires[root(i)].id]));
  const keptWire=new Set(),keptNet=new Set(),merged=[];
  for(const l of additions){const r=E.parseRecord(l),b=r.body;
    if(r.type==='WIRE'){const id=replacement.get(r.id)||r.id;if(keptWire.has(id))continue;keptWire.add(id);r.head.id=id;}
    if(r.type==='LINE'&&replacement.has(b.lineGroup))b.lineGroup=replacement.get(b.lineGroup);
    if(r.type==='ATTR'&&replacement.has(b.parentId)){b.parentId=replacement.get(b.parentId);if(b.key==='NET'){if(keptNet.has(b.parentId))continue;keptNet.add(b.parentId);}else continue;}
    merged.push(E.formatRecord(r.head,b));
  }
  // Every disconnected local power branch has its own global power identity.
  // A branch may have no flag if the lowest endpoint belonged to another island.
  for(const i of new Set(wires.map((_,i)=>root(i)))){
    const w=wires[i];if(!supply.has(w.net)||keptNet.has(w.id))continue;
    const flags=additions.map(E.parseRecord).filter(r=>r.type==='COMPONENT').filter(r=>{
      const a=additions.map(E.parseRecord).find(v=>v.type==='ATTR'&&v.body.parentId===r.id&&v.body.key==='Global Net Name');return a?.body.value===w.net;
    });
    const branch=wires.filter((_,j)=>root(j)===i);
    const hasFlag=flags.some(f=>branch.some(b=>segments(b).some(seg=>touches(seg,[{x:f.body.x,y:f.body.y},{x:f.body.x,y:f.body.y}]))));
    if(hasFlag)continue;
    const pt=w.points.at(-1),b=E.wireBlock({segs:[{startX:pt.x,startY:pt.y,endX:pt.x+5,endY:pt.y}],net:w.net,zIndex:z++,ticketBase:t});t=b.nextTicket;
    const a=b.lines.map(E.parseRecord).find(r=>r.type==='ATTR'&&r.body.key==='NET');Object.assign(a.body,{parentId:w.id,x:snap(pt.x-5),y:snap(pt.y+5),align:'RIGHT_BOTTOM',fontSize:6.75});merged.push(E.formatRecord(a.head,a.body));
  }
  // Add library documents before the schematic page, retaining client-made NC markers.
  E.writeLines(file,lines.slice(0,last).concat(embeds,lines.slice(last),merged));
  fs.writeFileSync(path.join(base,'evidence',page.title+'-wire-paths.json'),JSON.stringify(wires,null,2));
  console.log(page.title+': '+page.parts.length+' symbols, '+wires.length+' wires');
}
fs.writeFileSync(path.join(base,'evidence/routing-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({routingIssues:report.length,unrouted:report.filter(v=>v.type==='unrouted').length}));
