// Gwyn's kneeling phase-2 cinematic: clips baked, cine preset, host/guest-safe hook, skippable
const fs=require('fs');let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const a=JSON.parse(fs.readFileSync('assets/warden_mx_gwyn.json','utf8')),L=Array.isArray(a)?a:a.clips,nm={};for(const c of L)nm[c.name]=c;
ok(nm.gw_kneel&&nm.gw_pray&&nm.power,'Gwyn asset has kneel / pray / power');
const mx=fs.readFileSync('src/combat/WardenMX.js','utf8'),pc=fs.readFileSync('src/combat/PlayerCombat.js','utf8'),cc=fs.readFileSync('src/combat/CineCam.js','utf8');
ok(/ROLES\.gwyn\.kn=true/.test(mx)&&/f\.kn>0&&A\.gw_kneel/.test(mx)&&/R\.kn\)for\(const n of\['gw_kneel','gw_pray','power'\]\)used/.test(mx),'WardenMX plays the kneel timeline and loads its clips');
ok(/kneel:\{dur:4\.3,freeze:true/.test(cc),'kneel cine preset freezes the sim');
ok(/F\.T\.id==='gwyn'&&!ult&&!sv&&CineCam\.play\('kneel'/.test(pc)&&/done:\(\)=>\{F\.f\.kn=0/.test(pc),'phase 2 of Gwyn plays it, and skipping clears the kneel');
ok(/addEventListener\('pointerdown',skip,true\)/.test(cc)&&/seen\[key\]&&!o\.force/.test(cc),'every cinematic is skippable by tap / key; seen intros are not repeated');
console.log(n+' checks')
