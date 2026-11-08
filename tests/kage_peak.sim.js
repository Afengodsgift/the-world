// KAGE PEAK: harder (tighter rests, new chains, quicker cooldowns, faster body) and every chain is named on screen; the camera moments never lock the controls
const fs=require('fs');let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const ai=fs.readFileSync('src/combat/DuelistAI.js','utf8'),pc=fs.readFileSync('src/combat/PlayerCombat.js','utf8'),fo=fs.readFileSync('src/combat/Foes.js','utf8');
const vm=require('vm'),cx={console,Math};vm.createContext(cx);vm.runInContext(fs.readFileSync('src/combat/Moves.js','utf8')+';this.Moves=Moves',cx);const Moves=cx.Moves;
ok(/samurai:\{rest:\.6,breath:\.42\}/.test(ai),'Kage rests and breathes less between attacks');
ok(/samurai:\{name:'Kage[^}]*spd:2\.2/.test(fo),'Kage moves faster');
for(const nm of['kagefury','demonwheel']){const m=new RegExp(nm+":\\{q:\\[([^\\]]*)\\]").exec(ai);ok(m,nm+' chain exists');const q=m[1].replace(/'/g,'').split(',');ok(q.length>=4&&q.every(id=>Moves[id]&&Moves[id].who==='D'),nm+' chains real foe moves ('+q+')')}
const seqs=/SEQS=\{samurai:\[([^\]]*)\]/.exec(ai)[1].replace(/'/g,'').split(',');
const names=/KAGECH=\{([^}]*)\}/.exec(pc)[1];
for(const sq of seqs)if(!['crimson','waltz'].includes(sq))ok(new RegExp(sq+":'").test(names),sq+' has an on-screen name');
ok(/for\(const e of EXTRA\.samurai\)e\.cd=Math\.round\(e\.cd\*\.75\)/.test(ai),'Kage move cooldowns are 25% shorter');
ok(/function kageAura/.test(pc)&&/try\{kageAura\(dt\)\}/.test(pc),'demon aura is drawn each frame');
ok(!/CineCam\.play\('(kage|demon)/.test(pc),'in-fight Kage moments are camera punches, never a control-locking cinematic');
console.log('ok '+n+' checks');
