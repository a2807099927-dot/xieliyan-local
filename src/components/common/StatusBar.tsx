// 全局状态栏：按设计稿结构展示真实书籍、日志、保存、同步与模型数据。
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useBookStore } from '../../store/useBookStore';
import { useConfigStore } from '../../store/useConfigStore';
import { useOutputLogStore } from '../../store/useOutputLogStore';
import { IdeSvgBookshelf, IdeSvgInfo, IdeSvgWarn, IdeSvgCheck, IdeSvgDownload } from './IdeSvg';
type SaveState='saving'|'saved'|'failed';
export function StatusBar(){
 const route=useAppStore(s=>s.route); const bookId=useAppStore(s=>s.activeBookId);
 const books=useBookStore(s=>s.books); const config=useConfigStore(s=>s.config); const logs=useOutputLogStore(s=>s.logs);
 const [saveState,setSaveState]=useState<SaveState>('saved'); const [savedAt,setSavedAt]=useState('');
 useEffect(()=>{const h=(e:Event)=>{const v=(e as CustomEvent)?.detail?.saveState as SaveState|undefined;if(v){setSaveState(v);if(v==='saved')setSavedAt(new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}));}};window.addEventListener('xly:save-state-change',h);return()=>window.removeEventListener('xly:save-state-change',h);},[]);
 const book=useMemo(()=>books.find(x=>x.id===bookId),[books,bookId]); const words=useMemo(()=>book?.chapters.reduce((n,x)=>n+(x.wordCount||0),0)||0,[book]);
 const errors=logs.filter(x=>x.level==='err').length, warnings=logs.filter(x=>x.level==='warn').length;
 const model=config?.ai?.model||'未配置模型'; const used=config?.tokenStats?.totalUsed||0; const syncEnabled=Boolean(config?.cloudSync?.enabled||config?.webdav?.enabled);
 if(route!=='editor'||!book) return <div className="wz-ide-statusbar"><span className="wz-st-seg">写梨眼</span></div>;
 return <div className="wz-ide-statusbar">
  <span className="wz-st-seg"><IdeSvgBookshelf size={12} strokeWidth={2} />{book.title}</span>
  <span className="wz-st-seg mono">{book.chapters.length} 章 · {words.toLocaleString('zh-CN')} 字</span>
  <span className="wz-st-seg st-err"><IdeSvgInfo size={12} strokeWidth={2} />{errors}</span><span className="wz-st-seg st-warn"><IdeSvgWarn size={12} strokeWidth={2} />{warnings}</span>
  <span className="wz-st-spacer" />
  <span className="wz-st-seg"><IdeSvgCheck size={12} strokeWidth={2} />{saveState==='saving'?'保存中…':saveState==='failed'?'保存失败':`已保存${savedAt?` ${savedAt}`:''}`}</span>
  <button type="button" className="wz-st-seg" onClick={()=>window.dispatchEvent(new CustomEvent('writerzen:open-settings'))}><IdeSvgDownload size={12} strokeWidth={2} />{syncEnabled?'云同步':'同步未启用'}</button>
  <span className="wz-st-seg">⚡ {model}</span><span className="wz-st-seg mono">{used.toLocaleString('zh-CN')} tokens</span><span className="wz-st-seg">UTF-8</span><span className="wz-st-seg">100%</span>
 </div>;
}
