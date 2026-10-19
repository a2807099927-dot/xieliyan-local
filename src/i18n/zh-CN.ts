// zh-CN
// 功能：简体中文文案（临时修复版，保证语法与运行稳定）
export const zhCN = {
 common: {
 confirm: '确认',
 cancel: '取消',
 save: '保存',
 delete: '删除',
 close: '关闭',
 loading: '加载中...',
 success: '操作成功',
 error: '发生错误',
 warning: '警告',
 noData: '暂无数据',
 on: '开启',
 off: '关闭'
 },
 island: {
 thinking: 'AI 正在思考...',
 writing: 'AI 正在输出...',
 feedback: 'AI 正在响应...',
 idle: '准备就绪',
 error: '执行失败',
 success: '执行完成'
 },
 editor: {
 backToShelf: '返回书架',
 memoryTab: '档案',
 outlineTab: '大纲',
 worldTab: '世界观',
 chapterWords: '本章字数',
 totalWords: '全书字数',
 totalTokens: '总 Tokens',
 pluginPanel: '插件面板',
 zenMode: '禅模式',
 settings: '系统设置'
 },
 chapter: {
 add: '新建章节',
 rename: '重命名',
 moveUp: '上移',
 moveDown: '下移',
 remove: '删除',
 untitled: '未命名章节',
 deleteConfirm: '确认删除该章节吗？',
 placeholder: '输入章节标题...'
 },
 toolbar: {
 memoryBank: '剧情档案',
 exportMarkdown: '导出 Markdown',
 exportPdf: '导出 PDF',
 exportTxt: '导出 TXT',
 export: '导出全书',
 searchReplace: '全局搜索/替换',
 plotGuard: '情节守卫',
 history: '章节历史回溯',
 autoFormat: '一键排版',
 zenMode: '禅模式',
 settings: '设置',
 undo: '撤销',
 redo: '重做',
 saved: '已保存',
 saving: '保存中',
 smartContinuation: '智能续写',
 pageWidth: '版心宽度',
 rightPanelMode: '右侧面板模式',
 overlayMode: '覆盖',
 pushMode: '推动'
 },
 ai: {
 inputPlaceholder: '输入你的问题，回车发送，Shift+回车换行...',
 consistencyCheck: '一致性检查',
 qualityCheck: '质量检查',
 continuationSuggest: '续写建议',
 generating: '生成中...',
 configError: '请检查模型配置、密钥与网络连接'
 }
} as const;

export type ZhCN = typeof zhCN;
