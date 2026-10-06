# Average colour of each material's base-colour texture in the GLB packs (dev tool: lets the node preview colour textured kit pieces without a browser).
import json,struct,io,sys,os
from PIL import Image
root=sys.argv[1]; out={}
for fn in sys.argv[2:]:
    b=open(os.path.join(root,fn),'rb').read(); jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); bin_=b[20+jl+8:]
    def img(i):
        im=j['images'][i]; 
        if 'bufferView' in im:
            bv=j['bufferViews'][im['bufferView']]; data=bin_[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]; return Image.open(io.BytesIO(data)).convert('RGBA')
        return Image.open(os.path.join(root,im['uri'])).convert('RGBA')
    m={}
    for mat in j.get('materials',[]):
        pbr=mat.get('pbrMetallicRoughness',{}); f=pbr.get('baseColorFactor',[1,1,1,1]); col=[f[0],f[1],f[2]]
        bt=pbr.get('baseColorTexture')
        if bt is not None:
            src=j['textures'][bt['index']]['source']; im=img(src); px=[p for p in im.getdata() if p[3]>128] or list(im.getdata())
            avg=[sum(p[k] for p in px)/len(px)/255 for k in range(3)]; col=[(avg[k]**2.2)*f[k] for k in range(3)]  # to linear
        out[mat.get('name','')]=col
    out_key=fn; 
    json.dump(out,open(os.path.join(root,'..','tools','preview','avg_'+fn+'.json'),'w'))
    print(fn,{k:[round(x,2) for x in v] for k,v in out.items()})
