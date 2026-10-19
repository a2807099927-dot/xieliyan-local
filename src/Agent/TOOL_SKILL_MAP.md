# Agent 工具与 Skill 清单（2026-08-03）

## 入口

```
用户消息
  → 复杂查证：runReadOnlyAgentLoop（只读 ReAct，强制本地证据，workflow 含收尾/一致性/伏笔）
  → 常规对话/续写/写作：runAgentLoop（统一 Hermes 式 while 循环，模型自主决定调工具，主入口）
  → 编辑器一键写作：useAgentSession → runAgent（规划 → 写前复盘 → 生成 → 反思闭环；早期 runAgentDecisionLoop 已删除，由 runAgent 流水线接管）
```

> 注：早期"planAgentTask → runAgentOrchestrator 按预排计划调工具"的架构已废弃，
> 由模型自主决策的统一循环取代，相关文件已删除。
> 2026-08-03：agentSkillRouter.ts（AI skill 路由）与 pipeline.ts/patternSelector.ts（旧装配链）无引用，已一并删除。
> 2026-08-08：runAgentDecisionLoop（agentDecisionLoop.ts）已删除，编辑器写作统一走 useAgentSession.runAgent。

## 已工具化

| 工具 | 读写 | 用途 |
|------|------|------|
| search_* / read_chapter | 读 | 查证 |
| inspect_organization | 读 | 整理体检 |
| get_role_update_plans | 读 | 角色更新计划 |
| list_recent_context | 读 | 近章上下文 |
| prepare_outline_write | 读 | 组装细纲写作材料 |
| find_empty_chapter | 读 | 空章 |
| resolve_outline_target | 读 | 目标章定位 |
| build_story_canon | 读 | 设定卡+剧情卡+角色卡 |
| **plan_chapter_outline** | 读 | **出章纲（模型）** |
| **write_chapter_body** | 读 | **写正文（模型，不落库）** |
| save_body_to_chapter | 写 | 入章 |
| formalize_chapter_outline | 写 | 正式细纲落栏 |
| update_role / create_chapter / update_outline / save_memory | 写 | 自主写库 |

## Skill（装配，不是聊天 if）

| Skill | 文件 | 给谁用 |
|-------|------|--------|
| 规划师/写手/编辑 prompt | `skills/writingSkill.ts` | plan/write/review |
| 设定卡+近期剧情卡 | `storyCanonCards.ts` | build_story_canon / 出纲写作 |
| 题材审查清单 | `skills/loadReviewSkill.ts` | 自检 |
| 章纲故事板展示 | `outlineStoryboard.ts` | UI |

## 仍可继续技能/工具化

1. `review_draft` — 写后自检（现嵌在面板）
2. `create_role_cards` — 创造角色
3. `batch_outline` — 批量大纲写入
4. discuss 纯闲聊（无出纲）— 轻量 chat skill，不强制 plan_chapter_outline
5. 面板 `handleOutlineSend` / `handleWriteSend` 可逐步删，只留 orchestrator

## 原则

- **Agent 薄**：只拆意图、排步骤、展示
- **Tool 厚**：检查/出纲/写作/入章
- **Skill 管知识**：设定、文风、审查清单
- **检索引导**：unified loop system prompt 已写明 search_book（正文关键词）/search_roles（角色档案）/search_archive（剧情档案）分工，及"剧情合理性/走向/矛盾→先查证再答、查不到换词或明说、不编造"的纪律

## 技能系统（skills/registry.ts，2026-08-03 新增）

```
技能索引注入 unified loop system prompt（一行一个，注册表渲染）
  → 模型遇到对应场景先 load_skill 加载全文 → 按技能方法执行
```

| 技能 id | 内容 | 何时加载 |
|---------|------|----------|
| `writing` | 写作方法论：规划/写手/编辑三角色 prompt + 文风（buildWritingSkillBlock） | 写长内容/续写/按细纲写 |
| `review` | 题材审查清单（loadReviewSkill 按书 genre 加载 review/*.md） | 评价/自检/找硬伤/质量分析 |
| `story_canon` | 设定卡+近期剧情卡+角色卡（buildStoryCanonBlock） | 对齐本书设定/近章承接 |

- `load_skill` 是 unified loop 的自修工具（原生 tools + 文本 `<tool>` 双通道），`shouldReturnToolData` 白名单保证技能全文回传模型
- review 技能按当前书 genre 解析（inferAgentGenreFromBook），无 genre 走通用清单兜底
- 与 `review_draft` 工具分工：review_draft=产出后自动自检；load_skill("review")=用户明确要求人工审查时先加载题材清单
- save_skill（沉淀新技能）暂未做（P2），保存走人工

## 用户沉淀技能（userSkillStore.ts + user_skill_store.rs，2026-08-03 新增）

```
Agent 任务成功（调用了 load_skill / write_chapter_body / review_draft）
  → unified loop 返回 skillUsage 汇总（didWrite/didReview/loadedSkill/draftExcerpt，不自动弹卡）
  → Agent 回答气泡出现「存入技能库」按钮（用户主动触发，零打扰）
  → 点击 → proposeFromUsage 组装候选（内容含真实产出摘录，非模板）
  → SkillConfirmPanel 右下角完整展示（名称/描述/来源/内容全文）
  → 用户「确认存入」→ 持久化到 app_data/user_skills.json + 注册进 agentSkillRegistry
  → 下次会话 ensureAgentSkillsRegistered 时由 SkillConfirmPanel 的 loadSaved 恢复
```

- 持久化：Rust 命令 `user_skills_load/save`（app_data/user_skills.json，单文件避免目录列举）+ `app_data_path`
- 手动确认制：不自动弹卡；气泡按钮由用户把关质量；手动存入不受 30 分钟限频限制
- 去重：与已存技能同名不重复弹；动态技能索引渲染带「用户技能」标记
- authorProfile 沉淀（共用确认面板骨架）为独立后续项，数据层尚未存在
