module.exports = async function contrast(page, scope = "body") {
 await page.locator(scope).evaluate(async root => {
  await Promise.all(root.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
 });
 return page.locator(scope).evaluate(root => {
  const rgba = s => {const m=s.match(/[\d.]+/g)?.map(Number);return m?.length>=3?[...m.slice(0,3),m[3]??1]:[0,0,0,0];};
  const over=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
  const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const out=[];
  for(const el of [root,...root.querySelectorAll("*")]) {
   if(!(/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)||[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))||!el.getClientRects().length||el.closest("svg,script,style,option,[hidden]"))continue;
   const style=getComputedStyle(el);
   if((el.tagName==="INPUT"&&["checkbox","radio","hidden","range","color"].includes(el.type))||style.visibility!=="visible"||el.closest(":disabled,[aria-disabled=true]")||Number(style.opacity)<.65)continue;
   let bg=[255,255,255],chain=[];
   for(let p=el;p;p=p.parentElement)chain.unshift(p);
   for(const p of chain) bg=over(rgba(getComputedStyle(p).backgroundColor),bg);
   let fg=rgba(style.color);fg[3]*=Number(style.opacity);
   const a=luminance(over(fg,bg)),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   const min=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700)?3:4.5;
   if(ratio+.01<min)out.push({tag:el.tagName,id:el.id,cls:el.className,text:(el.value||el.textContent).trim().slice(0,85),ratio:+ratio.toFixed(2),color:style.color,bg});
  }
  return out;
 });
};
