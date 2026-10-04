// Net: one namespaced channel for ALL new systems.
// Legacy activities keep their own hardcoded events (rs, ks, hs, ...) untouched; anything
// new registers a handler here instead of adding another chan.on() line in enter().
//   Net.on('ws', (data, fromId) => ...)   Net.emit('ws', {k, v})
// Wire format: one broadcast event 'x' carrying {t: type, d: data, f: senderId}.
// attach() must run BEFORE chan.subscribe(), i.e. right after the channel is created.
const Net=(()=>{
  let chan=null;const handlers=new Map();
  function attach(c){
    chan=c;
    c.on('broadcast',{event:'x'},({payload})=>{
      if(!payload||!payload.t)return;
      const fns=handlers.get(payload.t);if(!fns)return;
      for(const f of fns){try{f(payload.d,payload.f)}catch(e){console.error('Net handler',payload.t,e)}}
    });
  }
  function on(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn)}
  function emit(type,data){
    if(!chan)return false;
    try{chan.send({type:'broadcast',event:'x',payload:{t:type,d:data,f:typeof myId!=='undefined'?myId:null}});return true}catch(e){return false}
  }
  return {attach,on,emit,ready:()=>!!chan};
})();
