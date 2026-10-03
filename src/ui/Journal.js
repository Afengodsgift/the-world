// Journal v0: a read-only view over WS.entries(). 📖 button (or J key) opens a bottom sheet.
// It owns no data: whatever any system writes with WS.log(kind,key,data) shows up here.
// Add a new kind by adding one row to KINDS (and, if it has a world position, x/z in data
// so it can be tracked on the map later).
const Journal=(()=>{
  const KINDS={
    start:{icon:'🌍',text:e=>'You started a world together'},
    place:{icon:'📍',text:e=>'Discovered '+e.key},
    treasure:{icon:'🧰',text:e=>'Dug up treasure #'+(e.key.split(':')[1]||'?')},
    shards:{icon:'✨',text:e=>'Collected '+(e.data&&e.data.n||'?')+' star shards'}
  };
  let btn,panel;
  const E=(tag,css,txt)=>{const e=document.createElement(tag);if(css)e.style.cssText=css;if(txt!==undefined)e.textContent=txt;return e};
  function build(){
    if(btn)return;
    btn=E('button','position:fixed;z-index:6;right:12px;top:calc(env(safe-area-inset-top,0px) + 120px);width:46px;height:46px;border-radius:50%;border:0;background:#ffffffd9;font-size:24px;padding:0','📖');
    btn.onclick=toggle;document.body.appendChild(btn);
    panel=E('div','position:fixed;z-index:12;left:0;right:0;bottom:0;max-height:62vh;overflow-y:auto;display:none;padding:12px 14px calc(env(safe-area-inset-bottom,0px) + 16px);background:#0d1330f2;border-radius:18px 18px 0 0;color:#fff;box-shadow:0 -6px 30px #0008;font:15px sans-serif');
    document.body.appendChild(panel);
    addEventListener('keydown',e=>{if(e.code==='KeyJ'&&!e.repeat)toggle()});
  }
  const day=(ts,t0)=>Math.max(1,Math.floor((ts-t0)/864e5)+1);
  function render(){
    panel.innerHTML='';
    const x=E('button','float:right;font-size:18px;padding:4px 12px;background:#ffffff33;color:#fff;border:0;border-radius:12px;width:auto','✕');x.onclick=toggle;panel.appendChild(x);
    panel.appendChild(E('h3','margin:4px 0 2px','Our Journal'));
    const es=WS.entries(),t0=es.length?es[0].ts:Date.now();
    const stat=(typeof got!=='undefined')?('✨ '+got+'/'+orbs.length+'   📍 '+disc.size+'/'+LOCS.length+'   🧰 '+treas+'   🏕️ '+WS.getSet('camps').length+'   🎒 '+WS.getSet('loot').length):'';
    panel.appendChild(E('div','opacity:.7;font-size:13px;margin-bottom:10px',stat+(es.length?'   · Day '+day(Date.now(),t0)+' together':'')));
    if(!es.length){panel.appendChild(E('p','opacity:.7','Nothing here yet. Go explore — the world remembers.'));return}
    let lastDay=0;
    for(const e of es.slice().reverse()){
      const d=day(e.ts,t0);if(d!==lastDay){lastDay=d;panel.appendChild(E('h4','margin:12px 2px 4px;font-size:12px;opacity:.6;letter-spacing:.08em;text-transform:uppercase','Day '+d))}
      const K=KINDS[e.kind]||{},ic=(e.data&&e.data.icon)||K.icon||'•',tx=(e.data&&e.data.text)||(K.text?K.text(e):e.kind+' '+e.key);
      const row=E('div','display:flex;gap:10px;align-items:baseline;padding:6px 4px;border-bottom:1px solid #ffffff12');
      row.appendChild(E('span','font-size:18px',ic));
      const b=E('div','flex:1');b.appendChild(E('div','',tx));
      const sub=(e.by&&e.kind!=='start'?'by '+e.by+' · ':'')+new Date(e.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      b.appendChild(E('div','font-size:12px;opacity:.55',sub));row.appendChild(b);panel.appendChild(row);
    }
  }
  function toggle(){build();if(panel.style.display==='block'){panel.style.display='none';return}render();panel.style.display='block'}
  function init(){build();WS.onChange(k=>{if(panel&&panel.style.display==='block'&&(k==='*'||k.startsWith('log:')))render()})}
  return {init,toggle};
})();
