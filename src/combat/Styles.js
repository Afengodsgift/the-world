// WARDEN: fighting STYLES - what kind of fighter you are, chosen at the Ember Shrine (Style tab). A style is a small, readable layer on top of your weapon and upgrades (pure data + tiny helpers, no THREE/DOM).
// Co-op: each player picks their own; the partner's pick is shown to you ("Partner: Iron Wall") and the part that matters to the other player's fight (the taunt) is shared over the net.
//   ginga  - the flow dancer: balanced; Flow builds faster so the capoeira finishers come more often.
//   wall   - the guardian: more health and stamina, a wider deflect window, posture-crushing; foes in co-op prefer to hit you (taunt) and the Afterimage is slower.
//   shade  - the assassin: less health, more damage, backstabs hit harder; the Afterimage recharges twice as fast and lasts longer; foes prefer your partner.
// Duels (PvP) ignore styles so they stay fair.
const WardenStyle=(()=>{
  const LIST={
    ginga:{n:'Ginga',tag:'Flow dancer',icon:'💃',d:'Balanced. Flow builds 15% faster, so the Ginga finishers come more often.',hp:1,st:1,dm:1,pm:1,sm:1,dfl:0,flow:1.15,shCd:1,shLife:4.5,back:0,taunt:0},
    wall:{n:'Iron Wall',tag:'Guardian',icon:'🛡️',d:'+25% health, +10% stamina, wider deflect window, crushes posture. Foes prefer to hit you in co-op. Afterimage recharges slower.',hp:1.25,st:1.1,dm:.9,pm:1.25,sm:1,dfl:4,flow:1,shCd:1.6,shLife:3.5,back:0,taunt:3},
    shade:{n:'Shadow Edge',tag:'Assassin',icon:'🗡️',d:'-15% health, +15% damage, backstabs hit 35% harder. Afterimage recharges twice as fast and lasts longer. Foes prefer your partner.',hp:.85,st:1,dm:1.15,pm:1,sm:.9,dfl:0,flow:1,shCd:.5,shLife:6,back:.35,taunt:-1.5}};
  const IDS=Object.keys(LIST),DEFAULT='ginga';
  const get=id=>LIST[id]||LIST[DEFAULT];
  const valid=id=>typeof id==='string'&&!!LIST[id];
  // gear stats (WardenGear.stats()) x style -> what the fighter actually gets
  function mix(w,id){const s=get(id);return{hp:w.hp*s.hp,dm:w.dm*s.dm,pm:w.pm*s.pm,sm:w.sm*s.sm,dfl:w.dfl+s.dfl,flow:w.flow*s.flow}}
  // how many metres "closer" a player counts as when foes pick a target (+ = foes are drawn to this player)
  const taunt=id=>get(id).taunt;
  return{LIST,IDS,DEFAULT,get,valid,mix,taunt}})();
if(typeof module!=='undefined')module.exports=WardenStyle;
