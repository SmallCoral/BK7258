/* Rebuilds the schematic-only review copy from real client-saved libraries.
 * Requires official easyeda-eprj3-skill scripts/lib/eprj3.js (EPRJ3_SKILL).
 * Never reads or writes a PCB document. Final installation is a separate step.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const skill = process.env.EPRJ3_SKILL || 'C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill';
const E = require(path.join(skill, 'scripts/lib/eprj3'));
const base = __dirname;
const stage = process.env.DESKSPRITE_STAGE || 'C:/Users/sc/AppData/Local/Temp/desksprite-build';
const probe = 'C:/Users/sc/AppData/Local/Temp/desksprite-library/sch/Schematic1/P1.esch2';
const original = path.join(base, '../桌灵 · DeskSprite');
const id = s => crypto.createHash('sha256').update('DeskSprite:v1:' + s).digest('hex').slice(0,16);
const client = 'e3a83983d959c621';
const ms = Date.now();
const schUuid = '9e882607dcaae1aa';
function docsFrom(file) {
  const docs = new Map(); let doc;
  for (const line of E.readLines(file)) {
    const r = E.parseRecord(line);
    if (!r) throw new Error('Unparseable record');
    if (r.type === 'DOCHEAD') {
      doc = { head:r.body, lines:[line], records:new Map() }; docs.set(r.body.uuid,doc);
    } else {
      doc.lines.push(line);
      const key = JSON.stringify(r.id), old = doc.records.get(key);
      if (!old || (old.ticket||0) <= (r.ticket||0)) doc.records.set(key,r);
    }
  }
  for (const d of docs.values()) d.live=[...d.records.values()].filter(r=>Object.keys(r.body).length);
  return docs;
}
const library = fs.existsSync(path.join(base,'library-cache.json'))
  ? new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(base,'library-cache.json'),'utf8'))).map(([uuid,d])=>{
      const liveMap=new Map();for(const line of d.lines.slice(1)){const r=E.parseRecord(line),old=liveMap.get(r.id);if(!old||(old.ticket||0)<=(r.ticket||0))liveMap.set(r.id,r);}
      return [uuid,{...d,live:[...liveMap.values()].filter(r=>Object.keys(r.body).length)}];
    })) : docsFrom(probe);
const devices = new Map([...library.values()].filter(d=>d.head.docType==='DEVICE').map(d=>[d.live.find(r=>r.type==='META').body.title,d]));
const names = {U:'LC-OPEN-BK7258-MOD',BUCK:'AP63203WU-7',UART:'CH340K',AMP:'MS8002D',MIC:'ZTS6216',SWITCH:'MT9700-N',FPC:'AFC34-S10FIA-00',USB:'TYPEC-304-ACP16',PMOS:'AO3401A',ESD:'USBLC6-2SC6',BUTTON:'TS-1088-AR02016',SPK:'B2B-PH-K-S(LF)(SN)',C100N:'CC0603KRX7R9BB104',C1U:'CL10A105KB8NNNC',C4U7:'CL10A475KO8NNNC',C10U:'CL10A106KP8NNNC',C22U:'CL21A226MAQNNNE',L:'MWSA0503S-4R7MT',FUSE:'BSMD1206-150-6V'};
const codes={'0':'0000','10':'100J','100':'1000','1K':'1001','1.2K':'1201','5.1K':'5101','6.8K':'6801','10K':'1002','20K':'2002','27K':'2702','100K':'1003','1M':'1004'};
names.C0G='C3216C0G1H104JT000N';
for(const [v,c] of Object.entries(codes)) names['R'+v]='0603WAF'+c+'T5E';
function selectDevice(key) {
  const title=names[key]||key;
  // Manufacturer-specific selection is intentional; similarly named clones differ.
  const want = key==='PMOS'?'C15127':key==='ESD'?'C7519':null;
  if(want) {
    const hit=[...library.values()].find(d=>d.head.docType==='DEVICE'&&d.live.find(r=>r.type==='META')?.body.attributes?.['Supplier Part']===want);
    if(hit)return hit;
    throw new Error('Missing exact manufacturer device '+key+' '+want);
  }
  const d=devices.get(title); if(!d)throw new Error('Missing library '+key+': '+title);return d;
}
const pages = [];
function page(n,title) {
  const p={n,title,uuid:n===1?'10506c4927cf0474':id('page'+n),parts:[],texts:[],routes:[]};pages.push(p);return p;
}
function part(p,key,kind,x,y,nets,opts={}) {
  const d=selectDevice(kind),meta=d.live.find(r=>r.type==='META').body;
  const sym=library.get(meta.attributes.Symbol), units=sym.live.filter(r=>r.type==='PART');
  const unit=opts.unit||0;
  const out={key,ref:opts.ref||key,id:id(key),device:d.head.uuid,symbol:sym.head.uuid,footprint:meta.attributes.Footprint,
    partId:units[unit].id, x,y,rotation:opts.rotation||0,nets,kind,title:meta.title,value:opts.value||meta.attributes.Value||meta.title,
    unique:id(opts.ref||key),supplier:meta.attributes['Supplier Part'],model:meta.attributes['3D Model'],modelTitle:meta.attributes['3D Model Title'],...opts};
  p.parts.push(out);return out;
}
function rc(p,ref,kind,x,y,a,b,vertical=false,value) {return part(p,ref,kind,x,y,{'1':a,'2':b},{rotation:vertical?270:0,value});}
function note(p,x,y,value){p.texts.push({x,y,value});}
const p1=page(1,'01_系统接口总览'),p2=page(2,'02_USB与电源'),p3=page(3,'03_主控与按键'),p4=page(4,'04_显示接口'),p5=page(5,'05_采音与播放');

// Power, USB sink and UART programming.
part(p2,'J1','USB',250,820,{A1B12:'GND',B1A12:'GND',EP:'GND',A4B9:'USB_VBUS',B4A9:'USB_VBUS',A5:'CC1',B5:'CC2',A6:'USB_DP',B6:'USB_DP',A7:'USB_DM',B7:'USB_DM'});
rc(p2,'R1','R5.1K',120,770,'CC1','GND',true);rc(p2,'R2','R5.1K',400,770,'CC2','GND',true);
part(p2,'D1','ESD',620,790,{'1':'USB_DP','6':'USB_DP','3':'USB_DM','4':'USB_DM','2':'GND','5':'USB_VBUS'});
rc(p2,'C28','C100N',780,700,'USB_VBUS','GND',true);
part(p2,'U2','UART',1030,790,{'1':'USB_DP','2':'USB_DM','3':'GND','7':'3V3','8':'UART_CH_TX','9':'UART_CH_RX','10':'3V3','11':'GND'});
rc(p2,'R3','R100',1190,790,'UART_CH_TX','UART_RX');rc(p2,'R4','R100',1190,840,'UART_CH_RX','UART_TX');
rc(p2,'C1','C100N',940,660,'3V3','GND',true);rc(p2,'C2','C1U',1050,660,'3V3','GND',true);
part(p2,'F1','FUSE',250,410,{'1':'USB_VBUS','2':'5V_SYS'},{value:'1.5A hold / 6V'});
part(p2,'U3','BUCK',560,410,{'1':'3V3','2':'5V_SYS','3':'5V_SYS','4':'GND','5':'BUCK_SW','6':'BUCK_BST'});
part(p2,'L1','L',780,410,{'1':'BUCK_SW','2':'3V3'},{value:'4.7uH / >=3A'});
rc(p2,'C3','C10U',360,330,'5V_SYS','GND',true);rc(p2,'C4','C100N',455,330,'5V_SYS','GND',true);
rc(p2,'C5','C100N',675,480,'BUCK_BST','BUCK_SW',true);
rc(p2,'C6','C22U',920,330,'3V3','GND',true);rc(p2,'C7','C22U',1040,330,'3V3','GND',true);
note(p2,80,1010,'USB-C 供电与下载：电源口和串口共用同一连接器');
note(p2,80,970,'CC1、CC2 各接 5.1kΩ；本版不含 PD 协商或 CC 电流档位检测。');
note(p2,800,580,'下载：启动烧录工具后按复位键；DTR、CTS、RTS 未使用。');
note(p2,80,550,'3.3V 降压：AP63203 固定输出，反馈脚直接取样输出');
note(p2,80,200,'整机需验证峰值电流；使用已确认供电能力的 5V 电源或 USB 口。');
note(p2,80,165,'2A 是降压芯片能力；不代表电脑 USB 口允许持续提供该电流。');
note(p2,800,200,'C6、C7 为 0805 / 25V，保留直流偏压后的有效容量。');
note(p2,800,165,'CH340K 库编号 11 是裸焊盘（手册编号 0），必须接地。');

// Main module: exact two-part official library, one physical U1.
const uN={'1':'GND','2':'3V3','3':'RESET_N','7':'AMP_SD','9':'LCD_BL_N','10':'KEY_TALK_N','14':'AMP_PWR_EN','15':'AUDLN','16':'AUDLP','17':'MICP1','18':'MICN1','19':'MICP2','20':'MICN2','21':'MICBIAS','24':'LCD_DC','25':'LCD_MOSI','26':'LCD_CS_N','27':'LCD_SCK','36':'UART_RX','37':'UART_TX','40':'GND'};
const uB={'44':'GND','59':'GND','64':'GND','65':'VIO','68':'GND','69':'LCD_RST_N','70':'LCD_PWR_EN','75':'GND'};
part(p3,'U1A','U',480,720,uN,{ref:'U1',unit:0});part(p3,'U1B','U',1080,720,uB,{ref:'U1',unit:1});
rc(p3,'C8','C10U',180,790,'3V3','GND',true);rc(p3,'C9','C100N',280,790,'3V3','GND',true);
rc(p3,'C10','C4U7',1270,500,'VIO','GND',true);
part(p3,'SW1','BUTTON',260,460,{'1':'RESET_N','2':'GND'},{value:'RESET'});
rc(p3,'C11','C100N',140,400,'RESET_N','GND',true);
part(p3,'SW2','BUTTON',650,390,{'1':'KEY_TALK_N','2':'GND'},{value:'TALK'});
rc(p3,'R5','R10K',520,480,'3V3','KEY_TALK_N',true);rc(p3,'C12','C100N',520,320,'KEY_TALK_N','GND',true);
note(p3,80,1010,'BK7258 模组与人机按键：两个符号单元对应同一颗 U1');
note(p3,80,970,'未使用 GPIO 明确标为不连接；供电与电平均按 3.3V 系统。');
note(p3,80,250,'复位低有效；模组内部已有上拉。对话键使用 P28，按下为低。');
note(p3,80,210,'P10 接 USB 串口 TX，P11 接 USB 串口 RX；GPIO 分配须同步固件。');
note(p3,800,380,'VIO 是模组内部电源输出，仅加去耦，勿外接 3.3V。');
note(p3,800,340,'Wi-Fi 天线功能已包含在模组中；本页未增加射频电路。');

// Official LCD reference interface, without selecting a glass assembly.
part(p4,'U4','SWITCH',400,770,{'1':'LCD_3V3','2':'GND','3':'LCD_ISET','4':'LCD_PWR_EN','5':'3V3'},{rotation:180});
rc(p4,'C13','C10U',170,690,'3V3','GND',true);rc(p4,'C14','C10U',650,690,'LCD_3V3','GND',true);
rc(p4,'R6','R100K',250,610,'LCD_PWR_EN','GND',true);rc(p4,'R7','R6.8K',550,610,'LCD_ISET','GND',true);
part(p4,'J2','FPC',1180,730,{'1':'LCD_DC','2':'LCD_MOSI','3':'LCD_CS_N','4':'LCD_RST_N','5':'LCD_SCK','6':'GND','7':'LCD_3V3','8':'GND','9':'LCD_BLA','10':'GND','11':'GND','12':'GND'});
rc(p4,'R8','R10K',900,830,'LCD_3V3','LCD_RST_N',true);rc(p4,'C15','C100N',910,640,'LCD_3V3','GND',true);
part(p4,'Q1','PMOS',480,390,{'1':'BL_GATE','2':'LCD_3V3','3':'BL_SW'},{rotation:180});
rc(p4,'R9','R10',700,390,'BL_SW','LCD_BLA');rc(p4,'R10','R1K',690,470,'BL_GATE','LCD_BL_N');rc(p4,'R11','R10K',570,560,'LCD_3V3','BL_GATE',true);
note(p4,80,1010,'显示：官方 ST7789V2 / 240×320 SPI 接口，屏幕总成尚未选型');
note(p4,80,970,'J2 为 10 针 / 0.5mm FPC；11、12 为固定焊脚，接地。');
note(p4,80,900,'屏电源：P13 高有效，6.8kΩ 设定约 1A 限流');
note(p4,80,260,'背光：P25 低有效。10Ω 采用参考值，须按最终屏背光电流复核。');
note(p4,80,220,'购买前逐针核对排线方向与脚序；不得仅凭 ST7789 型号直接插接。');
note(p4,850,510,'J2.1 是 DC（P5），不是 MISO；SPI 只写显示数据。');
note(p4,850,470,'关屏前将相关 GPIO 置低或高阻，避免经信号脚反向供电。');

// Microphone, switched audio amplifier and acoustic echo reference.
part(p5,'MIC1','MIC',380,820,{'1':'MIC_OUT','2':'AGND','3':'AGND','4':'MIC_VDD'});
rc(p5,'R12','R1.2K',530,900,'MICBIAS','MIC_VDD');rc(p5,'C16','C0G',610,780,'MIC_VDD','AGND',true);
rc(p5,'C17','C1U',220,825,'MICP1','MIC_OUT');rc(p5,'C18','C1U',220,690,'MICN1','AGND');
rc(p5,'R13','R0',530,630,'AGND','GND');
part(p5,'U5','SWITCH',1030,830,{'1':'AMP_3V3','2':'GND','3':'AMP_ISET','4':'AMP_PWR_EN','5':'3V3'},{rotation:180});
rc(p5,'C19','C10U',820,750,'3V3','GND',true);rc(p5,'C20','C10U',1270,750,'AMP_3V3','GND',true);
rc(p5,'R14','R100K',890,650,'AMP_PWR_EN','GND',true);rc(p5,'R15','R6.8K',1160,650,'AMP_ISET','GND',true);
part(p5,'U6','AMP',750,390,{'1':'PA_SD','2':'PA_BYPASS','3':'PA_INP','4':'PA_INN','5':'SPK_P','6':'AMP_3V3','7':'AGND','8':'SPK_N'});
rc(p5,'R16','R10K',550,540,'AMP_SD','PA_SD');rc(p5,'R17','R1M',650,620,'AMP_3V3','PA_SD',true);
rc(p5,'C21','C1U',580,430,'PA_BYPASS','AGND',true);
rc(p5,'C22','C1U',200,340,'AUDLP','PA_CINP');rc(p5,'R18','R20K',350,340,'PA_CINP','PA_INP');
rc(p5,'C23','C1U',200,240,'AUDLN','PA_CINN');rc(p5,'R19','R20K',350,240,'PA_CINN','PA_INN');
rc(p5,'R20','R20K',470,350,'PA_INP','PA_BYPASS',true);
rc(p5,'R21','R20K',740,200,'PA_INN','SPK_P');
rc(p5,'C24','C10U',940,470,'AMP_3V3','AGND',true);rc(p5,'C25','C100N',1050,470,'AMP_3V3','AGND',true);
part(p5,'J3','SPK',1250,390,{'1':'SPK_P','2':'SPK_N'},{rotation:180,value:'SPK / 8Ω ≥1W'});
rc(p5,'R22','R27K',1000,290,'SPK_P','AEC_P');rc(p5,'C26','C1U',1160,290,'AEC_P','MICP2');
rc(p5,'R23','R27K',1000,200,'SPK_N','AEC_N');rc(p5,'C27','C1U',1160,200,'AEC_N','MICN2');
note(p5,80,1090,'音频：模拟采音、3.3V 差分功放与 ADC2 回采');
note(p5,80,1030,'麦克风近端去耦 C16 为 C0G / 1206；1µF 隔直电容远离麦克风。');
note(p5,80,585,'AGND 经 R13 单点连接 GND；SD 高电平关断，默认保持静音。');
note(p5,80,100,'扬声器为桥接输出，两端均不可接地；先低音量验证增益与回采幅度。');
note(p5,800,100,'IN+ 的偏置电阻 R20 接 BYPASS，依据 MS8002D 原厂差分应用图。');

// Electrically connected page overview. Virtual devices are excluded from BOM.
function block(p,key,title,x,y,ports,leftCount) {
  const su=id(key+'symbol'),du=id(key+'device'),h=Math.max(150,Math.max(leftCount,ports.length-leftCount)*25+50),w=270;
  const pins=ports.map((net,i)=>{const left=i<leftCount;const j=left?i:i-leftCount;return {num:String(i+1),name:net,x:left?-w/2-20:w/2+20,y:h/2-25-j*25,rotation:left?0:180,length:20,nameX:left?-w/2+6:w/2-6,nameY:h/2-25-j*25+3,numX:left?-w/2-6:w/2+6,numY:h/2-25-j*25+3,type:'Passive'};});
  const sd=E.buildSymbolDoc({uuid:su,client,ms,title,source:'',bbox:[-w/2,-h/2,w/2,h/2],designator:'B?',pins,graphics:[{type:'RECT',body:{dotX1:-w/2,dotY1:-h/2,dotX2:w/2,dotY2:h/2,radiusX:0,radiusY:0,rotation:0,strokeColor:null,strokeStyle:'SOLID',strokeWidth:1,fillColor:null,fillStyle:'NONE'}}]});
  const dd=E.buildDeviceDoc({uuid:du,client,ms,title,symbolUuid:su,designator:'B?',source:'',attributes:{'Add into BOM':'no','Convert to PCB':'no'}});
  for(const lines of [sd,dd]){const head=E.parseRecord(lines[0]).body;const live=lines.slice(1).map(E.parseRecord);library.set(head.uuid,{head,lines,live});}
  p.parts.push({key,ref:key,id:id(key),device:du,symbol:su,partId:E.PART_ID,x,y,rotation:0,nets:Object.fromEntries(ports.map((v,i)=>[String(i+1),v])),title,value:title,unique:id(key),virtual:true});
  note(p,x-w/2,y+h/2+40,title);
}
block(p1,'B1','电源与下载（第 2 页）',270,800,['3V3','GND','UART_RX','UART_TX'],0);
block(p1,'B2','主控与按键（第 3 页）',730,760,['3V3','GND','UART_RX','UART_TX','LCD_PWR_EN','LCD_BL_N','LCD_SCK','LCD_MOSI','LCD_CS_N','LCD_DC','LCD_RST_N','MICBIAS','MICP1','MICN1','AUDLP','AUDLN','AMP_PWR_EN','AMP_SD','MICP2','MICN2'],4);
block(p1,'B3','显示接口（第 4 页）',1240,840,['LCD_PWR_EN','LCD_BL_N','LCD_SCK','LCD_MOSI','LCD_CS_N','LCD_DC','LCD_RST_N','3V3','GND'],9);
block(p1,'B4','采音与播放（第 5 页）',1240,410,['MICBIAS','MICP1','MICN1','AUDLP','AUDLN','AMP_PWR_EN','AMP_SD','MICP2','MICN2','3V3','GND'],11);
note(p1,80,1100,'桌灵 DeskSprite · 第一版原理图');
note(p1,80,1060,'USB 供电与烧录，Wi-Fi 连接电脑；按键对话、显示、采音与播放。');
note(p1,80,240,'本页方框具有真实电气引脚，网络名与对应功能页直接关联。');
note(p1,80,200,'当前使用全局网络分页；方框为虚拟对象，不进入物料清单。');
note(p1,80,160,'屏幕总成待选型；元件阻容默认 0603 英制，特殊尺寸另行说明。');

function makePages() {
  fs.mkdirSync(path.join(stage,'sch/Schematic1'),{recursive:true});
  const index=JSON.parse(fs.readFileSync(path.join(original,'桌灵 · DeskSprite.eprj3'),'utf8'));
  index.name='DeskSprite_Schematic_Review';index.profile.pcbs={};index.profile.panels={};index.pcb_count=0;
  index.profile.sheets={};index.default_sheet=p1.uuid;index.config.defaultSheet=p1.uuid;index.thumb='';
  for(const p of pages){index.profile.sheets[p.uuid]={uuid:p.uuid,title:p.title,schematic_uuid:schUuid,zIndex:p.n,source:'',version:String(ms),updateTime:ms};}
  fs.writeFileSync(path.join(stage,'DeskSprite_Schematic_Review.eprj3'),JSON.stringify(index,null,2));
  fs.copyFileSync(path.join(original,'sch/Schematic1/Schematic1.ecfg'),path.join(stage,'sch/Schematic1/Schematic1.ecfg'));
  const frame=devices.get('Drawing-Symbol_A4');const fm=frame.live.find(r=>r.type==='META').body;
  for(const p of pages){
    const used=new Set([frame.head.uuid,fm.attributes.Symbol]);
    for(const c of p.parts){used.add(c.device);used.add(c.symbol);if(c.footprint)used.add(c.footprint);}
    let lines=[...used].flatMap(u=>library.get(u).lines);
    let main=E.buildSheetPageDoc({sheetUuid:p.uuid,sheetTitle:p.title,schematicUuid:schUuid,schematicName:'Schematic1',boardTitle:'Board1',projectName:'桌灵 DeskSprite',dateStr:'2026-11-14',timeStr:'',frameSymbolUuid:fm.attributes.Symbol,frameDeviceUuid:frame.head.uuid,client,ms,size:'A3',frameWidth:1654,frameHeight:1170,titleBlock:0});
    let t=100,z=1;
    for(const c of p.parts){
      const lib=library.get(c.symbol),part=lib.live.find(r=>r.type==='PART'&&r.id===c.partId);
      const bb=part.body.BBOX;const count=lib.live.filter(r=>r.type==='PIN'&&r.body.partId===c.partId).length;
      const b=E.schComponentBlock({compId:c.id,partId:c.partId,x:c.x,y:c.y,rotation:c.rotation,zIndex:z++,symbolUuid:c.symbol,deviceUuid:c.device,deviceName:c.title,footprintUuid:c.footprint,refdes:c.ref,uniqueId:c.unique,pinCount:count,twoPinVertical:count===2&&[90,270].includes(c.rotation),bodyExtent:{minX:Math.min(bb[0],bb[2])+c.x,maxX:Math.max(bb[0],bb[2])+c.x,minY:Math.min(bb[1],bb[3])+c.y,maxY:Math.max(bb[1],bb[3])+c.y},ticketBase:t});
      t=b.nextTicket;
      for(let i=0;i<b.lines.length;i++){const r=E.parseRecord(b.lines[i]);if(r.type==='ATTR'&&r.body.key==='Name'){r.body.value=c.value;if(c.virtual)r.body.valueVisible=false;b.lines[i]=E.formatRecord(r.head,r.body);}}
      main.push(...b.lines);
    }
    for(const v of p.texts)main.push(E.schTextLine({...v,fontSize:10,align:'LEFT_BOTTOM',zIndex:z++,ticketBase:++t}));
    main.push(E.schTextLine({x:80,y:50,value:`桌灵 DeskSprite  ·  V0.1  ·  ${p.n}/5  ·  ${p.title.slice(3)}  ·  2026-11-14`,fontSize:10,align:'LEFT_BOTTOM',zIndex:z++,ticketBase:++t}));
    E.writeLines(path.join(stage,'sch/Schematic1',p.title+'.esch2'),lines.concat(main));
  }
  fs.mkdirSync(path.join(base,'evidence'),{recursive:true});
  fs.writeFileSync(path.join(base,'evidence/placement-manifest.json'),JSON.stringify({stage,pages},null,2));
  console.log(JSON.stringify({stage,pages:pages.length,physicalParts:pages.flatMap(p=>p.parts).filter(c=>!c.virtual&&c.key!=='U1B').length}));
}
makePages();
