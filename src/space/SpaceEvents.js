// SpaceEvents: how space talks to the rest of the game. Space objects never touch Supabase or Net directly; they call this.
//   discover(id, info) : first time the PAIR finds something. Writes one shared Journal entry (WS.log is idempotent per kind+key and converges
//                        between both phones) and adds it to the persistent 'space' set. Returns true only for the very first discovery.
//   isFound(id)        : has either of you found it (survives reloads: it lives in WorldState)
//   onPartnerFound(fn) : your partner found something (WorldState delivers it live, or on reconnect)
//   on/emit(type, d)   : live messages between the two players for things that are not discoveries yet (later: two-player interactions);
//                        namespaced 'sp:<type>' on the existing Net channel
// Everything visual (sky, stars, object animation) is local; only discoveries and interactions are shared.
const SpaceEvents=(()=>{
  const found=new Set(),partnerFns=[];
  const hasWS=()=>typeof WS!=='undefined'&&WS;
  function isFound(id){return found.has(id)||(hasWS()&&WS.hasInSet('space',id))}
  function discover(id,info){
    const had=isFound(id);found.add(id);
    if(had)return false;
    try{if(hasWS()){WS.addToSet('space',id);WS.log('space',id,info||{})}}catch(e){}
    emit('found',{id});return true}
  function onPartnerFound(fn){partnerFns.push(fn)}
  function on(type,fn){if(typeof Net!=='undefined')Net.on('sp:'+type,fn)}
  function emit(type,d){return typeof Net!=='undefined'&&Net.emit('sp:'+type,d)}
  function init(){
    if(!hasWS())return;
    WS.onChange((k,v,fromRemote)=>{if(k!=='space'||!Array.isArray(v))return;
      for(const id of v)if(!found.has(id)){found.add(id);if(fromRemote)for(const f of partnerFns){try{f(id)}catch(e){console.error(e)}}}})}
  return {discover,isFound,onPartnerFound,on,emit,init};
})();
if(typeof module!=='undefined')module.exports=SpaceEvents;
