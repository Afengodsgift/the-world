// Journal v0 (button is part of the right-hand dock, see theme.css .dk-jrn): a read-only view over WS.entries(). 📖 button (or J key) opens a bottom sheet.
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
  const E=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
  function build(){
    if(btn)return;
    btn=E('button','dk dk-jrn','\u{1F4D6}');btn.onclick=toggle;document.body.appendChild(btn);
    panel=E('div','sheet');panel.style.display='none';document.body.appendChild(panel);
    addEventListener('keydown',e=>{if(e.code==='KeyJ'&&!e.repeat&&e.target.tagName!=='INPUT')toggle()});
  }
  const day=(ts,t0)=>Math.max(1,Math.floor((ts-t0)/864e5)+1);
  function render(){
    panel.innerHTML='';
    const x=E('button','x','\u2715');x.onclick=toggle;panel.appendChild(x);
    panel.appendChild(E('h3','','Our Journal'));
    const es=WS.entries(),t0=es.length?es[0].ts:Date.now();
    if(typeof got!=='undefined'){
      const st=E('div','jstats'),chip=(ic,v)=>{const c=E('span','');c.textContent=ic+' '+v;st.appendChild(c)};
      chip('\u2728',got+'/'+orbs.length);chip('\u{1F4CD}',disc.size+'/'+LOCS.length);chip('\u{1F9F0}',treas);
      chip('\u{1F3D5}\uFE0F',WS.getSet('camps').length);chip('\u{1F5DD}\uFE0F',WS.getSet('solved').length);chip('\u{1F392}',WS.getSet('loot').length);
      if(es.length)chip('\u{1F4C5}','Day '+day(Date.now(),t0));
      panel.appendChild(st);
    }
    if(!es.length){panel.appendChild(E('p','jempty','Nothing here yet. Go explore \u2014 the world remembers.'));return}
    let lastDay=0;
    for(const e of es.slice().reverse()){
      const d=day(e.ts,t0);if(d!==lastDay){lastDay=d;panel.appendChild(E('div','jday','Day '+d))}
      const K=KINDS[e.kind]||{},ic=(e.data&&e.data.icon)||K.icon||'\u2022',tx=(e.data&&e.data.text)||(K.text?K.text(e):e.kind+' '+e.key);
      const row=E('div','jrow'),b=E('div','tx');
      row.appendChild(E('div','ic',ic));b.appendChild(document.createTextNode(tx));
      b.appendChild(E('div','sub',(e.by&&e.kind!=='start'?e.by+' \u00B7 ':'')+new Date(e.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})));
      row.appendChild(b);panel.appendChild(row);
    }
  }
  function toggle(){build();if(panel.style.display==='block'){panel.style.display='none';return}render();panel.style.display='block'}
  function init(){build();WS.onChange(k=>{if(panel&&panel.style.display==='block'&&(k==='*'||k.startsWith('log:')))render()})}
  return {init,toggle};
})();
