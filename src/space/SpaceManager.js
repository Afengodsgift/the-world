// Space: the vertical universe above the world. This module owns *where you are in the sky* and how the frame is rendered up there.
// There are no zones and no events: everything is a smooth function of altitude (Space.f.*, each 0..1), and other systems read those
// factors (Environment for sky/fog/clouds/weather, Ambience for sound, CameraRig for framing). Nothing here is networked: the sky is
// derived locally from the player's altitude, so both players always see the same transition.
//
//   above   900 m -> 3 km    you are over the clouds (near clouds hand over to the world-fixed cloud deck)
//   weather 750 m -> 1.3 km  rain/storm are below you  (1 = in the weather, 0 = above it)
//   thin    0.9 km -> 20 km  haze thins out, the world is visible through clear air
//   deep    1.5 km -> 20 km  blue deepens (cloud layer, then high altitude)
//   dark    30 km -> 100 km  upper atmosphere: violet haze, then black
//   stars   14 km -> 100 km  stars fade in very gradually
//   space   40 km -> 110 km  ambience hands over to silence + the space drone
//   quiet   3 km -> 45 km    world sound fades out (wind peaks on the way)
//
// Rendering: above ~900 m a single depth buffer cannot cover both "the avatar 9 m away" and "the world 20 km below" (the islands shimmer and
// stripe), so the frame is drawn in two depth slices: far (everything beyond the partition) then near (depth cleared, colour kept).
const Space=(()=>{
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  const f={alt:0,above:0,weather:1,thin:0,deep:0,dark:0,stars:0,space:0,quiet:0};
  const BASE_NEAR=.1,BASE_FAR=4200,SPLIT_FROM=900;
  function profile(y,o){o=o||f;y=Math.max(0,y);o.alt=y;
    o.above=sm(900,3000,y);o.weather=1-sm(750,1300,y);o.thin=sm(900,20000,y);o.deep=sm(1500,20000,y);o.dark=sm(30000,100000,y);o.stars=sm(14000,100000,y);o.space=sm(40000,110000,y);o.quiet=sm(3000,45000,y);return o}
  function update(dt,t){profile(S.y)}
  // the two depth slices for an altitude (also used by the tests)
  function slices(y){const part=Math.min(2400,Math.max(150,y*.03));return {part,farNear:part*.9,farFar:400000,nearNear:BASE_NEAR,nearFar:part}}
  function render(renderer,scene,camera){
    const y=camera.position.y;
    if(y<SPLIT_FROM){if(camera.near!==BASE_NEAR||camera.far!==BASE_FAR){camera.near=BASE_NEAR;camera.far=BASE_FAR;camera.updateProjectionMatrix()}renderer.render(scene,camera);return}
    const s=slices(y);
    camera.near=s.farNear;camera.far=s.farFar;camera.updateProjectionMatrix();renderer.render(scene,camera);                 // far slice (world, sea, cloud deck, sky)
    // a colour scene.background makes three.js force-clear the colour buffer, which would wipe the far pass: drop it for the near pass
    const ac=renderer.autoClear,su=renderer.shadowMap.autoUpdate,bg=scene.background;renderer.autoClear=false;renderer.shadowMap.autoUpdate=false;scene.background=null;renderer.clearDepth();
    camera.near=s.nearNear;camera.far=s.nearFar;camera.updateProjectionMatrix();renderer.render(scene,camera);                 // near slice (avatars, effects)
    renderer.autoClear=ac;renderer.shadowMap.autoUpdate=su;scene.background=bg;
    camera.near=BASE_NEAR;camera.far=BASE_FAR;camera.updateProjectionMatrix()}
  return {f,profile,update,render,slices};
})();
if(typeof module!=='undefined')module.exports=Space;
