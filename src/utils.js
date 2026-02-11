import { D } from "./data.js";

export function normalize(s){return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).toUpperCase().replace(/[\s　]+/g,"");}
export function getLabel(c,t,v){return D.lb[c]?.[t]?.[v]||v||"";}
export function hasBranch(c,s,t){return !!D.br[c]?.[s]?.[t];}
export function findCls(icd){const r=[];for(const[c,codes]of Object.entries(D.icd)){if(codes.includes(icd))r.push(c);}return r;}

export function cleanName(n){
  return n.replace(/（([^）])）/g,"$1").replace(/＜([^＞]+)＞/g,"");
}

export function getSevInfo(cls,dpc){
  const sv=D.sv?.[cls];if(!sv||!dpc||dpc.length!==14)return null;
  const p=dpc[13];if(p==="x"||p==="X")return null;
  return{name:sv.name||"",value:p,label:sv[p]||""};
}

export function getCondLabel(cls,dpc){
  if(!dpc||dpc.length<8)return"";
  const pos78=dpc.slice(6,8);
  if(pos78==="xx")return"";
  return D.pt?.[cls]?.[pos78]||"";
}

export function calcTotal(days,pts,sd){
  if(!sd||sd<=0)return null;
  const[d1,d2,d3]=days;const[p1,p2,p3]=pts;
  if(!d3||!p1)return null;
  let t=0;for(let d=1;d<=Math.min(sd,d3);d++){if(d<=d1)t+=(p1||0);else if(d<=d2)t+=(p2||0);else t+=(p3||0);}
  return{total:t,overDays:Math.max(0,sd-d3),d3};
}
export function totalVal(days,pts,sd){const r=calcTotal(days,pts,sd);return r?r.total:0;}

export function isDekidakaOp(kCode){return!!D.dk?.[kCode];}

export function searchDPC({icdCode,surgeryCode,procAnyCode,drugCode}){
  const results=[];
  let targetCls=null;
  if(icdCode){targetCls=findCls(icdCode);if(!targetCls.length)return[];}
  if(!icdCode&&!surgeryCode&&!procAnyCode&&!drugCode)return[];
  const anyProc=!!(surgeryCode||procAnyCode||drugCode);
  const cons={};
  if(surgeryCode){
    if(surgeryCode==="KKK0"){const all=targetCls||Object.keys(D.cls);for(const c of all){if(!cons[c])cons[c]={};cons[c].surg="99";}}
    else{for(const[c,si]of Object.entries(D.si)){if(targetCls&&!targetCls.includes(c))continue;for(const[corr,idx]of Object.entries(si)){if(D.sl[idx]?.includes(surgeryCode)){if(!cons[c])cons[c]={};cons[c].surg=corr;break;}}}}
  }
  if(procAnyCode){
    for(const[c,p1]of Object.entries(D.p1)){if(targetCls&&!targetCls.includes(c))continue;if(surgeryCode&&!cons[c])continue;for(const[corr,codes]of Object.entries(p1)){if(codes.includes(procAnyCode)){if(!cons[c])cons[c]={};if(!cons[c].p1)cons[c].p1=corr;break;}}}
    for(const[c,p2]of Object.entries(D.p2)){if(targetCls&&!targetCls.includes(c))continue;if(surgeryCode&&!cons[c])continue;for(const[corr,codes]of Object.entries(p2)){if(codes.includes(procAnyCode)){if(!cons[c])cons[c]={};if(!cons[c].p2)cons[c].p2=corr;break;}}}
  }
  if(drugCode){
    for(const[c,p2]of Object.entries(D.p2)){if(targetCls&&!targetCls.includes(c))continue;if(surgeryCode&&!cons[c])continue;for(const[corr,codes]of Object.entries(p2)){if(codes.includes(drugCode)){if(!cons[c])cons[c]={};cons[c].p2=corr;break;}}}
  }
  if(anyProc){const cls2=targetCls||Object.keys(cons);for(const c of cls2){if(!cons[c])cons[c]={};if(cons[c].p1===undefined)cons[c].p1="0";if(cons[c].p2===undefined)cons[c].p2="0";}}
  const sCls=targetCls||Object.keys(cons);if(!sCls.length)return[];
  for(const cls of sCls){
    const co=cons[cls]||{};
    if(surgeryCode&&surgeryCode!=="KKK0"&&co.surg===undefined)continue;
    for(const[dpc,info]of Object.entries(D.dpc)){
      if(info[0]!==cls.slice(0,2)||info[1]!==cls.slice(2))continue;
      if(co.surg!==undefined&&info[3]!==co.surg)continue;
      if(co.p1!==undefined&&info[4]!==co.p1)continue;
      if(co.p2!==undefined&&info[5]!==co.p2)continue;
      const dk=info[2]==="0"||info[2]===0;
      const sv=info[3];
      results.push({
        code:dpc,cls,clsName:D.cls[cls]||"",
        surgeryName:getLabel(cls,"o",sv),
        proc1Name:hasBranch(cls,sv,"1")?getLabel(cls,"1",info[4]):"-",
        proc2Name:hasBranch(cls,sv,"2")?getLabel(cls,"2",info[5]):"-",
        subdiagName:hasBranch(cls,sv,"s")?getLabel(cls,"s",info[6]):"-",
        surgVal:sv,p1Val:info[4],p2Val:info[5],sdVal:info[6],
        hasP1Branch:hasBranch(cls,sv,"1"),hasP2Branch:hasBranch(cls,sv,"2"),
        severity:getSevInfo(cls,dpc),
        condLabel:getCondLabel(cls,dpc),
        days:[info[7],info[8],info[9]],points:[info[10],info[11],info[12]],isDekidaka:dk
      });
    }
  }
  results.sort((a,b)=>(b.points[0]||0)-(a.points[0]||0));
  return results.slice(0,300);
}

export function searchDisease(q){if(!q||q.length<1)return[];const qn=normalize(q);const r=[];for(const[c,n]of Object.entries(D.icn)){if(n.includes(q)||normalize(n).includes(qn)||normalize(c).includes(qn)){r.push({code:c,name:cleanName(n)});if(r.length>=30)break;}}return r;}
export function searchSurg(q){if(!q||q.length<1)return[];const qn=normalize(q);const r=[],seen=new Set();for(const si of Object.values(D.si)){for(const idx of Object.values(si)){for(const kc of(D.sl[idx]||[])){if(!seen.has(kc)&&(normalize(kc).includes(qn)||normalize(D.cn[kc]||"").includes(qn))){const dk=isDekidakaOp(kc);r.push({code:kc,name:D.cn[kc]||"",dk});seen.add(kc);if(r.length>=20)return r;}}}}return r;}
export function searchProc(q){if(!q||q.length<1)return[];const qn=normalize(q);const r=[],seen=new Set();for(const grp of Object.values(D.p1)){for(const codes of Object.values(grp)){for(const c of codes){if(!seen.has(c)&&(normalize(c).includes(qn)||normalize(D.cn[c]||"").includes(qn))){r.push({code:c,name:D.cn[c]||"",tag:"処置1"});seen.add(c);if(r.length>=30)return r;}}}}for(const grp of Object.values(D.p2)){for(const codes of Object.values(grp)){for(const c of codes){if(!seen.has(c)&&(normalize(c).includes(qn)||normalize(D.cn[c]||"").includes(qn))){r.push({code:c,name:D.cn[c]||"",tag:"処置2"});seen.add(c);if(r.length>=30)return r;}}}}return r;}
export function searchDrug(q){if(!q||q.length<1)return[];const qn=normalize(q);const r=[],seen=new Set();for(const grp of Object.values(D.p2)){for(const codes of Object.values(grp)){for(const c of codes){if(seen.has(c)||!/^\d{4}$/.test(c))continue;const n=D.cn[c]||"";const al=D.da?.[c]||[];let m=normalize(n).includes(qn)||c.includes(qn);let ma="";if(!m){for(const a of al){if(normalize(a).includes(qn)){m=true;ma=a;break;}}}if(m){const dn=ma?`${n}（${ma}）`:(al.length>0?`${n}（${al[0]}）`:n);r.push({code:c,name:dn});seen.add(c);if(r.length>=20)return r;}}}}return r;}
