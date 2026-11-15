/* RAPID VOICE MODULE — GPS + mapa OSM + głos PL + Drive Eco */
(()=>{ 'use strict';
const V0={on:true,limits:true,cross:true,eco:true,tol:5,ecoAvg:9,ecoInst:15};
const cfg=()=>settings.v||(settings.v=Object.assign({},V0));
const R=6371000, rad=x=>x*Math.PI/180;
const dx=(a,b)=>rad(b.lon-a.lon)*Math.cos(rad((a.lat+b.lat)/2));
const dist=(a,b)=>Math.hypot(dx(a,b),rad(b.lat-a.lat))*R;
const brg=(a,b)=>(Math.atan2(dx(a,b),rad(b.lat-a.lat))*180/Math.PI+360)%360;
const adiff=(a,b)=>Math.abs(((a-b+540)%360)-180);
const CAP=()=>window.Capacitor&&window.Capacitor.Plugins||{};

function parseMax(s){
  if(!s) return null; s=String(s).toLowerCase().trim();
  const m={'pl:urban':50,'pl:rural':90,'pl:trunk':100,'pl:expressway':120,'pl:motorway':140};
  if(m[s]) return m[s];
  const x=s.match(/^(\d{2,3})(\s*km\/h)?$/); return x?+x[1]:null;
}

/* ---- GŁOS (PL) ---- */
const Voice={
  last:{},
  say(key,text,cool=60000,prio=0){
    if(!cfg().on) return;
    const n=Date.now(); if(n-(this.last[key]||0)<cool) return;
    this.last[key]=n; this.speak(text,prio);
  },
  speak(t,prio){
    const P=CAP().TextToSpeech;
    if(P&&P.speak){ P.speak({text:t,lang:'pl-PL',rate:1,volume:1,queueStrategy:prio?0:1}).catch(()=>this.web(t,prio)); return; }
    this.web(t,prio);
  },
  web(t,prio){
    if(!('speechSynthesis' in window)) return;
    if(prio) speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(t); u.lang='pl-PL';
    const v=speechSynthesis.getVoices().find(x=>/^pl/i.test(x.lang)); if(v) u.voice=v;
    speechSynthesis.speak(u);
  }
};

/* ---- GPS ---- */
const Geo={
  pos:null, anchor:null, on:false,
  async start(){
    try{
      const G=CAP().Geolocation;
      if(G&&G.watchPosition){
        try{ await G.requestPermissions(); }catch(e){}
        await G.watchPosition({enableHighAccuracy:true},(p,err)=>{ if(p&&p.coords) this.upd(p.coords); });
      }else if(navigator.geolocation){
        navigator.geolocation.watchPosition(p=>this.upd(p.coords),()=>{},{enableHighAccuracy:true,maximumAge:1000});
      }
    }catch(e){}
  },
  upd(c){
    const p={lat:c.latitude,lon:c.longitude,spd:c.speed>=0?c.speed*3.6:null,t:Date.now(),hdg:null};
    let h=(Number.isFinite(c.heading)&&c.speed>2)?c.heading:null;
    if(h==null&&this.anchor&&dist(this.anchor,p)>8){ h=brg(this.anchor,p); this.anchor=p; }
    if(!this.anchor) this.anchor=p;
    p.hdg=h!=null?h:(this.pos?this.pos.hdg:null);
    this.pos=p; this.on=true;
  }
};

/* ---- MAPA OSM (Overpass) ---- */
const OSM={
  pts:[], cross:[], at:null, tAt:0, busy:false,
  parse(j){
    const pts=[],cr=[];
    for(const e of (j&&j.elements)||[]){
      if(e.type==='node'){ cr.push({id:e.id,lat:e.lat,lon:e.lon}); continue; }
      const lim=parseMax(e.tags&&e.tags.maxspeed), g=e.geometry;
      if(lim==null||!g||g.length<2) continue;
      for(let i=0;i<g.length-1;i++){
        const a=g[i],b=g[i+1],n=Math.max(1,Math.ceil(dist(a,b)/20));
        for(let k=0;k<n;k++){ const t=k/n; pts.push({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t,lim,w:e.id}); }
      }
      const l=g[g.length-1]; pts.push({lat:l.lat,lon:l.lon,lim,w:e.id});
    }
    this.pts=pts; this.cross=cr;
  },
  async refresh(){
    const p=Geo.pos; if(!p||this.busy) return;
    const now=Date.now();
    if(this.at&&dist(this.at,p)<200&&now-this.tAt<180000) return;
    if(now<this.tAt&&!this.at) return;
    this.busy=true;
    try{
      const q='[out:json][timeout:12];('+
        'way(around:600,'+p.lat+','+p.lon+')["highway"]["maxspeed"];'+
        'node(around:600,'+p.lat+','+p.lon+')["railway"="level_crossing"];);out geom;';
      const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)});
      if(!r.ok) throw new Error(r.status);
      this.parse(await r.json()); this.at={lat:p.lat,lon:p.lon}; this.tAt=now;
    }catch(e){ this.tAt=now+30000-180000; this.at=this.at||null; }
    this.busy=false;
  }
};

/* ---- NAWIGACJA: limity + przejazdy ---- */
const Nav={
  over:0, curLim:null, aheadLim:null, nearCross:null,
  tick(){
    const c=cfg(), p=Geo.pos;
    this.curLim=null; this.aheadLim=null; this.nearCross=null;
    if(!p||p.hdg==null||Date.now()-p.t>8000){ this.badge(); return; }
    OSM.refresh();
    const spd=(S.connected||S.demo)?S.raw.speed:(p.spd||0);
    let cur=null,best=25; const byW={};
    for(const q of OSM.pts){
      const d=dist(p,q);
      if(d<best){ best=d; cur=q; }
      if(d<40||d>350) continue;
      const df=adiff(brg(p,q),p.hdg);
      if(df>25||d*Math.sin(rad(df))>25) continue;
      (byW[q.w]=byW[q.w]||[]).push({d,lim:q.lim});
    }
    this.curLim=cur?cur.lim:null;
    let ahead=null;
    for(const w in byW){
      const a=byW[w]; if(a.length<4||(cur&&String(cur.w)===w)) continue;
      a.sort((x,y)=>x.d-y.d);
      if(!ahead||a[0].lim<ahead.lim) ahead={lim:a[0].lim,d:a[0].d};
    }
    this.aheadLim=ahead;
    if(spd>=5&&c.limits){
      if(ahead&&ahead.lim<spd-c.tol&&(this.curLim==null||ahead.lim<this.curLim))
        Voice.say('ah'+ahead.lim,'Zmniejsz prędkość. Za '+Math.max(50,Math.round(ahead.d/50)*50)+' metrów ograniczenie do '+ahead.lim,60000);
      if(this.curLim!=null&&spd>this.curLim+c.tol){
        if(++this.over>=6) Voice.say('over'+this.curLim,'Przekroczono dozwoloną prędkość. Limit '+this.curLim,45000);
      }else this.over=0;
    }
    for(const x of OSM.cross){
      const d=dist(p,x); if(d>400||d<15) continue;
      const df=adiff(brg(p,x),p.hdg); if(df>25||d*Math.sin(rad(df))>30) continue;
      if(!this.nearCross||d<this.nearCross) this.nearCross=d;
      if(c.cross) Voice.say('lc'+x.id,'Uwaga, przejazd kolejowy za '+Math.max(50,Math.round(d/50)*50)+' metrów',120000,1);
    }
    this.badge();
  },
  badge(){
    const b=document.getElementById('limBadge'); if(!b) return;
    if(this.curLim==null){ b.style.display='none'; return; }
    b.style.display='flex'; b.textContent=this.curLim;
  }
};

/* ---- BŁĘDY UKŁADU + DRIVE ECO ---- */
const PH={
  cool:{2:'Uwaga! Przegrzanie silnika. Zatrzymaj się i wyłącz silnik',1:'Temperatura płynu chłodzącego jest wysoka'},
  trim:{1:'Błąd układu paliwowego. Korekty mieszanki poza normą, możliwa nieszczelność dolotu'},
  boost:{1:'Zbyt wysokie ciśnienie doładowania'},
  volt:{2:'Uwaga! Zbyt wysokie napięcie ładowania. Możliwa awaria regulatora alternatora',1:'Słabe ładowanie akumulatora. Sprawdź alternator'},
  oil:{1:'Zimny olej. Nie obciążaj silnika'}
};
const Eco={
  lastSpd:0, hi:0, milPrev:false,
  tick(){
    const c=cfg(); if(!c.eco||!(S.connected||S.demo)) return;
    const r=S.raw,d=S.der;
    for(const a of S.alarms){
      const t=PH[a.id]&&PH[a.id][a.sev];
      if(t) Voice.say('al'+a.id+a.sev,t,a.sev===2?30000:120000,a.sev===2?1:0);
    }
    if(S.trip.d>5){
      const avg=S.trip.f/S.trip.d*100;
      if(avg>c.ecoAvg) Voice.say('avg','Wysokie średnie spalanie. '+avg.toFixed(1).replace('.',',')+' litra na sto kilometrów',300000);
    }
    if(r.speed>30&&d.fuelUnit==='l/100km'&&d.fuelInst>c.ecoInst) this.hi++; else this.hi=0;
    if(this.hi>=10) Voice.say('inst','Spokojniej. Spalanie chwilowe jest bardzo wysokie',120000);
    if(r.speed-this.lastSpd>9&&r.throttle>70) Voice.say('acc','Delikatniej z gazem',90000);
    this.lastSpd=r.speed;
    if(d.gear!=='N'&&parseInt(d.gear,10)<5&&r.rpm>settings.redline-300) Voice.say('shift','Zmień bieg na wyższy',25000);
    if(S.mil&&!this.milPrev&&S.connected) Voice.say('mil','Zapaliła się kontrolka silnika. Sprawdź diagnostykę',300000,1);
    this.milPrev=!!S.mil;
  }
};

/* ---- UI ---- */
function ui(){
  const c=cfg(), host=document.querySelector('#view-logi'); if(!host) return;
  const sw=(k,l,s)=>'<div class="switch-row"><div class="lbl">'+l+(s?'<small>'+s+'</small>':'')+'</div><label class="switch"><input type="checkbox" data-vk="'+k+'" '+(c[k]?'checked':'')+'><span class="knob"></span></label></div>';
  const rg=(k,l,min,max,st,u)=>'<div class="set-row"><div class="set-top"><label>'+l+'</label><span class="num" id="vv-'+k+'">'+c[k]+u+'</span></div><input type="range" data-vr="'+k+'" data-u="'+u+'" min="'+min+'" max="'+max+'" step="'+st+'" value="'+c[k]+'"></div>';
  const t=document.createElement('div'); t.className='tile panel';
  t.innerHTML='<h2>ASYSTENT GŁOSOWY + MAPA</h2>'+
    sw('on','Głos po polsku','Wszystkie komunikaty głosowe')+
    sw('limits','Ograniczenia prędkości (OSM)','Ostrzeżenie o limicie przed Tobą')+
    sw('cross','Przejazdy kolejowe','Komunikat ok. 300 m przed')+
    sw('eco','Błędy układu i Drive Eco','Alarmy, spalanie, styl jazdy')+
    rg('tol','Tolerancja prędkości',0,15,1,' km/h')+
    rg('ecoAvg','Próg średniego spalania',6,14,0.5,' l/100')+
    rg('ecoInst','Próg spalania chwilowego',10,25,1,' l/100')+
    '<div class="kv"><small>GPS / MAPA</small><b id="vcStat">—</b></div>'+
    '<div class="btn-row" style="margin-top:10px"><button class="btn blue" id="vcTest" type="button">TEST GŁOSU</button></div>';
  host.insertBefore(t,host.lastElementChild);
  t.querySelectorAll('[data-vk]').forEach(i=>i.onchange=()=>{ cfg()[i.dataset.vk]=i.checked; saveSettings(); });
  t.querySelectorAll('[data-vr]').forEach(i=>i.oninput=()=>{
    cfg()[i.dataset.vr]=parseFloat(i.value); document.getElementById('vv-'+i.dataset.vr).textContent=i.value+i.dataset.u; saveSettings(); });
  document.getElementById('vcTest').onclick=()=>Voice.speak('Asystent głosowy działa poprawnie. Uwaga, przejazd kolejowy za dwieście metrów.',1);
  const st=document.querySelector('.t-speed');
  if(st){
    const css=document.createElement('style');
    css.textContent='#limBadge{position:absolute;top:8px;right:10px;width:46px;height:46px;border-radius:50%;background:#fff;color:#111;border:5px solid #e53935;display:none;align-items:center;justify-content:center;font:800 17px var(--mono);z-index:3}';
    document.head.appendChild(css);
    const b=document.createElement('div'); b.id='limBadge'; st.appendChild(b);
  }
}
function status(){
  const e=document.getElementById('vcStat'); if(!e) return;
  const g=Geo.on?'GPS OK':'brak GPS';
  e.textContent=g+(OSM.pts.length?(' · limit '+(Nav.curLim||'—')+' · przejazdy '+OSM.cross.length):' · brak danych mapy');
}


/* ---- BRAMA GSM (WARIANT B: GEOFENCING + TEL: LINK + BANER) ---- */
const G0={on:true,autoOpen:true,phone:'',lat:null,lon:null,trigDist:85,armDist:250};
const gcfg=()=>settings.gate||(settings.gate=Object.assign({},G0));

const Gate={
  armed:false,
  lastTrigger:0,
  curDist:null,

  dial(manual=false){
    const g=gcfg();
    const cleanPhone=String(g.phone||'').replace(/\s+/g,'').trim();
    if(!cleanPhone){
      toast('Wpisz najpierw numer telefonu bramy GSM w zakładce Logi & Ustawienia!',{type:'warn',timeout:5000});
      if(typeof switchView==='function') switchView('logi');
      return;
    }
    Voice.speak('Otwieram bramę wjazdową.',1);
    toast('📞 Wybieranie numeru bramy: '+cleanPhone,{type:'info',timeout:5000});
    this.hideBanner();
    try{
      const a=document.createElement('a');
      a.href='tel:'+encodeURIComponent(cleanPhone);
      a.style.display='none';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>a.remove(),1000);
    }catch(e){
      window.location.href='tel:'+cleanPhone;
    }
  },

  showBanner(d){
    let b=document.getElementById('gateBanner');
    if(!b){
      b=document.createElement('div');
      b.id='gateBanner';
      b.style.cssText='position:fixed;bottom:calc(var(--nav) + env(safe-area-inset-bottom) + 12px);left:12px;right:12px;z-index:75;background:rgba(6,28,16,.96);border:2px solid var(--neon);border-radius:16px;padding:14px 16px;box-shadow:0 0 28px rgba(0,255,102,.45);display:flex;align-items:center;justify-content:space-between;gap:12px;backdrop-filter:blur(10px)';
      b.innerHTML='<div style="display:flex;flex-direction:column;gap:2px"><b style="color:var(--neon);font-size:14px;letter-spacing:.06em">🏠 PODJAZD POD DOM (<span id="gateBanDist">80</span> m)</b><small style="color:var(--txt);font-size:11px">Kliknij, aby zadzwonić na moduł GSM i otworzyć szlaban</small></div>'+
        '<div style="display:flex;gap:8px;align-items:center">'+
        '<button type="button" id="btnGateNow" class="btn primary" style="min-height:44px;padding:0 16px;font-size:13px;white-space:nowrap">📞 OTWÓRZ BRAMĘ</button>'+
        '<button type="button" id="btnGateDismiss" class="btn ghost" style="min-height:44px;padding:0 12px;font-size:13px">✕</button></div>';
      document.body.appendChild(b);
      document.getElementById('btnGateNow').onclick=()=>this.dial(true);
      document.getElementById('btnGateDismiss').onclick=()=>this.hideBanner();
    }
    const distEl=document.getElementById('gateBanDist');
    if(distEl&&d!=null) distEl.textContent=String(Math.round(d));
    b.style.display='flex';
  },

  hideBanner(){
    const b=document.getElementById('gateBanner');
    if(b) b.style.display='none';
  },

  saveCurrentPos(){
    const g=gcfg();
    const p=Geo.pos||(S.demo?{lat:52.4082,lon:17.0775}:null);
    if(!p||p.lat==null){
      toast('Brak sygnału GPS! Wyjdź na zewnątrz lub poczekaj na złapanie pozycji.',{type:'warn'});
      return;
    }
    g.lat=Number(p.lat.toFixed(6));
    g.lon=Number(p.lon.toFixed(6));
    this.armed=false;
    saveSettings();
    this.updateStatusUI();
    toast('📍 Zapisano pozycję GPS bramy ('+g.lat+', '+g.lon+'). Stan: ROZBROJONY',{type:'info'});
  },

  testTrigger(){
    const g=gcfg();
    Voice.speak('Zbliżasz się do domu. Otwieram bramę wjazdową.',1);
    this.showBanner(45);
    if(g.autoOpen && g.phone){
      setTimeout(()=>this.dial(true),1200);
    }
  },

  tick(){
    const g=gcfg();
    this.updateStatusUI();
    if(!g.on||!g.phone||g.lat==null||g.lon==null||!Geo.pos) return;

    const d=dist(Geo.pos,{lat:g.lat,lon:g.lon});
    this.curDist=d;
    const spd=(S.connected||S.demo)?S.raw.speed:(Geo.pos.spd||0);

    // 1. Uzbrój automat po wyjeździe z domu powyżej progu armDist (np. 250 m)
    if(!this.armed && d>g.armDist){
      this.armed=true;
      toast('🔒 Automat bramy GSM uzbrojony (wyjazd poza strefę '+g.armDist+' m)',{type:'info'});
    }

    // 2. Wyzwól otwieranie przy powrocie do domu poniżej trigDist (np. 85 m)
    if(this.armed && d<=g.trigDist && spd>=2){
      this.armed=false;
      const now=Date.now();
      if(now-this.lastTrigger>60000){
        this.lastTrigger=now;
        Voice.speak('Zbliżasz się do domu. Otwieram bramę.',1);
        this.showBanner(d);
        if(g.autoOpen){
          this.dial(false);
        }
      }
    }
  },

  updateStatusUI(){
    const g=gcfg();
    const stEl=document.getElementById('gateStatTxt');
    if(!stEl) return;
    if(g.lat==null||g.lon==null){
      stEl.textContent='Nie zapisano pozycji GPS bramy';
      return;
    }
    const dTxt=this.curDist!=null?(Math.round(this.curDist)+' m od bramy'):(g.lat.toFixed(4)+', '+g.lon.toFixed(4));
    const armTxt=this.armed?'🟢 UZBROJONY (czeka na powrót)':'⚪ ROZBROJONY (w bazie / pod domem)';
    stEl.textContent=armTxt+' · '+dTxt;
  },

  ui(){
    const g=gcfg(), host=document.querySelector('#view-logi'); if(!host) return;
    // Dodaj przycisk pilota bramy na górny pasek (#topbar)
    const topStatus=document.querySelector('#topbar .top-status');
    const sndBtn=document.getElementById('btnSound');
    if(topStatus && sndBtn && !document.getElementById('btnTopGate')){
      const gb=document.createElement('button');
      gb.id='btnTopGate';
      gb.className='icon-btn';
      gb.type='button';
      gb.title='Otwórz bramę GSM (zadzwoń na szlaban)';
      gb.setAttribute('aria-label','Otwórz bramę GSM');
      gb.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
      gb.onclick=()=>this.dial(true);
      topStatus.insertBefore(gb,sndBtn);
    }

    // Panel konfiguracji bramy w LOGI & USTAWIENIA
    const p=document.createElement('div');
    p.className='tile panel';
    p.innerHTML='<h2>BRAMA / SZLABAN GSM (GEOFENCING — WARIANT B)</h2>'+
      '<div class="switch-row"><div class="lbl">Automatyczne otwieranie przed domem<small>Wykrywa powrót z trasy (>'+g.armDist+' m → <'+g.trigDist+' m)</small></div>'+
      '<label class="switch"><input type="checkbox" id="gtOn" '+(g.on?'checked':'')+'><span class="knob"></span></label></div>'+
      '<div class="switch-row"><div class="lbl">Od razu otwórz ekran dzwonienia (tel:)<small>Po wjechaniu w strefę bramy od razu przekazuje numer do telefonu</small></div>'+
      '<label class="switch"><input type="checkbox" id="gtAuto" '+(g.autoOpen?'checked':'')+'><span class="knob"></span></label></div>'+
      '<div class="set-row" style="margin-top:10px"><div class="set-top"><label for="gtPhone">Numer telefonu modułu GSM bramy</label></div>'+
      '<input type="tel" id="gtPhone" placeholder="np. +48 500 600 700" value="'+(g.phone||'')+'" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--neon-line);background:var(--card2);color:var(--txt);font-family:var(--mono);font-size:14px"></div>'+
      '<div class="set-row"><div class="set-top"><label>Odległość otwarcia przed bramą</label><span class="num" id="gtTrigVal">'+g.trigDist+' m</span></div>'+
      '<input type="range" id="gtTrig" min="30" max="200" step="5" value="'+g.trigDist+'"></div>'+
      '<div class="set-row"><div class="set-top"><label>Odległość uzbrojenia po wyjeździe</label><span class="num" id="gtArmVal">'+g.armDist+' m</span></div>'+
      '<input type="range" id="gtArm" min="150" max="600" step="25" value="'+g.armDist+'"></div>'+
      '<div class="kv"><small>STATUS BRAMY</small><b id="gateStatTxt">—</b></div>'+
      '<div class="btn-row" style="margin-top:12px">'+
      '<button class="btn primary" id="btnGateSetPos" type="button">📍 ZAPISZ POZYCJĘ BRAMY (GPS)</button>'+
      '<button class="btn blue" id="btnGateCallNow" type="button">📞 OTWÓRZ TERAZ</button>'+
      '<button class="btn ghost" id="btnGateSim" type="button">TEST POWROTU</button></div>';

    host.insertBefore(p,host.lastElementChild);

    document.getElementById('gtOn').onchange=e=>{ gcfg().on=e.target.checked; saveSettings(); this.updateStatusUI(); };
    document.getElementById('gtAuto').onchange=e=>{ gcfg().autoOpen=e.target.checked; saveSettings(); };
    document.getElementById('gtPhone').oninput=e=>{ gcfg().phone=e.target.value.trim(); saveSettings(); };
    document.getElementById('gtTrig').oninput=e=>{ gcfg().trigDist=parseInt(e.target.value,10); document.getElementById('gtTrigVal').textContent=e.target.value+' m'; saveSettings(); };
    document.getElementById('gtArm').oninput=e=>{ gcfg().armDist=parseInt(e.target.value,10); document.getElementById('gtArmVal').textContent=e.target.value+' m'; saveSettings(); };
    document.getElementById('btnGateSetPos').onclick=()=>this.saveCurrentPos();
    document.getElementById('btnGateCallNow').onclick=()=>this.dial(true);
    document.getElementById('btnGateSim').onclick=()=>this.testTrigger();
    this.updateStatusUI();
  }
};

function boot(){
  cfg(); gcfg(); ui(); Gate.ui(); Geo.start();
  document.addEventListener('pointerdown',()=>{ try{ speechSynthesis.getVoices(); }catch(e){} },{once:true});
  setInterval(()=>{ try{ Nav.tick(); Eco.tick(); Gate.tick(); status(); }catch(e){} },1000);
}
window.RapidVoice={Voice,Geo,OSM,Nav,Eco,Gate,parseMax};
if(typeof document!=='undefined'&&document.querySelector){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
}
})();
