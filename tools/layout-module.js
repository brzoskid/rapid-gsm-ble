/* RAPID LAYOUT MODULE — układ v2: znak limitu, bieg przy prędkości, duże dane, motyw dzień/noc */
(()=>{ 'use strict';
const q=s=>document.querySelector(s);
const CSS=`
.t-gear{display:none!important}
#limBadge{display:none!important}
.spd-track,.spd-scale{display:none!important}
#view-silnik .t-bar{display:block}
.grid-dash{
  grid-template-rows:minmax(0,1.35fr) minmax(0,.8fr) minmax(0,1.5fr) minmax(0,.75fr) minmax(0,.75fr);
  grid-template-areas:"spd spd lim" "rpm rpm rpm" "bst bst eco" "c1 c2 c3" "c4 c5 c6";
}
.t-lim{grid-area:lim;display:flex;flex-direction:column;align-items:center}
.t-lim svg{flex:1;min-height:0;width:100%;height:100%;margin-top:2px}
.t-lim.none svg{opacity:.28}
.t-lim.over svg{animation:limPulse .8s ease-in-out infinite}
@keyframes limPulse{50%{filter:drop-shadow(0 0 9px var(--red))}}
.t-speed,.t-rpm,.t-eco,.t-lim,.tile.mini{container-type:size}
.spd-row{display:flex;align-items:flex-end;gap:3cqw;min-height:0}
.spd-side{display:flex;flex-direction:column;align-items:flex-start;padding-bottom:.5em}
.spd-side .speed-unit{margin:4px 0 0}
.gear-mini{font:800 clamp(24px,5.4vh,46px) var(--mono);color:var(--neon);line-height:1}
.gear-mini small{display:block;font:700 8.5px var(--sans);letter-spacing:.18em;color:var(--muted);margin-bottom:2px}
.gear-mini.n{color:var(--muted)}
.gear-mini.shift{color:var(--amber);animation:blink .5s steps(2) infinite}
.speed-val.over{color:var(--red);text-shadow:0 0 22px rgba(255,51,51,.45)}
.tile.mini{display:flex;flex-direction:column}
.mini .t-value{flex:1;display:flex;align-items:center;white-space:nowrap;line-height:1;font-size:min(56cqh,27cqw)}
.mini .t-unit{font-size:.3em;margin-left:.25em}
.mini .t-status,.mini .t-bar{display:none}
.eco-inst .num{font-size:min(38cqh,25cqw)}
.rpm-val{font-size:min(46cqh,15cqw)}
#clock{cursor:pointer}
@media (orientation:landscape) and (max-height:520px){
  .grid-dash{
    grid-template-columns:1.2fr 1.2fr 1fr 1fr;
    grid-template-rows:minmax(0,1fr) minmax(0,1fr) minmax(0,.6fr);
    grid-template-areas:"spd spd lim bst" "rpm rpm eco bst" "c1 c2 c3 c4";
  }
}
/* ===== MOTYW DZIENNY ===== */
body.day{--bg:#eef3f0;--card:#fff;--card2:#f2f6f4;--neon:#007a36;--neon-dim:rgba(0,122,54,.35);--neon-line:rgba(0,90,40,.2);--amber:#b36b00;--red:#c62828;--blue:#0068a8;--txt:#0d1f15;--muted:#4d6659;--scrim:rgba(20,30,25,.45)}
body.day *{text-shadow:none!important}
body.day .bg-aurora,body.day .bg-grain,body.day .bg-vignette{display:none}
body.day .tile{background:#fff;box-shadow:0 2px 10px rgba(0,40,20,.12)}
body.day #topbar,body.day #tabbar{background:rgba(255,255,255,.93)}
body.day .rpm-track,body.day .t-bar{background:#dce7e0}
body.day .rpm-track::after{background:repeating-linear-gradient(90deg,transparent 0 12px,rgba(255,255,255,.9) 12px 15px)}
body.day .btn.primary{color:#fff;background:linear-gradient(180deg,#00a04a,#007a36)}
body.day .dialog,body.day .toast{background:#fff}
body.day .term,body.day #chartCanvas{background:#f4f8f5}
body.day .switch .knob{background:#dce7e0}
body.day .switch .knob::after{background:#8aa395}
body.day select{background:#fff}
body.day #boostNeedle{stroke:#0d1f15}
body.day #boostVal{fill:#0d1f15}
body.day *{scrollbar-color:#9fbbab #eef3f0}
`;
/* wysokość Słońca [°] — uproszczony algorytm astronomiczny */
function sunAlt(lat,lon,ms){
  const r=Math.PI/180, n=ms/86400000+2440587.5-2451545.0;
  const L=(280.46+0.9856474*n)%360, g=((357.528+0.9856003*n)%360)*r;
  const lam=(L+1.915*Math.sin(g)+0.02*Math.sin(2*g))*r, eps=23.439*r;
  const dec=Math.asin(Math.sin(eps)*Math.sin(lam));
  const ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam));
  const lst=(((18.697374558+24.06570982441908*n)%24)*15+lon)*r;
  return Math.asin(Math.sin(lat*r)*Math.sin(dec)+Math.cos(lat*r)*Math.cos(dec)*Math.cos(lst-ra))/r;
}
const TH=()=>settings.theme||'auto';
function isDay(){
  const g=window.RapidVoice&&RapidVoice.Geo&&RapidVoice.Geo.pos;
  return sunAlt(g?g.lat:52.4,g?g.lon:16.9,Date.now())>-2;
}
function applyTheme(){
  const m=TH(), day=m==='day'||(m==='auto'&&isDay());
  document.body.classList.toggle('day',day);
  const mt=q('meta[name=theme-color]'); if(mt) mt.content=day?'#eef3f0':'#050a08';
}
/* aktualny limit: z mapy, a w trybie DEMO z fazy symulatora */
function curLimit(){
  const N=window.RapidVoice&&RapidVoice.Nav;
  let l=N?N.curLim:null;
  if(l==null&&S.demo&&typeof sim!=='undefined'&&sim&&sim.phase){
    const n=sim.phase.n; l=/Ekspres/.test(n)?120:/Wylot/.test(n)?90:50;
  }
  return l;
}
const COL={cold:'var(--blue)',warn:'var(--amber)',crit:'var(--red)'};
function paint(valSel,cls){ const e=q(valSel); if(e) e.style.color=COL[cls]||''; }
let overMs=0, tickN=0;
function tick(){
  const spd=S.raw.speed, lim=curLimit();
  overMs=(lim!=null&&spd>lim)?overMs+500:0;
  const over=overMs>=5000;
  q('#spdVal').classList.toggle('over',over);
  const tile=q('#limTile'); tile.classList.toggle('none',lim==null); tile.classList.toggle('over',over);
  const num=q('#limNum'); num.textContent=lim==null?'—':String(lim);
  num.setAttribute('font-size',lim!=null&&lim>=100?'36':'44');
  const gm=q('#gearMini'), g=S.der.gear;
  gm.querySelector('span').textContent=g; gm.classList.toggle('n',g==='N');
  gm.classList.toggle('shift',q('#shiftHint').classList.contains('on'));
  const cc=q('#mCoolBar'), oc=q('#mOilChip'), vc=q('#mVoltChip');
  paint('#mCoolVal',cc&&['cold','warn','crit'].find(c=>cc.classList.contains(c)));
  paint('#mOilVal',oc&&['cold','warn','crit'].find(c=>oc.classList.contains(c)));
  paint('#mVoltVal',vc&&['warn','crit'].find(c=>vc.classList.contains(c)));
  const tr=q('#mTrim'); paint('#mTrimVal',tr&&tr.classList.contains('hot')?'warn':null);
  if(++tickN%60===0) applyTheme();
}
function build(){
  const css=document.createElement('style'); css.textContent=CSS; document.head.appendChild(css);
  const sp=q('.t-speed'), val=q('#spdVal'), unit=sp.querySelector('.speed-unit');
  const row=document.createElement('div'); row.className='spd-row';
  const side=document.createElement('div'); side.className='spd-side';
  side.innerHTML='<div class="gear-mini n" id="gearMini"><small>BIEG</small><span>N</span></div>';
  side.appendChild(unit);
  val.parentNode.insertBefore(row,val); row.appendChild(val); row.appendChild(side);
  const t=document.createElement('div'); t.className='tile t-lim none'; t.id='limTile';
  t.innerHTML='<div class="t-label">LIMIT</div><svg viewBox="0 0 100 100" aria-label="Ograniczenie prędkości">'+
    '<circle cx="50" cy="50" r="45" fill="#fff" stroke="#e53935" stroke-width="10"/>'+
    '<text id="limNum" x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="44" fill="#111">—</text></svg>';
  q('.grid-dash').appendChild(t);
  /* ustawienia motywu */
  const host=q('#view-logi'), p=document.createElement('div'); p.className='tile panel';
  p.innerHTML='<h2>WYGLĄD</h2><div class="set-row"><div class="set-top"><label for="selTheme">Motyw dzień / noc</label></div>'+
    '<select id="selTheme" style="width:100%"><option value="auto">Automatyczny (wschód / zachód słońca)</option>'+
    '<option value="day">Tylko dzienny</option><option value="night">Tylko nocny</option></select></div>'+
    '<p style="font-size:10px;color:var(--muted);margin-top:8px">Tryb automatyczny liczy zachód słońca z pozycji GPS. Stuknięcie w zegar u góry przełącza tryby.</p>';
  host.insertBefore(p,host.lastElementChild);
  const sel=q('#selTheme'); sel.value=TH();
  sel.onchange=()=>{ settings.theme=sel.value; saveSettings(); applyTheme(); };
  const NAMES={auto:'Motyw: automatyczny',day:'Motyw: tylko dzienny',night:'Motyw: tylko nocny'};
  q('#clock').onclick=()=>{
    const o=['auto','day','night']; settings.theme=o[(o.indexOf(TH())+1)%3];
    saveSettings(); sel.value=settings.theme; applyTheme(); toast(NAMES[settings.theme],{type:'info'});
  };
  applyTheme(); setInterval(()=>{ try{ tick(); }catch(e){} },500);
}
window.RapidLayout={sunAlt,applyTheme};
if(typeof document!=='undefined'&&document.querySelector){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',build); else build();
}
})();
