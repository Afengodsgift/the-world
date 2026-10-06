// Tiny software rasteriser for previewing three.js scenes without a browser (dev tool).
// usage: raster tris.bin out.ppm W H  camx camy camz  tx ty tz  fovDeg  [sunx suny sunz]
// tris.bin: float32 records of 14: x0 y0 z0 x1 y1 z1 x2 y2 z2  r g b  alpha  flags(1=double sided)
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
typedef struct{float v[9],r,g,b,a,f;}Tri;
static float *Z;static unsigned char *C;static int W,H;
static void shade(Tri*t,float*L,float cam[3],float bg[3],float*out){}
int main(int ac,char**av){
  if(ac<13){fprintf(stderr,"args\n");return 1;}
  FILE*f=fopen(av[1],"rb");fseek(f,0,SEEK_END);long n=ftell(f)/sizeof(Tri);fseek(f,0,SEEK_SET);Tri*T=malloc(n*sizeof(Tri));fread(T,sizeof(Tri),n,f);fclose(f);
  W=atoi(av[3]);H=atoi(av[4]);float cam[3]={atof(av[5]),atof(av[6]),atof(av[7])},tg[3]={atof(av[8]),atof(av[9]),atof(av[10])},fov=atof(av[11])*M_PI/180;
  float L[3]={.5,.62,.32};if(ac>=15){L[0]=atof(av[12]);L[1]=atof(av[13]);L[2]=atof(av[14]);}
  {float l=sqrtf(L[0]*L[0]+L[1]*L[1]+L[2]*L[2]);for(int i=0;i<3;i++)L[i]/=l;}
  float amb=ac>=16?atof(av[15]):1.f; // brightness multiplier (night = small)
  float bgc[3]={ac>=19?atof(av[16]):.81f,ac>=19?atof(av[17]):.89f,ac>=19?atof(av[18]):.95f};
  Z=malloc(W*H*sizeof(float));C=malloc(W*H*3);for(int i=0;i<W*H;i++){Z[i]=1e30f;float y=(float)(i/W)/H;C[i*3]=(unsigned char)(255*(bgc[0]*(.78+.22*(1-y))*0+bgc[0]*(1-y*.0)));C[i*3+1]=(unsigned char)(255*bgc[1]);C[i*3+2]=(unsigned char)(255*bgc[2]);
    float k=1.f-(float)(i/W)/H*.55f; C[i*3]=(unsigned char)(255*(bgc[0]*.55f+.45f*bgc[0]*k));C[i*3+1]=(unsigned char)(255*(bgc[1]*.7f+.3f*bgc[1]*k));C[i*3+2]=(unsigned char)(255*fminf(1.f,bgc[2]*(.85f+.15f*k)));}
  // camera basis
  float fw[3]={tg[0]-cam[0],tg[1]-cam[1],tg[2]-cam[2]};float fl=sqrtf(fw[0]*fw[0]+fw[1]*fw[1]+fw[2]*fw[2]);for(int i=0;i<3;i++)fw[i]/=fl;
  float up0[3]={0,1,0};float rt[3]={fw[1]*up0[2]-fw[2]*up0[1],fw[2]*up0[0]-fw[0]*up0[2],fw[0]*up0[1]-fw[1]*up0[0]};float rl=sqrtf(rt[0]*rt[0]+rt[1]*rt[1]+rt[2]*rt[2]);for(int i=0;i<3;i++)rt[i]/=rl;
  float up[3]={rt[1]*fw[2]-rt[2]*fw[1],rt[2]*fw[0]-rt[0]*fw[2],rt[0]*fw[1]-rt[1]*fw[0]};
  float fy=1.f/tanf(fov/2),fx=fy*H/W;
  for(int pass=0;pass<2;pass++){
   for(long ti=0;ti<n;ti++){Tri*t=&T[ti];int alphaTri=t->a<.99f;if(alphaTri!=pass)continue;
    float sx[3],sy[3],sz[3];int bad=0;
    for(int k=0;k<3;k++){float d[3]={t->v[k*3]-cam[0],t->v[k*3+1]-cam[1],t->v[k*3+2]-cam[2]};
      float x=d[0]*rt[0]+d[1]*rt[1]+d[2]*rt[2],y=d[0]*up[0]+d[1]*up[1]+d[2]*up[2],z=d[0]*fw[0]+d[1]*fw[1]+d[2]*fw[2];
      if(z<.3f){bad=1;break;}sx[k]=(x*fx/z*.5f+.5f)*W;sy[k]=(.5f-y*fy/z*.5f)*H;sz[k]=z;}
    if(bad)continue;
    float area=(sx[1]-sx[0])*(sy[2]-sy[0])-(sx[2]-sx[0])*(sy[1]-sy[0]); // screen y is down: front faces (CCW in three) have negative area here
    int dbl=((int)t->f)&1;if(!dbl&&area>=0)continue;if(fabsf(area)<1e-6f)continue;
    // world normal
    float e1[3]={t->v[3]-t->v[0],t->v[4]-t->v[1],t->v[5]-t->v[2]},e2[3]={t->v[6]-t->v[0],t->v[7]-t->v[1],t->v[8]-t->v[2]};
    float nx=e1[1]*e2[2]-e1[2]*e2[1],ny=e1[2]*e2[0]-e1[0]*e2[2],nz=e1[0]*e2[1]-e1[1]*e2[0];float nl=sqrtf(nx*nx+ny*ny+nz*nz)+1e-12f;nx/=nl;ny/=nl;nz/=nl;
    if(dbl&&area>0){nx=-nx;ny=-ny;nz=-nz;}
    float dif=fmaxf(0,nx*L[0]+ny*L[1]+nz*L[2]);float li=(.42f+.2f*ny)+.78f*dif;li*=amb;
    float dist=(sz[0]+sz[1]+sz[2])/3;float fog=fminf(1.f,fmaxf(0.f,(dist-300.f)/2200.f))*.85f;
    float cr=t->r*li,cg=t->g*li,cb=t->b*li;cr=cr*(1-fog)+bgc[0]*fog;cg=cg*(1-fog)+bgc[1]*fog;cb=cb*(1-fog)+bgc[2]*fog;
    int minx=(int)fmaxf(0,floorf(fminf(sx[0],fminf(sx[1],sx[2])))),maxx=(int)fminf(W-1,ceilf(fmaxf(sx[0],fmaxf(sx[1],sx[2]))));
    int miny=(int)fmaxf(0,floorf(fminf(sy[0],fminf(sy[1],sy[2])))),maxy=(int)fminf(H-1,ceilf(fmaxf(sy[0],fmaxf(sy[1],sy[2]))));
    for(int y=miny;y<=maxy;y++)for(int x=minx;x<=maxx;x++){float px=x+.5f,py=y+.5f;
      float w0=((sx[1]-px)*(sy[2]-py)-(sx[2]-px)*(sy[1]-py))/area,w1=((sx[2]-px)*(sy[0]-py)-(sx[0]-px)*(sy[2]-py))/area,w2=1-w0-w1;
      if(w0<-1e-4f||w1<-1e-4f||w2<-1e-4f)continue;float z=w0*sz[0]+w1*sz[1]+w2*sz[2];int i=y*W+x;if(z>=Z[i])continue;
      if(alphaTri){float a=t->a;C[i*3]=(unsigned char)fminf(255,C[i*3]*(1-a)+255*cr*a);C[i*3+1]=(unsigned char)fminf(255,C[i*3+1]*(1-a)+255*cg*a);C[i*3+2]=(unsigned char)fminf(255,C[i*3+2]*(1-a)+255*cb*a);}
      else{Z[i]=z;C[i*3]=(unsigned char)fminf(255,255*cr);C[i*3+1]=(unsigned char)fminf(255,255*cg);C[i*3+2]=(unsigned char)fminf(255,255*cb);}}
   }}
  FILE*o=fopen(av[2],"wb");fprintf(o,"P6\n%d %d\n255\n",W,H);fwrite(C,1,W*H*3,o);fclose(o);return 0;}
