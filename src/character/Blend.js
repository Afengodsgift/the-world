// Blend: weight helpers for layering one-shot overlays (hit reactions, emotes, land) on top of the looping locomotion clips.
// three.js normalises animation weights, so an overlay of weight w over a base layer of total weight 1 shows up with a pose SHARE of w/(w+1).
// The old code gave overlays weights of 24..300 and let three fade them LINEARLY: the visible share then jumps 0 -> ~96% within the first
// ~4% of the fade and back within the last ~4%, which is the "pop" you see on hits and emotes. Instead we drive the SHARE with a smoothstep and
// convert it to the weight that produces exactly that share, so the blend is genuinely smooth.
const Blend=(()=>{
  const ease=x=>{x=x<0?0:x>1?1:x;return x*x*(3-2*x)};   // smoothstep 0..1
  const w=s=>{s=s>.997?.997:s;return s<=0?0:s/(1-s)};      // share -> weight (relative to a base layer of weight 1)
  return {ease,w};
})();
