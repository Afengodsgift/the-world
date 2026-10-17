// Unit test for HudMode (src/ui/HudMode.js): which situations switch the minimal HUD on, and the class/reveal logic. Runs against fake globals (no browser).
const fs=require('fs'),path=require('path'),vm=require('vm');
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
function world(){
  const set=new Set(),cl={add:c=>set.add(c),remove:c=>set.delete(c),contains:c=>set.has(c),toggle:(c,f)=>f?set.add(c):set.delete(c)};
  const btn={className:'',textContent:'',title:'',handlers:{},addEventListener(t,f){this.handlers[t]=f}};
  const ctx={S:{flying:false},document:{body:{classList:cl,appendChild(){}},createElement:()=>btn},setTimeout:(f,ms)=>{ctx._timer=f;return 1},clearTimeout:()=>{ctx._timer=null},
    kart:{on:false},dash:{on:false},slalom:{on:false},race:{on:false},srun:{on:false},Soccer:{_s:{phase:'idle'}},Tag:{on:()=>false},WardenIsles:{inArena:()=>false}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','src/ui/HudMode.js'),'utf8')+';this.HudMode=HudMode;',ctx);
  return {ctx,set,btn,run:()=>ctx.HudMode.update()};
}
{const w=world();w.run();ok(w.set.has('hud-min')&&!w.set.has('hud-fly')&&!w.set.has('hud-act'),'walking around: the HUD is hidden by default (hud-min), no mode-specific classes');
 ok(w.btn.className==='dk dk-menu'&&w.btn.textContent==='☰','the ☰ button is created with the theme\'s .dk class')}
{const w=world();w.ctx.S.flying=true;w.run();ok(w.set.has('hud-fly')&&w.set.has('hud-min')&&!w.set.has('hud-act'),'flying -> hud-fly + hud-min');w.ctx.S.flying=false;w.run();ok(!w.set.has('hud-fly')&&w.set.has('hud-min'),'landing: back to the default (hidden HUD + ☰), hud-fly removed')}
for(const [name,on,off] of [['Kart',c=>c.kart.on=true,c=>c.kart.on=false],['Dash',c=>c.dash.on=true,c=>c.dash.on=false],['Slalom',c=>c.slalom.on=true,c=>c.slalom.on=false],['flight Race',c=>c.race.on=true,c=>c.race.on=false],['Shark Run',c=>c.srun.on=true,c=>c.srun.on=false],
  ['Soccer match',c=>c.Soccer._s.phase='play',c=>c.Soccer._s.phase='idle'],['Tag round',c=>c.Tag.on=()=>true,c=>c.Tag.on=()=>false],['Warden arena',c=>c.WardenIsles.inArena=()=>true,c=>c.WardenIsles.inArena=()=>false]]){
  const w=world();on(w.ctx);w.run();const a=w.set.has('hud-act')&&w.set.has('hud-min');off(w.ctx);w.run();ok(a&&!w.set.has('hud-act')&&w.set.has('hud-min'),name+': hud-act while running, removed when it ends (HUD stays hidden by default)')}
{const w=world();w.ctx.WRD={on:true};w.run();ok(!w.set.has('hud-act'),'WRD.on (the Warden feature switch) is NOT treated as an activity');}
{const w=world();w.set.add('ow-isle');w.run();ok(w.set.has('hud-min')&&!w.set.has('hud-act')&&!w.set.has('hud-fly'),'Outlaw Isle: minimal (ow-isle set by Outlaw.js)');w.set.delete('ow-isle');w.run();ok(w.set.has('hud-min'),'leaving Outlaw Isle: still hidden by default')}
{const w=world();w.run();w.btn.handlers.pointerdown({preventDefault(){}});ok(w.set.has('hud-reveal'),'walking: tapping ☰ reveals everything');w.ctx._timer&&w.ctx._timer();ok(!w.set.has('hud-reveal')&&w.set.has('hud-min'),'walking: ...and it hides again by itself')}
{const w=world();w.ctx.dash.on=true;w.run();w.btn.handlers.pointerdown({preventDefault(){}});ok(w.set.has('hud-reveal'),'tapping ☰ reveals everything');w.ctx._timer&&w.ctx._timer();ok(!w.set.has('hud-reveal'),'...and it hides again after the timeout');
}
{const w=world();w.ctx.dash.on=true;w.run();w.btn.handlers.pointerdown({preventDefault(){}});w.ctx.S.flying=true;w.run();ok(!w.set.has('hud-reveal')&&w.set.has('hud-fly'),'taking off cancels a reveal: flying is always clear')}
{const w=world();let called=0;w.ctx.HudMode.extra.push(()=>{called++;return true});w.run();ok(w.set.has('hud-act'),'HudMode.extra lets new activities register themselves');const w2=world();w2.ctx.HudMode.extra.push(()=>{throw new Error('x')});w2.run();ok(!w2.set.has('hud-act'),'a throwing extra check cannot break the HUD')}
{const w=world();delete w.ctx.kart;delete w.ctx.Soccer;delete w.ctx.Tag;delete w.ctx.WardenIsles;w.run();ok(!w.set.has('hud-act'),'missing activity modules do not throw')}
console.log(bad?bad+' FAIL':'hud mode checks passed');process.exit(bad?1:0);
