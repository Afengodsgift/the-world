# render.py: runs raster.c for a set of named camera views and saves PNGs (2x supersampled).  usage: python3 render.py tris.bin outdir [view ...]
import subprocess,sys,os,math
from PIL import Image
tris,outdir=sys.argv[1],sys.argv[2];os.makedirs(outdir,exist_ok=True)
SKY=(-1900,430,2350); W,H=900,620
VIEWS={ # name: (cam, target, fov)  (offsets are relative to the island centre; hub cottage at +46,-18)
 'side':((SKY[0]+520,SKY[1]+45,SKY[2]+380),(SKY[0],SKY[1]-45,SKY[2]),42),
 'top':((SKY[0]+0.1,SKY[1]+640,SKY[2]),(SKY[0],SKY[1],SKY[2]),42),
 'high':((SKY[0]-330,SKY[1]+260,SKY[2]+380),(SKY[0]+10,SKY[1]-10,SKY[2]),50),
 'village':((SKY[0]+46+10,SKY[1]+30,SKY[2]+60),(SKY[0]+46,SKY[1]+3,SKY[2]),55),
 'cottage':((SKY[0]+46+20,SKY[1]+9,SKY[2]-18+32),(SKY[0]+46,SKY[1]+3,SKY[2]-18),52),
 'bridge':((SKY[0]+190,SKY[1]+16,SKY[2]+60),(SKY[0]+260,SKY[1]-2,SKY[2]+120),58),
 'interior':((SKY[0]+46+1,SKY[1]+12.5,SKY[2]-18+13),(SKY[0]+46,SKY[1]+0.5,SKY[2]-18-1),58),
 'interior2':((SKY[0]+46-7,SKY[1]+6.5,SKY[2]-18+8.5),(SKY[0]+46+1.5,SKY[1]+0.8,SKY[2]-18-2),70),
 'ground':((SKY[0]+10,SKY[1]+3,SKY[2]+60),(SKY[0]+46,SKY[1]+6,SKY[2]-15),70),
}
night=len(sys.argv)>3 and sys.argv[3]=='night'
names=[v for v in sys.argv[3:] if v in VIEWS] or list(VIEWS)
for n in names:
    cam,tg,fov=VIEWS[n]; p=os.path.join(outdir,n+'.ppm')
    args=['/tmp/raster',tris,p,str(W*2),str(H*2)]+[str(x) for x in cam+tg]+[str(fov),'0.5','0.62','0.32','1.0','0.81','0.89','0.95']
    subprocess.run(args,check=True); im=Image.open(p).resize((W,H),Image.LANCZOS); im.save(os.path.join(outdir,n+'.png')); os.remove(p)
print('rendered',names)
