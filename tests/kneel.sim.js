// Gwyn's kneeling phase-2 cinematic: clips baked, cine preset, host/guest-safe hook, skippable
const fs=require('fs');let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const a=JSON.parse(fs.readFileSync('assets/warden_mx_gwyn.json','utf8')),L=Array.isArray(a)?a:a.clips,nm={};for(const c of L)nm[c.name]=c;
ok(nm.gw_kneel&&nm.gw_pray&&nm.power,'Gwyn asset has kneel / pray / power');
const mx=fs.readFileSync('src/combat/WardenMX.js','utf8'),pc=fs.readFileSync('src/combat/PlayerCombat.js','utf8'),cc=fs.readFileSync('src/combat/CineCam.js','utf8');
ok(/for\(const q of\['gwyn','samurai','saint'\]\)/.test(mx)&&/f\.kn>0&&A\.gw_kneel/.test(mx)&&/R\.kn\)for\(const n of\['gw_kneel','gw_pray','power'\]\)used/.test(mx),'WardenMX plays the kneel timeline and loads its clips');
ok(/kneel:\{dur:4\.3,freeze:true/.test(cc),'kneel cine preset freezes the sim');
ok(/function kneelCine/.test(pc)&&/CineCam\.play\('kneel'/.test(pc)&&/done:\(\)=>\{F\.f\.kn=0/.test(pc)&&/F\.T\.id==='gwyn'\)kneelCine/.test(pc)&&/F\.T\.id==='samurai'\|\|F\.T\.id==='saint'\)kneelCine/.test(pc),'Gwyn (phase 2), Kage and the Saint (phase 3) kneel; skipping clears it');for(const r of['samurai','saint']){const a=JSON.parse(fs.readFileSync('assets/warden_mx_'+r+'.json','utf8')),L=Array.isArray(a)?a:a.clips;ok(L.some(c=>c.name==='gw_kneel')&&L.some(c=>c.name==='gw_pray')&&L.some(c=>c.name==='power'),r+' has the kneel clips')}
ok(/addEventListener\('pointerdown',skip,true\)/.test(cc)&&/seen\[key\]&&!o\.force/.test(cc),'every cinematic is skippable by tap / key; seen intros are not repeated');
console.log(n+' checks')
{const pc=require('fs').readFileSync('src/combat/PlayerCombat.js','utf8'),ai=require('fs').readFileSync('src/combat/DuelistAI.js','utf8');let m=0;const k=(c,t)=>{if(!c){console.log('FAIL '+t);process.exitCode=1}else m++};
k(/function saintFx/.test(pc)&&/VEIL REQUIEM/.test(pc)&&/A\.T\.ai==='saint'\)saintFx/.test(pc),'Saint moves have light telegraphs, trails and named chains');k(/A\.cn=nm/.test(ai),'a chain start is flagged for the callout');console.log(m+' saint checks')}
