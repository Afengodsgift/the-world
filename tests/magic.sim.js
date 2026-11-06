// Arcane magic replaces Flow; buffered taps; guest->host magic damage
const fs=require('fs');const s=fs.readFileSync('src/combat/PlayerCombat.js','utf8');let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
ok(/function magicStrike/.test(s)&&/THUNDERFALL/.test(s)&&/ARCANE STORM/.test(s),'Thunderfall and Arcane Storm exist');
ok(!/flowOn=true;flowN=0;msg\('FLOW'/.test(s),'the old Flow mode no longer starts');
ok(/<button id="wFlow">Magic<\/button>/.test(s),'the button says Magic');
ok(/p\.t==='mg'&&NET\.mode==='host'/.test(s)&&/p\.t==='pf'\|\|p\.t==='mg'/.test(s),'guest magic is applied by the host');
ok(/function magicHit[^}]*NET\.mode==='guest'\)return/.test(s),'only the host applies magic damage');
ok(/function bufTick/.test(s)&&/bufSet\('jump'\)/.test(s)&&/bufSet\('shadow'\)/.test(s)&&/bufSet\('swap'\)/.test(s)&&/bufTick\(\)/.test(s),'jump / shadow / twin taps are buffered 0.35 s');
ok(/ptr\[name\]!==undefined&&holdy/.test(s),'a stale pointer can no longer swallow taps on a tap button');
console.log(n+' checks')
