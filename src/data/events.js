// Tuning for the Event Director. Edit numbers here; src/world/Events.js has the machinery and
// src/world/events/*.js has one file per event type.
// Rhythm: time is cut into slots; each slot holds at most ONE event, which starts at a random moment
// in the first startMaxMs and lasts 4.5-5.5 min, so it always ends before the next slot begins
// (gap >= slotMs - startMaxMs - maxLife = 1.5 min) and two events are never live at once.
const EVENTS={
  slotMs:9*60000,
  chance:.6,                 // probability a slot has an event (about one every 15 min while playing)
  startMaxMs:2*60000,
  noticeR:550,               // how close you must get to "notice" it (banner + map pin, shared with your partner)
  aftermathSlots:12,         // craters etc. from this many past slots are rebuilt on load (~1.8 h of "evidence")
  types:{
    meteor:  {w:40,life:[4.5,5.5],icon:'☄️',name:'Falling stars',    notice:'Streaks of light are falling nearby… fragments might be glowing on the ground'},
    visitor: {w:35,life:[5,5.5],  icon:'🏮',name:'Wandering visitor',notice:'A lantern glows in the distance. Someone is out there…'},
    rings:   {w:25,life:[5,5.5],  icon:'💫',name:'Golden rings',     notice:'Golden rings have appeared in the sky. Fly through them all, in order, against the clock!'}
  }
};
