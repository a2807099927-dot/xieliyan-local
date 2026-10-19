// 底部输出面板：按设计稿四页签展示真实日志，不生成模拟数据。
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useOutputLogStore, type OutputLogLevel } from '../../store/useOutputLogStore';
import { ChronoIcon } from '../common/ChronoIcon';

type LogFilter = 'ai' | 'find' | 'inspiration' | 'output';
const LEVEL_CLASS: Record<OutputLogLevel, string> = { ok:'wz-ide-bp-ok', warn:'wz-ide-bp-warn', err:'wz-ide-bp-err', info:'wz-ide-bp-info' };
function formatTime(time:number){ const d=new Date(time); const p=(v:number)=>String(v).padStart(2,'0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function matches(filter:LogFilter, tag:string, message:string){
 const text=`${tag} ${message}`.toLowerCase();
 if(filter==='output') return true;
 if(filter==='find') return /find|search|查找|搜索|检索/.test(text);
 if(filter==='inspiration') return /idea|inspiration|灵感|创意|推演/.test(text);
 return /ai|agent|continuation|memory|extract|review|续写|润色|模型|生成/.test(text);
}
export function BottomPanel(){
 const logs=useOutputLogStore(s=>s.logs); const clearLogs=useOutputLogStore(s=>s.clear);
 const [collapsed,setCollapsed]=useState(false); const [filter,setFilter]=useState<LogFilter>('ai');
 const visible=useMemo(()=>logs.filter(x=>matches(filter,x.tag,x.message)).slice().reverse(),[logs,filter]);
 const tabs:Array<{key:LogFilter;label:string}>=[{key:'ai',label:'AI 日志'},{key:'find',label:'查找替换'},{key:'inspiration',label:'灵感搜索'},{key:'output',label:'输出'}];
 return <div className="wz-ide-bottom-panel">
  <div className="wz-ide-bp-bar">
   {tabs.map(tab=><button key={tab.key} type="button" className={clsx('wz-ide-bp-tab',filter===tab.key&&'is-active')} onClick={()=>{setFilter(tab.key);setCollapsed(false);}}>{tab.label}{filter===tab.key&&visible.length>0?<span className="wz-ide-bp-n">{visible.length}</span>:null}</button>)}
   <span className="wz-st-spacer" />
   <button type="button" className="wz-ide-icon-btn" onClick={clearLogs} title="清空" disabled={!logs.length}><ChronoIcon name="x-close" size={13}/></button>
   <button type="button" className="wz-ide-icon-btn" onClick={()=>setCollapsed(v=>!v)} title="折叠/展开"><ChronoIcon name={collapsed?'chevron-right':'chevron-down'} size={13}/></button>
  </div>
  <div className={clsx('wz-ide-bp-body',collapsed&&'is-collapsed')}>
   {!visible.length?<div className="wz-ide-bp-line"><span className="wz-ide-bp-time">--:--:--</span><span className="wz-ide-bp-info">[idle]</span><span>暂无记录</span></div>:visible.map(item=><div key={item.id} className="wz-ide-bp-line"><span className="wz-ide-bp-time">{formatTime(item.time)}</span><span className={LEVEL_CLASS[item.level]}>[{item.tag}]</span><span>{item.message}</span></div>)}
  </div>
 </div>;
}
