// Scope: every gun has a zoom, snipers get the lens, the zoom is a real zoom (FOV tangent / z), sensitivity and spread follow it.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';const c={Math};vm.createContext(c);vm.runInContext(fs.readFileSync(R+'src/combat/Scope.js','utf8')+';this.SC=Scope',c);const SC=c.SC;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const src=fs.readFileSync(R+'src/games/Outlaw.js','utf8'),wsrc=src.slice(src.indexOf('const WEAPONS=['),src.indexOf('const RECOIL='));
const guns=[...wsrc.matchAll(/\{n:'([^']+)',f:'[^']+'[^}]*snd:'(\w+)'/g)].map(m=>({n:m[1],snd:m[2]}));
ok(guns.length===16,'found all 16 guns in Outlaw.js ('+guns.length+')');
ok(guns.every(g=>SC.ZOOM[g.n]>1),'every gun has its own zoom level (none falls back to the default)');
ok(guns.filter(g=>g.snd==='sniper'&&g.n!=='Magnum').every(g=>SC.overlay(SC.zoomOf(g.n))),'the Hunting Rifle and Marksman get the full scope lens');
ok(SC.zoomOf('Marksman')>SC.zoomOf('Hunting Rifle')&&SC.zoomOf('Hunting Rifle')>SC.zoomOf('Assault Rifle'),'zoom ladder: Marksman 6x > Hunting Rifle 5x > Assault Rifle 3x');
ok(!SC.overlay(SC.zoomOf('Magnum'))&&!SC.overlay(SC.zoomOf('Assault Rifle'))&&!SC.overlay(SC.zoomOf('Pump Shotgun')),'rifles/magnum/shotguns zoom without the black lens');
for(const z of [1.5,3,5,6]){const base=70,f=SC.fov(base,z),ratio=Math.tan(base*Math.PI/360)/Math.tan(f*Math.PI/360);ok(Math.abs(ratio-z)<1e-9,'FOV at '+z+'x is a true '+z+'x zoom ('+f.toFixed(1)+' deg from '+base+')')}
ok(SC.fov(70,1)===70&&SC.fov(70,.5)===70,'no zoom leaves the FOV alone');
ok(SC.lookK(1)===1&&SC.lookK(6)<SC.lookK(3)&&SC.lookK(3)<SC.lookK(1.5)&&SC.lookK(6)>.15&&SC.lookK(6)<.3,'look sensitivity drops with zoom (6x -> '+SC.lookK(6).toFixed(2)+') but never becomes unusable');
ok(SC.spreadK(6)<SC.spreadK(3)&&SC.spreadK(3)<SC.spreadK(1),'aiming down the sights is steadier');
console.log(bad?bad+' problem(s)':'scope OK');process.exit(bad?1:0);
