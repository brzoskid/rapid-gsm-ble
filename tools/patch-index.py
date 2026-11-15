#!/usr/bin/env python3
"""Nakłada na oryginalny index.html: pulpit 1-ekranowy + poprawki SPP (Capacitor).
Idempotentny: drugie uruchomienie nic nie zmienia. Użycie: python3 tools/patch-index.py www/index.html"""
import re, sys

path = sys.argv[1] if len(sys.argv) > 1 else "www/index.html"
src = open(path, encoding="utf-8").read().replace("\r\n", "\n")

if "PULPIT 1-EKRANOWY" in src:
    print("index.html już załatany — pomijam.")
    sys.exit(0)

def sub1(pattern, repl, text, flags=0):
    new, n = re.subn(pattern, lambda m: repl(m) if callable(repl) else repl, text, count=1, flags=flags)
    if n != 1:
        sys.exit("BŁĄD: nie znaleziono miejsca do poprawki: " + pattern[:60] +
                 "\nCzy www/index.html to Twój oryginalny plik RAPID·OBD?")
    return new

# 1) HTML: 3 dodatkowe miniatury
MINI = '''
        <div class="tile mini" id="mTrim">
          <div class="t-label">KOREKTY ST+LT</div>
          <div class="t-value"><span class="num" id="mTrimVal">—</span><span class="t-unit">%</span></div>
        </div>
        <div class="tile mini">
          <div class="t-label">TEMP. DOLOTU</div>
          <div class="t-value"><span class="num" id="mIatVal">—</span><span class="t-unit">°C</span></div>
        </div>
        <div class="tile mini">
          <div class="t-label">MAP</div>
          <div class="t-value"><span class="num" id="mMapVal">—</span><span class="t-unit">kPa</span></div>
        </div>'''
src = sub1(r'(id="mVoltChip">—</span></div>\s*</div>)', lambda m: m.group(1) + MINI, src)

# 2) JS: renderTexts
JS = '''renderEngineTiles();
  $('#mTrimVal').textContent=fmt(r.stft+r.ltft,1);
  $('#mTrim').classList.toggle('hot',Math.abs(r.stft+r.ltft)>=settings.trimAlarm);
  $('#mIatVal').textContent=fmt(r.iat,0);
  $('#mMapVal').textContent=fmt(r.map,0);
  if(S.rec.active)'''
src = sub1(r'renderEngineTiles\(\);\s*if\(S\.rec\.active\)', lambda m: JS, src)

# 3) JS: getSPP + SPPTransport.connect
src = sub1(r'function getSPP\(\)\{[^\n]*\}',
  lambda m: ("function getSPP(){ return window.bluetoothClassicSerial"
             "||(window.cordova&&window.cordova.plugins&&window.cordova.plugins.bluetoothSerial)"
             "||window.bluetoothSerial||null; }"), src)
CONNECT = '''  connect(){ return new Promise((res,rej)=>{
    this.bs.connect(this.mac, ()=>{
      this.bs.subscribeRawData(d=>this.onData(this.dec.decode(new Uint8Array(d))),
                               ()=>this.onClose&&this.onClose());
      res();
    }, rej);
  }); }
'''
src = sub1(r'  connect\(\)\{ return new Promise\(\(res,rej\)=>\{\n    this\.bs\.connect.*?(?=  write\(str\)\{ return new Promise)',
           lambda m: CONNECT, src, flags=re.S)

# 4) CSS
CSS = r'''
/* ===== PULPIT 1-EKRANOWY ===== */
html,body{height:100dvh}
#main{padding:8px}
#view-kokpit.active{display:block;height:100%;max-width:none}
#view-kokpit .view-head{display:none}
#view-kokpit .tile{padding:8px 10px;min-height:0;overflow:hidden;border-radius:14px}
#view-kokpit .t-label{font-size:8.5px;margin-bottom:2px}
.grid-dash{
  height:100%;gap:8px;
  grid-template-columns:repeat(3,minmax(0,1fr));
  grid-template-rows:minmax(0,1.35fr) minmax(0,.8fr) minmax(0,1.5fr) minmax(0,.7fr) minmax(0,.7fr);
  grid-template-areas:
    "spd spd gear"
    "rpm rpm rpm"
    "bst bst eco"
    "c1  c2  c3"
    "c4  c5  c6";
}
.t-speed{grid-area:spd}.t-gear{grid-area:gear}.t-rpm{grid-area:rpm}
.t-boost{grid-area:bst}.t-eco{grid-area:eco}
.mini-row{display:contents}
.mini-row>.tile:nth-child(1){grid-area:c1}
.mini-row>.tile:nth-child(2){grid-area:c2}
.mini-row>.tile:nth-child(3){grid-area:c3}
.mini-row>.tile:nth-child(4){grid-area:c4}
.mini-row>.tile:nth-child(5){grid-area:c5}
.mini-row>.tile:nth-child(6){grid-area:c6}
.speed-val{font-size:clamp(44px,11vh,96px)}
.gear-val{font-size:clamp(40px,9vh,76px)}
.rpm-val{font-size:clamp(22px,4.6vh,38px)}
.mini .t-value{font-size:clamp(17px,3.4vh,26px)}
.eco-inst .num{font-size:clamp(24px,5vh,42px)}
.spd-scale,.trip-line,.gear-sub,.t-bar,.rpm-foot{display:none}
.spd-track{height:8px;margin-top:6px}
.rpm-track{height:12px;margin-top:6px}
.eco-row{margin-top:6px;padding-top:6px}
.t-boost{display:flex;flex-direction:column}
.boost-svg{flex:1;min-height:0;height:100%}
#alarmBanner{position:fixed;top:calc(var(--top) + env(safe-area-inset-top) + 6px);left:10px;right:10px;margin:0;z-index:35}
@media (orientation:landscape) and (max-height:520px){
  :root{--top:44px;--nav:52px}
  .tab span{display:none}
  .grid-dash{
    grid-template-columns:1.3fr 1.3fr 1fr 1fr;
    grid-template-rows:minmax(0,1fr) minmax(0,1fr) minmax(0,.55fr);
    grid-template-areas:
      "spd rpm bst bst"
      "spd gear bst eco"
      "c1 c2 c3 c4";
  }
  .mini-row>.tile:nth-child(5),.mini-row>.tile:nth-child(6){display:none}
  .speed-val{font-size:clamp(44px,20vh,110px)}
}
'''
src = sub1(r'</style>', lambda m: CSS + '</style>', src)

open(path, "w", encoding="utf-8").write(src)
print("OK: index.html załatany.")
