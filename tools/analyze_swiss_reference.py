# /// script
# requires-python = ">=3.14"
# dependencies = ["numpy>=2", "opencv-python-headless>=4.12", "scipy>=1.16"]
# ///
"""Measure the Zurich HB station clock photograph by JuergenG / Rainer Zenz.

uv run tools/analyze_swiss_reference.py .local/swiss-reference/zurich.jpg
Use the original 1100 x 1100 Commons image. Photo CC BY-SA 3.0; see
https://commons.wikimedia.org/wiki/File:BahnhofsuhrZuerich_RZ.jpg .
Optional analysis dependencies are isolated from the firmware build.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from scipy.optimize import least_squares

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('photo', type=Path)
parser.add_argument('--output', type=Path, default=Path('.local/swiss-reference/analysis'))
args = parser.parse_args()
photo = cv2.imread(str(args.photo))
if photo is None or photo.shape[:2] != (1100,1100):
    parser.error('Use the original 1100 x 1100 Wikimedia photograph.')
args.output.mkdir(parents=True, exist_ok=True)
gray = cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY)
_, labels, stats, centers = cv2.connectedComponentsWithStats((gray < 60).astype('uint8'))
markers=[]
for label,(x,y,w,h,area) in enumerate(stats[1:],1):
    center=centers[label]
    if not (280 < np.linalg.norm(center-[546,534]) < 430 and 80 < area < 6000):
        continue
    yy,xx=np.where(labels[y:y+h,x:x+w]==label)
    rect=cv2.minAreaRect(np.column_stack([xx+x,yy+y]).astype('float32'))
    if max(rect[1]) > 150:
        continue
    tick=round(np.degrees(np.arctan2(center[0]-546,534-center[1]))/6)%60
    markers.append((tick,int(tick%5==0),center,cv2.boxPoints(rect)))
if len(markers)!=59 or len({m[0] for m in markers})!=59:
    raise SystemExit('Expected 59 unique markers; inspect threshold and original file.')
angles=np.deg2rad([m[0]*6 for m in markers]);kinds=np.array([m[1] for m in markers]);observed=np.array([m[2] for m in markers])
def homography(v):
    return np.array([[*v[:3]],[*v[3:6]],[*v[6:8],1.]])
def residual(v):
    r=np.where(kinds,v[8],1.)
    ideal=np.column_stack([r*np.sin(angles),-r*np.cos(angles),np.ones(len(markers))])
    p=ideal@homography(v).T
    return (p[:,:2]/p[:,2:]-observed).ravel()
fit=least_squares(residual,[392,0,546,0,392,534,0,0,.91],loss='soft_l1',f_scale=1,max_nfev=5000)
error=float(np.median(np.linalg.norm(residual(fit.x).reshape(-1,2),axis=1)))
if not fit.success or error>2:
    raise SystemExit(f'Unreliable perspective fit: {error:.2f} photo pixels.')
inverse=np.linalg.inv(homography(fit.x));scale=147.5
measurements=[]
for tick,kind,center,box in markers:
    p=np.column_stack([box,np.ones(4)])@inverse.T;p=p[:,:2]/p[:,2:]
    a=np.deg2rad(tick*6);radial=p@[np.sin(a),-np.cos(a)];transverse=p@[np.cos(a),np.sin(a)]
    measurements.append(dict(tick=tick,kind=kind,width=float(np.ptp(transverse)),length=float(np.ptp(radial)),outer=float(max(radial))))
summary={}
for kind,name in enumerate(['minute','hour']):
    matches=[m for m in measurements if m['kind']==kind]
    summary[name]={key:round(float(np.median([m[key] for m in matches]))*scale,2) for key in ['width','length','outer']}
matrix=np.array([[scale,0,184],[0,scale,224],[0,0,1]])@inverse
rectified=cv2.warpPerspective(photo,matrix,(368,448),flags=cv2.INTER_AREA)
yy,xx=np.indices((448,368));rectified[(xx-184)**2+(yy-224)**2>183**2]=0
cv2.imwrite(str(args.output/'reference-rectified.png'),rectified)
# Preserve a high-resolution rectification for hand/maker-mark inspection.
high=np.array([[1475,0,1840],[0,1475,2240],[0,0,1]])@inverse
cv2.imwrite(str(args.output/'reference-rectified-10x.png'),cv2.warpPerspective(photo,high,(3680,4480)))
report=dict(marker_count=len(markers),median_fit_error_photo_px=error,homography=homography(fit.x).tolist(),screen_pixels_per_unit=scale,markers_screen_px=summary,individual_markers=measurements)
# These four corners are manually identified from the original photograph.
# Report them so hand measurements can be audited rather than inferred from a
# mixed connected component where the three hands overlap at the spindle.
landmarks={
    'hour': [[617,273],[658,288],[537,632],[489,616]],
    'minute': [[187,718],[203,745],[643,496],[623,461]],
}
hands={}
for name,points in landmarks.items():
    p=np.column_stack([points,np.ones(4)])@inverse.T
    p=p[:,:2]/p[:,2:]*scale
    tip=p[:2].mean(axis=0);tail=p[2:].mean(axis=0)
    hands[name]=dict(photo_corners=points,
        tip_midpoint_reach=round(float(np.linalg.norm(tip)),2),
        counterweight_midpoint_reach=round(float(np.linalg.norm(tail)),2),
        tip_width=round(float(np.linalg.norm(p[0]-p[1])),2),
        counterweight_width=round(float(np.linalg.norm(p[2]-p[3])),2))
# Red disc outline excludes its junction with the shaft on the right.
b,g,r=cv2.split(photo)
red=((r.astype(float)>g*1.4)&(r>80)&(r>b*1.4)).astype('uint8')
contours,_=cv2.findContours(red,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
disc=max(contours,key=cv2.contourArea).reshape(-1,2)
disc=disc[(disc[:,0]<321)&(disc[:,0]>240)&(disc[:,1]>540)&(disc[:,1]<640)]
p=np.column_stack([disc,np.ones(len(disc))])@inverse.T
p=p[:,:2]/p[:,2:]*scale
center,diameters,_=cv2.fitEllipse(p.astype('float32'))
hands['second']=dict(disc_center=list(center),disc_diameters=list(diameters),
    disc_center_reach=round(float(np.linalg.norm(center)),2))
report['hands_screen_px']=hands
# A perspective-corrected trace of the photographed maker mark. This is a
# derivative of the photograph, not an imported official vector logo. The SVG
# fragment and all reconstructed Swiss masters carry CC BY-SA 3.0 attribution.
high_photo=cv2.warpPerspective(photo,high,(3680,4480))
roi=cv2.cvtColor(high_photo[2730:3070,1600:2080],cv2.COLOR_BGR2GRAY)
contours,_=cv2.findContours((roi<140).astype('uint8'),cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)
paths=[]
for contour in contours:
    if cv2.contourArea(contour)<4:
        continue
    points=cv2.approxPolyDP(contour,.9,True).reshape(-1,2)/10+[160,273]
    paths.append('M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in points)+' Z')
(args.output/'maker-mark.svg').write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" width="368" height="448">\n'
    '<!-- JuergenG / Rainer Zenz, BahnhofsuhrZuerich_RZ.jpg; traced and rectified.\n'
    'CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0/ -->\n'
    '<path fill="#171719" fill-rule="evenodd" d="'+' '.join(paths)+'"/>\n</svg>\n')
(args.output/'measurements.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['homography','individual_markers']},indent=2))
