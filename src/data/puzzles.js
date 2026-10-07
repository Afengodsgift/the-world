// Data for Vaults (two-player puzzle sites). Edit here to retune; Vaults.js has the machinery.
const VAULT={
  perIsland:1, main:1, skip:['Outlaw Isle','Stadium Isle'],
  clear:9,                       // footprint kept free of trees/other sites
  sep:70,                        // metres from any other site
  plates:{gap:11,r:1.8,holdMs:1500},   // two plates 2*gap apart: you cannot do this alone
  shrine:{windowMs:1500,r:3.2}         // both call at the same moment ("on three!")
};
const VLOOT=[
  {id:'crown',n:'a tarnished crown',ic:'👑',w:30},{id:'compass',n:'a golden compass',ic:'🧭',w:30},
  {id:'starmap',n:'a faded star map',ic:'🗺️',w:20},{id:'locket',n:'a silver locket',ic:'📿',w:15},
  {id:'tidestone',n:'a glowing tidestone',ic:'🔮',w:5,rare:1}
];
