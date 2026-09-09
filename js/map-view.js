const MAP_MIN_SCALE=1;
const MAP_MAX_SCALE=3;
const mapView={scale:1,x:0,y:0};
const mapPointers=new Map();
let mapGesture=null;
let mapGestureMoved=false;
let suppressMapClick=false;
function clampMapView(){
  const wrap=document.querySelector('.map-page-shell .map-wrap');if(!wrap)return;
  const width=wrap.clientWidth;const height=wrap.clientHeight;
  mapView.x=Math.min(0,Math.max(width*(1-mapView.scale),mapView.x));
  mapView.y=Math.min(0,Math.max(height*(1-mapView.scale),mapView.y));
}
function applyMapView(){
  const map=document.getElementById('festivalMap');if(!map)return;
  clampMapView();
  map.style.transform=`translate(${mapView.x}px,${mapView.y}px) scale(${mapView.scale})`;
  const zoomIn=document.getElementById('mapZoomIn');if(zoomIn)zoomIn.disabled=mapView.scale>=MAP_MAX_SCALE-.01;
  const zoomOut=document.getElementById('mapZoomOut');if(zoomOut)zoomOut.disabled=mapView.scale<=MAP_MIN_SCALE+.01;
}
function setMapScale(nextScale,centerX,centerY){
  const wrap=document.querySelector('.map-page-shell .map-wrap');if(!wrap)return;
  const rect=wrap.getBoundingClientRect();
  const cx=centerX??rect.width/2;const cy=centerY??rect.height/2;
  const next=Math.min(MAP_MAX_SCALE,Math.max(MAP_MIN_SCALE,nextScale));
  const contentX=(cx-mapView.x)/mapView.scale;const contentY=(cy-mapView.y)/mapView.scale;
  mapView.scale=next;mapView.x=cx-contentX*next;mapView.y=cy-contentY*next;
  applyMapView();
}
function zoomMap(direction){setMapScale(mapView.scale+(direction>0?.35:-.35))}
function resetMapView(){
  mapView.scale=1;mapView.x=0;mapView.y=0;applyMapView();
  clearMapSelection();clearMapSearch();setFilter('전체',document.querySelector('#filters .filter'));showToast('행사장 전체 위치로 돌아왔습니다.')
}
function startMapGesture(){
  const points=[...mapPointers.values()];
  if(points.length>=2){
    const [a,b]=points;const rect=document.querySelector('.map-page-shell .map-wrap').getBoundingClientRect();
    const cx=(a.x+b.x)/2-rect.left;const cy=(a.y+b.y)/2-rect.top;
    mapGesture={type:'pinch',distance:Math.hypot(b.x-a.x,b.y-a.y),scale:mapView.scale,contentX:(cx-mapView.x)/mapView.scale,contentY:(cy-mapView.y)/mapView.scale};
  }else if(points.length===1){
    mapGesture={type:'pan',startX:points[0].x,startY:points[0].y,x:mapView.x,y:mapView.y};
  }else mapGesture=null;
}
function setupMapGestures(){
  const wrap=document.querySelector('.map-page-shell .map-wrap');if(!wrap)return;
  wrap.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    suppressMapClick=false;
    mapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(mapPointers.size===1)mapGestureMoved=false;
    startMapGesture();
    if(mapPointers.size>=2){
      mapPointers.forEach((_,pointerId)=>{try{wrap.setPointerCapture(pointerId)}catch(e){}});
      wrap.classList.add('is-dragging');
    }
  });
  wrap.addEventListener('pointermove',event=>{
    if(!mapPointers.has(event.pointerId))return;
    mapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const points=[...mapPointers.values()];if(!mapGesture)return;
    if(points.length>=2&&mapGesture.type==='pinch'){
      const [a,b]=points;const distance=Math.hypot(b.x-a.x,b.y-a.y);const cx=(a.x+b.x)/2-wrap.getBoundingClientRect().left;const cy=(a.y+b.y)/2-wrap.getBoundingClientRect().top;
      mapView.scale=Math.min(MAP_MAX_SCALE,Math.max(MAP_MIN_SCALE,mapGesture.scale*distance/Math.max(1,mapGesture.distance)));
      mapView.x=cx-mapGesture.contentX*mapView.scale;mapView.y=cy-mapGesture.contentY*mapView.scale;
      mapGestureMoved=true;applyMapView();
    }else if(points.length===1&&mapGesture.type==='pan'&&mapView.scale>MAP_MIN_SCALE){
      const dx=points[0].x-mapGesture.startX;const dy=points[0].y-mapGesture.startY;
      if(!mapGestureMoved&&Math.abs(dx)+Math.abs(dy)>4){
        mapGestureMoved=true;wrap.setPointerCapture(event.pointerId);wrap.classList.add('is-dragging');
      }
      if(!mapGestureMoved)return;
      mapView.x=mapGesture.x+dx;mapView.y=mapGesture.y+dy;applyMapView();
    }
  });
  const endPointer=event=>{
    mapPointers.delete(event.pointerId);
    if(!mapPointers.size){
      wrap.classList.remove('is-dragging');
      if(mapGestureMoved)suppressMapClick=true;
    }
    startMapGesture();
  };
  window.addEventListener('pointerup',endPointer);window.addEventListener('pointercancel',endPointer);
  wrap.addEventListener('click',event=>{if(suppressMapClick){suppressMapClick=false;event.preventDefault();event.stopPropagation()}},true);
  wrap.addEventListener('wheel',event=>{
    event.preventDefault();const rect=wrap.getBoundingClientRect();
    setMapScale(mapView.scale+(event.deltaY<0?.25:-.25),event.clientX-rect.left,event.clientY-rect.top);
  },{passive:false});
  window.addEventListener('resize',applyMapView);
  applyMapView();
}
function showCurrentLocation(){showToast('실서비스에서는 GPS로 현재 위치를 지도에 표시합니다.')}
