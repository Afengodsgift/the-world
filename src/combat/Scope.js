// Scope: zoom levels per gun and the maths around them (pure; tests/scope.sim.js). Tap the scope button (or Z) to look down the sights: the camera zooms (FOV narrows by the zoom factor),
// look sensitivity drops with the zoom so aiming stays precise on a thumb, and the snipers (zoom >= 4) get a full scope view: first-person, black lens vignette, thin crosshair and a
// live range readout. Other guns just zoom in (ACOG / red-dot style) without the lens.
const Scope=(()=>{
  const ZOOM={'Hunting Rifle':5,'Marksman':6,'Magnum':2.5,'Assault Rifle':3,'AR-2':2.5,'Bullpup':2.5,'Revolver':1.6,'C96 Pistol':1.5,'Pistol':1.5,'SMG':1.6,'Tommy SMG':1.6,
    'Pump Shotgun':1.4,'Sawed-Off':1.3,'Combat Shotgun':1.4,'Minigun':1.4,'Rocket Launcher':2};
  const zoomOf=name=>ZOOM[name]||1.5,overlay=z=>z>=4;
  const fov=(base,z)=>z<=1?base:2*Math.atan(Math.tan(base*Math.PI/360)/z)*180/Math.PI;   // a real zoom: the visible tangent shrinks by z
  const lookK=z=>z<=1?1:1/Math.pow(z,.85);                                                 // look sensitivity while zoomed (6x -> ~0.22)
  const spreadK=z=>z>=4?.3:z>1?.6:1;                                                       // steadier aim down the sights
  return {zoomOf,overlay,fov,lookK,spreadK,ZOOM};
})();
