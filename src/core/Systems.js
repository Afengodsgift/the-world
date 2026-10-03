// Systems: a tiny per-frame registry for NEW systems, running on its own requestAnimationFrame.
// Why not hook tick()? tick() is the hottest, most-edited function in index.html, and an
// exception inside it freezes the whole game. Each system here is try/caught individually, so a
// bug in (say) Verbs can never take down movement or rendering.
// Anything that must run BEFORE physics (Zones, later) will need one explicit hook in tick();
// everything else (verbs, events, home, journal) belongs here.
const Systems=(()=>{
  const list=[];let on=false,last=0;
  function loop(t){
    const dt=Math.min(.05,(t-last)/1000);last=t;
    for(const s of list){try{s.fn(dt,t)}catch(e){if(!s.err){s.err=1;console.error('[Systems] '+s.name+' crashed (disabled errors after first):',e)}}}
    requestAnimationFrame(loop);
  }
  function add(name,fn){list.push({name,fn,err:0});if(!on){on=true;last=performance.now();requestAnimationFrame(loop)}}
  return {add,names:()=>list.map(s=>s.name)};
})();
