-- ============================================================
-- 游戏题材 写作技法种子数据 v1（三层分析整合版）
-- 来源：三层分析
-- 角色名已全部匿名化为 XXX
-- 用途：INSERT 到 craft_patterns 表
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS craft_patterns (
  id TEXT PRIMARY KEY,
  genre TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  frequency TEXT,
  trigger_condition_json TEXT NOT NULL DEFAULT '[]',
  templates_json TEXT NOT NULL DEFAULT '[]',
  forbidden_json TEXT NOT NULL DEFAULT '[]',
  conflict_signals_json TEXT NOT NULL DEFAULT '{}',
  examples_json TEXT NOT NULL DEFAULT '{}',
  rule_summary TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'seed',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_craft_genre_type
  ON craft_patterns(genre, pattern_type);

-- ============================================================
-- 1. 对话技法 —— 开场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_dialogue_001',
  'youxi',
  'dialogue',
  '对话开场句',
  'High',
  '[
    {
      "if": "need_quick_info_exchange OR functional_question",
      "then": "unmodified_simple_tag_opener",
      "because": "最大限度减少叙述干扰，加快对话节奏，让读者注意力集中在对话内容本身",
      "example": ""老大，你叫何艺啊？"XXX问道。"
    },
    {
      "if": "dialogue_needs_emotional_subtext OR character_state_display",
      "then": "action_or_expression_modified_opener",
      "because": "通过非语言信息丰富对话层次感，让简单言语承载更多人物状态和意图",
      "example": ""为什么不跑？"XXX诧异问。"
    },
    {
      "if": "need_establish_game_context OR resource_inquiry",
      "then": "game_terminology_direct_opener",
      "because": "游戏术语开场直接建立题材沉浸感，同时传递功能性信息",
      "example": ""喂，你手里的XXX卖不卖？""
    },
    {
      "if": "encounter_familiar_player OR unexpected_meeting",
      "then": "exclamatory_recognition_opener",
      "because": "惊叹式开场制造意外感，快速建立角色关系和场景张力",
      "example": ""靠！你居然在这里，我还以为XXX呢！""
    }
  ]',
  '[
    {"template": ""哥们/老大，这XXX什么情况？"", "type": "信息索取式", "context": "对装备/怪物/事件的直接询问"},
    {"template": ""喂，你手里的XXX卖不卖？"", "type": "交易开场式", "context": "游戏内资源交易场景"},
    {"template": ""你们XXX，在这里清场是什么意思？"", "type": "质问式", "context": "遭遇敌对公会或不明势力"},
    {"template": ""这个任务/BOSS，有什么需要注意的？"", "type": "攻略询问式", "context": "组队前或副本前的信息确认"},
    {"template": ""你的XXX不错，我们切磋一下？"", "type": "挑战邀请式", "context": "PVP场景的友好或挑衅开场"},
    {"template": ""靠！你居然在这里，我还以为XXX呢！"", "type": "惊叹重逢式", "context": "意外遭遇熟人或敌人"},
    {"template": ""这XXX怎么走，有标记吗？"", "type": "路径询问式", "context": "探索新地图或迷路时"},
    {"template": ""怎么样，刚才爆出的XXX属性如何？"", "type": "战利品确认式", "context": "战斗结束后的收获讨论"},
    {"template": ""我需要XXX，你有吗？什么价？"", "type": "需求直述式", "context": "材料/药水等消耗品交易"},
    {"template": ""刚才那个XXX，你认识？"", "type": "情报探询式", "context": "遭遇未知玩家或NPC后的信息收集"}
  ]',
  '[
    "冗长而礼貌的开场白，如"请问，您是否有时间，XXX想占用您片刻……"（过度礼貌，不符合游戏社交调性）",
    "不确定的、犹豫的问句，如"XXX不知道该不该问，但是……"（犹豫感与游戏玩家直接风格冲突）",
    "与当前游戏或冲突环境无关的闲聊，如"今天天气真好，不是吗？"（无目的寒暄，节奏断裂）",
    "哲理文艺腔开场，如"生命的意义在于……"（完全不符合题材调性）"
  ]',
  '{
    "undercurrent": ["咦？", "皱了皱眉", "XXX有些不耐烦了", "目光一瞥，却发现……", "闻到了阴谋的味道", "不妙"],
    "open_conflict": ["你TMD……", "少废话！", "不由分说的打了上来", "狞笑着扑了过来", "给我开门！", "宰了他！"],
    "explosion": ["嘭！", "噗！", "嘎……", "电光火石间", "巨响声", "重重一拳/一击/打在", "飞起一脚"]
  }',
  '{
    "typical": [
      ""哥们，这XXX什么情况？"",
      ""喂，你手里的XXX卖不卖？"",
      ""靠！你居然在这里，我还以为XXX呢！"",
      ""这个任务/BOSS，有什么需要注意的？"",
      ""你的XXX不错，我们切磋一下？""
    ],
    "boundary": [
      "电话那边传来悦耳的笑声："傻小子，你去体育馆前面，最闪亮的那个就是你老大了。"（通过电话进行对话，带距离感和悬念感）",
      "XXX转身看了看他，露出一抹动人的笑意，打开车门，笑道："居然是你？快点上车吧……"（对话与一连串动作紧密结合）",
      "XXX扑哧一笑："你这没前途的家伙，还是让老大来当你的指路明灯吧！"（对话直接定义角色关系和性格）"
    ],
    "counter": [
      ""啊啊啊……"惨叫声此起彼伏……（非标准对话，用声音效果替代具体语言）",
      "MSN上一个头像正在抖动着……她留下了消息："明天上午见个面吧？"（非即时对话，以消息形式呈现）"
    ]
  }',
  '对话以动作引入和简单标签为主，节奏紧凑，快速通过角色反应推进情节。游戏术语和直接功利性目标是开场句的核心特征。',
  'seed',
  1700000002
);

-- ============================================================
-- 2. 对话技法 —— 冲突降温句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_dialogue_002',
  'youxi',
  'dialogue',
  '冲突降温句',
  'High',
  '[
    {
      "if": "conflict_resolved_by_one_hit_kill OR overwhelming_victory",
      "then": "dismissive_contempt_closure",
      "because": "一击秒杀后的轻蔑收场强化碾压感，赢家不需要解释，直接终止"
    },
    {
      "if": "conflict_resolved AND need_return_to_main_task",
      "then": "task_priority_redirect",
      "because": "以任务/练级为由终止冲突，体现主角目标导向的实用主义，不在无意义冲突上浪费时间"
    },
    {
      "if": "enemy_fleeing OR conflict_no_longer_worth_attention",
      "then": "relief_plus_resume_activity",
      "because": "舒一口气+回归正事的组合，快速将节奏从战斗切回日常推进"
    },
    {
      "if": "need_establish_deterrence_for_future",
      "then": "warning_with_escalation_threat",
      "because": "留下威胁性警告，为后续可能的再次冲突埋下伏笔，同时展示主角的强势"
    }
  ]',
  '[
    {"template": "（一击秒杀后）"哼，都说了别惹XXX，浪费练级时间。"", "type": "轻蔑收场式", "context": "绝对实力碾压后的不屑"},
    {"template": "（击败对手后）"你可以继续在这里XXX，但别再来招惹XXX了。"", "type": "划界警告式", "context": "划定边界，不赶尽杀绝"},
    {"template": "（看着对方尸体）"好了，事情解决了，走！"", "type": "干脆终结式", "context": "战斗结束，不做多余停留"},
    {"template": "（打断对方挑衅）"没空陪你们玩，XXX还有任务。"", "type": "任务优先式", "context": "以正事为由拒绝无意义冲突"},
    {"template": "（一剑击退对手后）"就这点实力，还想XXX？滚吧！"", "type": "实力碾压式", "context": "展示实力差距后的驱逐"},
    {"template": "（收剑转身）"哼，自寻死路。"", "type": "冷酷转身式", "context": "以背影结束战斗，极度自信"},
    {"template": "（看着对方溃逃）XXX舒了口气："总算清净了，继续XXX吧。"", "type": "松弛回归式", "context": "紧张解除后回归日常"},
    {"template": ""算了，别管他们了，正事要紧。"", "type": "务实忽略式", "context": "小冲突不值得浪费时间"},
    {"template": "（对盟友说）"一群垃圾而已，不必放在心上。"", "type": "团队安抚式", "context": "安抚队友同时贬低对手"},
    {"template": ""这次就算了，下次再让XXX看到你们XXX，就没这么简单了。"", "type": "威慑警告式", "context": "留有余地但建立威慑"}
  ]',
  '[
    "主动道歉或寻求和解，如"对不起，这或许是个误会，大家谈谈吧。"（主角不主动示弱）",
    "提出妥协或让步的方案，如"要不这样，这个XXX一人一半？"（赢家不需要妥协）",
    "表现出任何形式的胆怯或退缩，如"好吧，算XXX倒霉，走还不行吗？"（破坏主角强者形象）"
  ]',
  '{}',
  '{
    "typical": [
      "（一击秒杀后）"哼，都说了别惹XXX，浪费练级时间。"",
      "（看着对方尸体）"好了，事情解决了，走！"",
      ""没空陪你们玩，XXX还有任务。"",
      ""就这点实力，还想XXX？滚吧！"",
      ""这次就算了，下次再让XXX看到你们XXX，就没这么简单了。""
    ],
    "boundary": [
      "（收剑转身）"哼，自寻死路。"（无对话对象，自言自语式收场）",
      "XXX舒了口气："总算清净了，继续XXX吧。"（松弛感为主，非强势收场）"
    ],
    "counter": [
      ""对不起，这或许是个误会，大家谈谈吧。"（主动道歉）",
      ""要不这样，这个XXX一人一半？"（妥协让步）"
    ]
  }',
  '冲突降温遵循实力逻辑：赢家以轻蔑/忽视终止，以任务优先为由拒绝无意义纠缠。绝无主动道歉或妥协让步。',
  'seed',
  1700000002
);

-- ============================================================
-- 3. 场景转场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_structure_001',
  'youxi',
  'structure',
  '场景转场句',
  'High',
  '[
    {
      "if": "scene_needs_time_jump",
      "then": "direct_time_marker OR return_home_time_indicator",
      "because": "直接点明时间跳跃，省略无剧情意义的中间过程，保持叙事效率"
    },
    {
      "if": "scene_switch_between_game_and_reality",
      "then": "hard_cut_with_ellipsis OR system_prompt_signal",
      "because": "游戏内外切换用硬切或系统提示音作为天然分界线，无需过渡说明"
    },
    {
      "if": "emotion_switch_tense_to_relaxed",
      "then": "summary_action_or_sigh + new_scene_entry",
      "because": "用总结性动作（舒口气/终于结束了）结束紧张状态，然后直接切入新场景"
    },
    {
      "if": "emotion_switch_relaxed_to_tense",
      "then": "sudden_signal_word_interrupt",
      "because": "用"忽地""这时"等突发信号词打破平静，直接将节奏拉紧"
    }
  ]',
  '[
    {"template": "（段落结尾）……（新段落开头）", "type": "省略号硬切", "context": "游戏内外、现实与回忆的切换"},
    {"template": "翌日清晨，当XXX醒来时……", "type": "时间标记式", "context": "跨天转场"},
    {"template": "半小时后，XXX终于抵达了XXX。", "type": "时间压缩式", "context": "省略路途过程"},
    {"template": "回到XXX的时候，已经是深夜了。", "type": "归来+时间暗示式", "context": "以归来动作标志场景切换"},
    {"template": "收拾好XXX，XXX便出发前往XXX。", "type": "行动目的驱动式", "context": "以目的为驱动自然切换"},
    {"template": "做完XXX之后，XXX打开了XXX，准备下一步的行动。", "type": "任务衔接式", "context": "完成一事接续下一事"},
    {"template": ""刷！"光芒一闪，XXX已经出现在XXX。", "type": "传送/系统切换式", "context": "游戏内空间瞬移"},
    {"template": "不久之后，一个XXX出现在了远方。", "type": "新元素引入式", "context": "新角色或新事件的出现"},
    {"template": "就在这时，系统提示音响起……", "type": "系统事件触发式", "context": "游戏系统打断当前状态"},
    {"template": "想了想，还是先去XXX看看再说。", "type": "内心决策驱动式", "context": "主角主动选择下一步方向"}
  ]',
  '[
    "细腻、冗长的景物变化描写作为过渡，如"夕阳的余晖渐渐隐没在地平线下，夜的帷幕缓缓拉开，星星开始眨眼……"（抒情慢转场，节奏断裂）",
    "大段的心理活动作为场景连接，如"在离开的路上，XXX反复思索着刚才的对话，每一个字都像针一样……"（心理过渡过长）",
    "复杂的因果逻辑阐述，如"因为刚才的决定导致了XXX，所以现在XXX必须前往XXX来弥补……"（说明文式过渡）"
  ]',
  '{
    "time_signals": ["翌日清晨", "两天后", "半小时后", "时间到了", "已经是深夜了"],
    "space_signals": ["刷！光芒一闪", "回到XXX", "出发前往XXX", "系统提示音响起"],
    "emotion_reset_signals": ["XXX长长地舒了口气", "终于，结束了", "忽地", "这时", "一阵尖利的刹车声"]
  }',
  '{
    "typical": [
      "翌日清晨，当XXX醒来时……",
      ""刷！"光芒一闪，XXX已经出现在XXX。",
      "回到XXX的时候，已经是深夜了。",
      "就在这时，系统提示音响起……",
      "半小时后，XXX终于抵达了XXX。"
    ],
    "counter": [
      "夕阳的余晖渐渐隐没在地平线下，夜的帷幕缓缓拉开……（抒情慢转场）",
      "在离开的路上，XXX反复思索着刚才的对话……（心理过渡过长）"
    ]
  }',
  '转场追求极致效率。省略号硬切、时间标记、系统提示音是三大核心手法，游戏内外切换无需过渡说明，绝不允许抒情性慢转场。',
  'seed',
  1700000002
);

-- ============================================================
-- 4. 章节收尾钩子句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_structure_002',
  'youxi',
  'structure',
  '章节收尾钩子句',
  'High',
  '[
    {
      "if": "chapter_ending AND fate_changing_event_about_to_happen",
      "then": "narrator_foreshadowing_hook",
      "because": "以叙述者视角预示命运转折，制造宿命感和不可逆的紧张"
    },
    {
      "if": "chapter_ending AND new_threat_emerging",
      "then": "threatening_voice_or_presence_hook",
      "because": "以威胁性声音或存在结尾，直接制造危机感驱动翻页"
    },
    {
      "if": "chapter_ending AND mystery_deepening",
      "then": "unanswered_question_hook",
      "because": "以未解之谜结尾，读者带着疑问进入下一章"
    },
    {
      "if": "chapter_ending AND system_reward_or_hidden_event_triggered",
      "then": "system_notification_hook",
      "because": "游戏系统提示是题材特有的钩子，奖励/隐藏事件触发最大化期待感"
    }
  ]',
  '[
    {"template": "XX并不知道，在这个平静的XXX，命运将就此改变。", "type": "叙述者预示钩子", "context": "重大转折前的宿命感营造"},
    {"template": "就在这时，一个冰冷的声音从身后传来："XXX，想走吗？"", "type": "威胁登场钩子", "context": "新敌人或危机的突然出现"},
    {"template": "……看着地上的XXX，XXX的心脏怦怦直跳起来。", "type": "发现悬念钩子", "context": "发现神秘物品或关键线索"},
    {"template": "XXX的意识渐渐消失，眼前陷入了一片黑暗。", "type": "意识消失钩子", "context": "主角陷入危险/昏迷状态"},
    {"template": "只是，XXX究竟是怎么XXX的？这个谜团，恐怕……", "type": "未解之谜钩子", "context": "核心悬念的强化"},
    {"template": "虽然暂时解决了麻烦，但XXX知道，对方绝不会善罢甘休。", "type": "隐患预警钩子", "context": "暂时安全但危机未除"},
    {"template": "前方，一个巨大的XXX出现了，那是什么？", "type": "未知探索钩子", "context": "新区域/新怪物的悬念"},
    {"template": ""叮～！"系统提示：你触发了XXX！", "type": "系统触发钩子", "context": "隐藏任务/特殊事件的游戏化悬念"},
    {"template": "XX深吸了口气，提着XXX，毅然走向了那片未知的XXX。", "type": "果断行动钩子", "context": "主角主动迈向未知，制造期待"},
    {"template": "然而，XXX没有想到的是，真正的危险/惊喜，才刚刚开始。", "type": "预告式钩子", "context": "以叙述者口吻预告后续高潮"}
  ]',
  '[
    "平淡的、总结性的陈述，如"就这样，一天又过去了。"（完全闭合，零追读动力）",
    "解决了所有悬念的圆满结局，如"最终，所有问题都解决了，大家过上了幸福的生活。"（完全闭合）",
    "以一个抒情的景物描写或情绪感悟收尾，如"看着远方的夕阳，XX心中一片宁静。"（纯抒情，信息量为零）"
  ]',
  '{}',
  '{
    "typical": [
      "XX并不知道，在这个平静的XXX，他的命运将就此改变。",
      "就在这时，一个冰冷的声音从身后传来："XXX，想走吗？"",
      "……看着地上的XXX，XXX的心脏怦怦直跳起来。",
      ""叮～！"系统提示：你触发了XXX！",
      "然而，XXX没有想到的是，真正的危险/惊喜，才刚刚开始。"
    ],
    "counter": [
      "就这样，一天又过去了。（完全闭合）",
      "看着远方的夕阳，XXX心中一片宁静。（纯抒情收尾）"
    ]
  }',
  '章节结尾必须留钩子。系统提示音、叙述者预示、威胁登场、未解之谜是四大核心钩子类型，禁止完全闭合和纯抒情收尾。',
  'seed',
  1700000002
);

-- ============================================================
-- 5. 心理独白句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_psychology_001',
  'youxi',
  'psychology',
  '心理独白句（主角自身）',
  'High',
  '[
    {
      "if": "protagonist_assessing_situation_urgently",
      "then": "quick_judgment_monologue",
      "because": "快速判断模拟游戏玩家的即时反应，传递紧迫感和决策力"
    },
    {
      "if": "protagonist_making_critical_decision",
      "then": "resolve_determination_monologue",
      "because": "下定决心的独白推动情节转折，展示主角果断性格"
    },
    {
      "if": "protagonist_encountering_rare_item_or_event",
      "then": "exclamatory_surprise_monologue",
      "because": "惊叹式独白传递游戏奖励的爽感，与读者共享发现的兴奋"
    },
    {
      "if": "protagonist_sensing_danger_or_anomaly",
      "then": "instinct_warning_monologue",
      "because": "直觉预警制造紧张感，为即将到来的冲突蓄力"
    }
  ]',
  '[
    {"template": "不妙/很好，这个情况必须XXX！", "type": "局势判断式", "context": "紧急状况下的快速评估"},
    {"template": "XXX心里一横，决定XXX！", "type": "决断式", "context": "关键抉择时刻"},
    {"template": "XX心里说不出的XXX。", "type": "情绪反应式", "context": "郁闷/狂喜/忐忑等即时情绪"},
    {"template": "XXX死了吗？/这怎么可能？！", "type": "震惊质疑式", "context": "遭遇超出预期的事件"},
    {"template": "哼，XXX失去的东西，一定会亲手夺回来！", "type": "决心宣誓式", "context": "遭受损失后的反击意志"},
    {"template": "算了，能活着回来就好，想那么多干嘛。", "type": "务实自慰式", "context": "劫后余生的自我安慰"},
    {"template": "靠！居然是XXX！", "type": "惊叹发现式", "context": "发现极品装备/高级怪物"},
    {"template": "XXX在心里告诫自己，这一次一定要XXX。", "type": "自我告诫式", "context": "吸取教训后的自我提醒"},
    {"template": "奇怪了，这XXX到底是怎么回事？", "type": "疑惑探究式", "context": "遭遇异常现象"},
    {"template": "XXX心里一咯噔/一寒，感觉到了危险！", "type": "直觉预警式", "context": "危险来临前的本能反应"}
  ]',
  '[
    "脱离当前情境的哲学思辨，如"在这个虚拟的世界里，真实与虚幻的边界究竟在哪里？"（哲理腔，不符合题材）",
    "复杂的道德挣扎和自我剖析，如"XXX这样做是否正确？内心在善与恶的天平上摇摆不定……"（道德自省，主角不做）",
    "对他人的心理进行大段的、文学性的揣测，如"或许，在他冰冷的外表下，也隐藏着一颗渴望温暖的心吧……"（文艺揣测，不符合风格）"
  ]',
  '{}',
  '{
    "stats": {
      "surface_level_thought_ratio": "40%（动作反应/即时判断）",
      "direct_inner_monologue_ratio": "55%（直接想法/决策/情绪）",
      "deep_subconscious_ratio": "5%（极少出现的隐喻式深层思考）"
    },
    "trigger_scenes": {
      "most_dense": "遭遇突发危险、内心抉择、或与关键人物互动时",
      "secondary": "发现稀有物品或触发隐藏事件时"
    },
    "protagonist_self_assessment": [
      "不妙/很好，这个情况必须XXX！",
      "XXX心里一横，决定XXX！",
      "XXX心里说不出的XXX。",
      "XXX死了吗？/这怎么可能？！",
      "哼，XXX失去的东西，一定会亲手夺回来！",
      "算了，能活着回来就好，想那么多干嘛。",
      "靠！居然是XXX！",
      "XXX在心里告诫自己，这一次一定要XXX。",
      "奇怪了，这XXX到底是怎么回事？",
      "XXX心里一咯噔/一寒，感觉到了危险！"
    ],
    "protagonist_speculation_on_others": [
      "XXX用一种见鬼的表情看着XXX，似乎在说："XXX？"",
      "看得出来，XXX一定没有料到XXX还会XXX。",
      "背后无数羡慕嫉妒恨的目光，犹如利剑般让人如芒刺在背。",
      "周围的人一定都惊呆了，怎么也没有想到XXX。",
      "XXX的脸上写满了不敢置信，显然是被XXX的出色表现吓到了。",
      "那几个XXX看着XXX，就像是看一个2B一样。",
      "XXX的眼神充满了XXX，看来这一战无可避免了。",
      "从XXX的反应来看，他肯定以为XXX。",
      "他们之所以这么做，无非是想XXX而已。",
      "XXX的漂亮脸蛋上写满了XXX，一定在想XXX。"
    ]
  }',
  '心理描写以直白、功能性的内心独白和即时想法为主，深度探索极少。核心情绪是判断、决断、惊叹、预警，绝不暴露哲理思辨或道德挣扎。',
  'seed',
  1700000002
);

-- ============================================================
-- 6. 节奏控制规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_rhythm_001',
  'youxi',
  'rhythm',
  '节奏控制规则',
  'High',
  '[
    {
      "if": "scene_type == physical_conflict OR emergency_situation",
      "then": "short_sentences_max_12_chars + single_char_onomatopoeia + single_line_paragraphs",
      "because": "快速句式切换模拟心跳加速和紧张呼吸，视觉断裂感强化动作冲击力"
    },
    {
      "if": "scene_type == background_explanation OR mental_preparation",
      "then": "long_sentences_with_multiple_clauses + longer_paragraphs",
      "because": "舒缓句式给予读者充足阅读和思考时间，有助于信息平稳接收和氛围营造"
    },
    {
      "if": "action_or_sentence_needs_extreme_emphasis",
      "then": "isolated_single_line_paragraph",
      "because": "页面大量空白强制读者停顿，赋予该行文字极强分量感，如电影特写慢镜头"
    },
    {
      "if": "game_system_event_occurs",
      "then": "onomatopoeia_single_line + system_text",
      "because": "拟声词+系统文本的组合是游戏题材特有的节奏标记，强化沉浸感"
    },
    {
      "if": "destructive_action_with_visual_result",
      "then": "onomatopoeia_opener + rapid_consequence_chain",
      "because": ""刷！"等拟声词开头后接连续短促描述，营造迅猛爆裂的视觉效果"
    }
  ]',
  '[
    {"template": "又一次灭团了。", "type": "单行段-情绪转折", "context": "失败后的极简总结，强制停顿"},
    {"template": ""嘭！"", "type": "单字拟声词段", "context": "物理冲击的瞬间"},
    {"template": "果然是蓄意杀人！", "type": "单行段-关键判断", "context": "核心信息确认的强调"},
    {"template": "XXX死了吗？", "type": "单行段-震惊质疑", "context": "极端状况下的自我质问"},
    {"template": "是！", "type": "极短应答段", "context": "干脆利落的回应"},
    {"template": ""刷！"一道火箭破天而去，在空中骤然爆开，化为千万火雨落下……", "type": "拟声词+连续短描述", "context": "破坏性攻击的视觉呈现"},
    {"template": "XX平举手掌，数道数据组成的光华从掌心里飞舞盘旋，下一刻，身体渐渐消失……", "type": "长句-仪式感动作", "context": "过程性动作的舒缓呈现"},
    {"template": "不妙，这是……XXX闻到了阴谋的味道！", "type": "短句-直觉判断", "context": "危险感知的即时反应"}
  ]',
  '[
    "在紧张战斗场景中使用超过30字的长句（破坏紧张感）",
    "纯说明文式的长段落出现在动作场景中间（节奏断裂）",
    "意识流或蒙太奇手法（所有场景切换清晰直白）"
  ]',
  '{}',
  '{
    "stats": {
      "tense_scene_avg_sentence_length": "12字",
      "relaxed_scene_avg_sentence_length": "28字",
      "dialogue_paragraph_avg_lines": 1.5,
      "narration_paragraph_avg_lines": 3,
      "description_paragraph_avg_lines": 5.5,
      "single_line_paragraph_triggers": "情绪转折、关键判断、行动决策、拟声词冲击"
    },
    "contrast": {
      "destructive_action": "拟声词开头+连续短促描述（迅猛爆裂，节奏极快）",
      "ritual_action": "长句+飞舞盘旋/渐渐消失等词汇（拉长时间感，仪式感与怅然）"
    }
  }',
  '高频切换的"快-慢"交替节奏，利用极短句、拟声词和单行段落制造冲击感，与平铺直叙的叙述形成鲜明对比。游戏系统音效是题材特有的节奏标记。',
  'seed',
  1700000002
);

-- ============================================================
-- 7. 描写技法规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_description_001',
  'youxi',
  'description',
  '描写技法规则',
  'High',
  '[
    {
      "if": "key_female_character_first_appearance_or_key_scene",
      "then": "extensive_subjective_partial_closeup_description",
      "because": "塑造角色惊艳感，直接服务于主角情绪冲击和情节戏剧性转折，目的是制造效果而非写实"
    },
    {
      "if": "chapter_opening_or_new_scene_start",
      "then": "brief_single_sensory_environment_description",
      "because": "快速为即将发生的事件设定基调和背景，功能性大于艺术性，不拖泥带水"
    },
    {
      "if": "protagonist_in_near_death_or_extreme_shock_state",
      "then": "exaggerated_atmosphere_keywords_for_inner_sensation",
      "because": "高度主观的描写让读者瞬间代入主角极端感受，快速建立共情和紧张感"
    },
    {
      "if": "need_show_character_social_status_or_identity",
      "then": "use_equipment_brand_vehicle_as_symbol",
      "because": "装备/品牌/载具等物质符号快速建立角色坐标，比形容词更有说服力"
    }
  ]',
  '[
    {"template": "月光凄美，洒落在她的身上，在她清丽脱俗的脸蛋上镀上了一层光华。", "type": "光影+外貌组合", "context": "女性角色在特定光线下的理想化呈现"},
    {"template": "两条浑圆而雪腻的腿露在山风中，那白色披风沾满鲜血。", "type": "局部特写+反差", "context": "美与暴力的视觉反差"},
    {"template": "一笑间的美态更是动人心魄，几乎站台上的几个年轻人都看傻了眼。", "type": "他人反应衬托", "context": "通过旁人反应强化角色魅力"},
    {"template": "追随了近两年的老大，真的是眼前这个美女吗？", "type": "认知反差式", "context": "预期与现实的冲击"},
    {"template": "一抹动人心魄的雪白横陈眼前，深深的沟壑更是让人迷失。", "type": "感官冲击特写", "context": "直接的视觉欲望描写"},
    {"template": "血色蔓延，那是一片饱受战争摧残的大地，森林枯萎，人类主城崩塌成了废墟……", "type": "游戏CG式全景描写", "context": "戏中戏的宏大场景"},
    {"template": "他脸上满是刀疤，狞笑着扑了过来。", "type": "反派极简脸谱式", "context": "对反派配角的快速标签化描写"},
    {"template": "站台上七八个人，不远处停了一辆崭新的黑色跑车，流线华美……", "type": "物品符号式", "context": "通过物品暗示角色身份地位"}
  ]',
  '[
    "她长得很美，像仙女一样。（空洞形容词，无具体信息）",
    "天空很蓝，白云很白。（纯景物无叙事功能）",
    "他感到一种宇宙般的孤独。（抽象意识流，不符合题材风格）",
    "超过200字的连续景物描写段落（作者刻意避免）"
  ]',
  '{}',
  '{
    "stats": {
      "sensory_channels": {"visual": "70%", "auditory": "15%", "olfactory": "10%", "tactile": "5%"},
      "first_appearance_avg_chars": "约120字",
      "description_order": "整体氛围/状态 → 吸引眼球的局部细节（脸、胸、腿）",
      "direct_vs_pov_ratio": "0%直接描写 vs 100%主角视角",
      "direct_label_vs_behavioral_hint": "40%直接定义 vs 60%行为暗示",
      "environment_avg_chars": "约40字",
      "environment_timing": "章节开头或场景转换时"
    },
    "atmosphere_keywords_top10": ["忽地", "骤然", "电光火石间", "刷！", "叮～！", "惊心动魄", "惊世骇俗", "冷冷", "杀气", "一片空白"],
    "contrast_cases": {
      "case_A": "月夜，温暖的春风夹带着花草的清香，拂过森林，树枝随风摇曳。（多感官，营造氛围反差）",
      "case_B": "深夜，宁静的山野荒村，一片新土出现在田地里。（极简视觉，聚焦核心悬念）",
      "reason": "案例A为追逐战前的反差铺垫，案例B为悬疑场景的核心信息聚焦，目的不同手法不同"
    }
  }',
  '描写技法高度聚焦于主角视角的感官冲击。女性角色理想化局部特写，环境描写简洁功能化，拟声词和游戏术语融入描写是题材特有标记。',
  'seed',
  1700000002
);

-- ============================================================
-- 8. 叙事结构规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_structure_003',
  'youxi',
  'structure',
  '叙事结构规则',
  'High',
  '[
    {
      "if": "chapter_opening AND need_hook_reader",
      "then": "action_start_preferred OR environment_plus_action_combo",
      "because": "动作开场占50%，迅速拉入冲突制造期待感，适应碎片化阅读习惯"
    },
    {
      "if": "chapter_main_conflict_reaching_climax",
      "then": "place_climax_at_middle_or_end",
      "because": "高潮置于中间或末尾各占50%，确保前段铺垫充分且结尾有力"
    },
    {
      "if": "need_maintain_reading_tension",
      "then": "micro_conflict_cycle_max_1_5_chapters",
      "because": "极速冲突循环确保持续阅读紧张感，一个小型危机从引入到解决不超过两章"
    },
    {
      "if": "need_reward_reader_after_conflict",
      "then": "system_reward_or_power_up_immediately_after_resolution",
      "because": "冲突-解决-奖励的微循环是游戏题材核心结构，奖励即时反馈维持爽感"
    }
  ]',
  '[
    {"template": "月夜，温暖的春风……忽地，两个身影飞速掠过。", "type": "环境→动作开局", "context": "以短环境铺垫后立即切入动作"},
    {"template": "一阵尖利的刹车声在公路上响起，鲜血横流。", "type": "纯动作开局", "context": "直接以冲击性动作开章"},
    {"template": "脑后受到一次重击，火辣辣的感觉传来……整个人重重的趴倒在了公路之上。", "type": "悬念动作收尾", "context": "以主角受创的悬念结束章节"},
    {"template": "XX并不知道，在这个平静的上午，他的一生将就此改变。", "type": "叙述者预示收尾", "context": "总结式/预示性收尾"},
    {"template": "XXX的手机响了，里面传来了老大的声音："XXX，你小子怎么还不来？"", "type": "巧合制造小高潮", "context": "通过巧合事件推动情节转折"}
  ]',
  '[
    "超过3章的纯日常无冲突段落（必须保持冲突密度）",
    "非线性叙事结构（故事线保持单向线性）",
    "高潮置于章节前1/3（前移导致后段拖沓）",
    "完全闭合式结尾（无悬念信息的平静收场）"
  ]',
  '{
    "undercurrent": ["咦？", "皱了皱眉", "不耐烦", "目光一瞥", "闻到了阴谋的味道", "不妙"],
    "open_conflict": ["你TMD", "少废话", "不由分说打了上来", "狞笑着扑来", "给我开门", "宰了他"],
    "explosion": ["嘭！", "噗！", "嘎……", "电光火石间", "巨响声", "重重一拳", "飞起一脚"]
  }',
  '{
    "stats": {
      "chapter_opening_types": {"action_start": "50%", "environment_start": "25%", "dialogue_start": "25%", "suspense_start": "0%"},
      "chapter_ending_types": {"action_cliffhanger": "40%", "suspense_hook": "30%", "emotional_resonance": "30%"},
      "climax_position": "中间或末尾，各占约50%",
      "event_cycle_chapters": "1-1.5章完成一个事件闭环",
      "foreshadowing_recovery_span": "1-2章内回收",
      "emotional_peak_frequency": "平均每1-2章一次波峰",
      "peak_buildup_method": "通过突发事件或冲突对话快速拉升情绪，而非长时间铺垫"
    },
    "core_structure_loop": "冲突引入 → 快速升级 → 解决/奖励 → 新冲突触发（极速微循环）"
  }',
  '典型的强情节、快节奏网文结构，以"冲突-解决-奖励"的微循环为基础，章节间强关联，钩子密集。事件弧极短（1-1.5章），伏笔回收极快（1-2章）。',
  'seed',
  1700000002
);

-- ============================================================
-- 9. 信息密度规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_info_density_001',
  'youxi',
  'info_density',
  '信息密度规则',
  'High',
  '[
    {
      "if": "need_introduce_game_world_setting",
      "then": "embed_in_system_prompt_or_equipment_description",
      "because": "游戏系统提示和装备描述是天然的信息载体，融入叙事不突兀"
    },
    {
      "if": "need_reveal_protagonist_background_or_secret",
      "then": "embed_in_physical_object_or_interface_detail",
      "because": "通过物件（头盔铭文、名片、系统界面）自然释出背景信息，避免旁白说明"
    },
    {
      "if": "need_plant_foreshadowing",
      "then": "brief_anomaly_mention_with_question",
      "because": "以简短的异常现象+主角疑问埋下伏笔，极短周期（1-2章）内回收"
    },
    {
      "if": "need_deliver_reward_info",
      "then": "system_notification_format",
      "because": "系统提示格式是游戏题材最自然的信息投放方式，同时制造即时爽感"
    }
  ]',
  '[
    {"template": "……上面书写着龙飞凤舞的大字：XXX！", "type": "物件文字信息", "context": "通过游戏内物件引入新信息"},
    {"template": "……在头盔的侧面印着一行蓝色小字——XXX。", "type": "装备铭文信息", "context": "通过装备细节揭示主角背景"},
    {"template": "一场车祸导致XXX的脑部神经反射出现障碍，延时3秒之久。", "type": "核心设定/冲突信息", "context": "直接陈述核心设定，简洁有力"},
    {"template": "……系统提示：由于你的体质达到要求，可以获得隐藏职业……", "type": "系统奖励信息", "context": "信息投放与情节奖励结合"},
    {"template": "经受了那么重的钝器击打……又被泥土埋了不知道多久，XXX是怎么活着走出来的？", "type": "伏笔埋设式", "context": "以疑问形式埋下身体异常的伏笔"},
    {"template": "天纵这款游戏将在两天后的凌晨12点正式开放，没有内测和公测。", "type": "世界观直述式", "context": "直接交代游戏核心设定"}
  ]',
  '[
    "大段说明文式旁白（超过150字的连续设定解释）",
    "故弄玄虚的谜语人式信息投放（信息必须快速转化为行动和结果）",
    "伏笔跨度超过3章且无中间线索（读者记忆断裂，本题材伏笔回收极快）"
  ]',
  '{}',
  '{
    "stats": {
      "avg_new_info_points_per_chapter": 4,
      "delivery_method": "均匀分布于章节中，常与情节转折相结合",
      "foreshadowing_to_payoff_span": "1-2章（极短回收周期）",
      "info_position": "均匀分布，与情节转折结合"
    },
    "info_delivery_methods": {
      "system_prompt": "系统提示格式直接投放（隐藏职业/任务触发）",
      "object_detail": "物件细节释出（头盔铭文/名片/装备属性）",
      "direct_statement": "核心设定直接陈述（简洁有力，不绕弯）",
      "question_foreshadow": "以主角疑问埋设伏笔（快速回收）"
    }
  }',
  '每章稳定投放4个关键新信息，通过极短的伏笔-回收周期（1-2章）快速解答部分疑惑并制造新悬念。系统提示和物件细节是游戏题材特有的信息载体。',
  'seed',
  1700000002
);

-- ============================================================
-- 10. 他人对主角的评价（游戏题材补全）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_psychology_002',
  'youxi',
  'psychology',
  '心理独白句（他人对主角评价）',
  'Medium',
  '[
    {"if": "other_player_observing_protagonist_unusual_skill","then": "shocked_reevaluation","because": "玩家对主角超常操作的震惊评价，是游戏题材爽感的重要放大器"},
    {"if": "antagonist_guild_reassessing_protagonist_after_defeat","then": "threat_recognition_with_wariness","because": "对手公会的重新评估是主角崛起的信号，增加后续对抗的合理性"},
    {"if": "bystander_witnessing_protagonist_highlight_moment","then": "collective_awe_or_envy","because": "围观者的集体反应是高光时刻的放大器，通过他人震惊强化主角的逆袭爽感"},
    {"if": "ally_or_mentor_sensing_protagonist_hidden_potential","then": "quiet_recognition_with_expectation","because": "老玩家/前辈的静默认可比直接赞美更有分量，暗示主角的天赋上限"}
  ]',
  '[
    {"template": "XXX用一种见鬼的表情看着XXX，似乎在说："这怎么可能？"", "type": "震惊质疑式", "context": "主角操作超出对方认知时的反应"},
    {"template": "那几个XXX看着XXX，就像是看一个2B一样。", "type": "初始轻视式", "context": "对主角的第一印象，为打脸铺垫"},
    {"template": "背后无数羡慕嫉妒恨的目光，犹如利剑般让人如芒刺在背。", "type": "集体嫉妒式", "context": "主角高光时刻的群体反应"},
    {"template": "周围的人一定都惊呆了，怎么也没有想到XXX。", "type": "集体震惊式", "context": "意外操作引发的围观者反应"},
    {"template": "XXX的脸上写满了不敢置信，显然是被XXX的出色表现吓到了。", "type": "对手颠覆式", "context": "对手被主角表现震惊"},
    {"template": "从XXX的反应来看，他肯定以为XXX是个菜鸟。", "type": "误判揭示式", "context": "对手低估主角的心理"},
    {"template": "XXX的漂亮脸蛋上写满了XXX，一定在想XXX。", "type": "女性角色评价式", "context": "女性角色对主角的主观评价"},
    {"template": "这小子……有点东西。XXX心里暗暗记下了这个ID。", "type": "对手初步警觉式", "context": "有眼力的对手感知到主角潜力"},
    {"template": "看得出来，XXX一定没有料到XXX还会XXX。", "type": "预期落空式", "context": "主角超出所有人预期的表现"},
    {"template": "起初XXX以为他只是个新手，但现在看来，这个人不简单。", "type": "认知修正式", "context": "对主角的判断从轻视转向重视"}
  ]',
  '[
    "XXX真是个天才玩家，我从心底里佩服他。（过于直白的正面赞美，游戏题材的认可都是含蓄的）",
    "大家都觉得XXX很厉害，纷纷鼓掌。（集体正向反应，不符合游戏竞技的现实逻辑）"
  ]',
  '{}',
  '{}',
  '游戏题材他人评价分三个阶段：初始轻视（菜鸟误判）→ 震惊/困惑（操作超出认知）→ 嫉妒/警觉/认可（爽感放大）。评价始终含蓄，通过他人态度变化折射主角的实力成长。',
  'seed',
  1700000002
);

-- ============================================================
-- 11. 对话收尾句（游戏）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_dialogue_close_001',
  'youxi',
  'dialogue',
  '对话收尾句',
  'High',
  '[
    {"if": "protagonist_won_combat_or_exchange","then": "end_with_contemptuous_dismissal_and_immediate_task_redirect","because": "游戏主角赢了不需要庆祝，轻蔑地终止对话然后立刻回到任务，这种不在乎本身就是最强的碾压"},
    {"if": "dialogue_involves_trade_or_alliance","then": "end_with_casual_confirmation_then_move_on","because": "游戏题材的交易和结盟要快速确认然后立刻推进，不拖情绪尾巴"},
    {"if": "protagonist_needs_to_exit_from_dangerous_situation","then": "end_with_strategic_retreat_line_that_signals_future_return","because": "游戏主角的战略撤退不是软弱，是实力判断，收场时要暗示主角会回来，为后续埋线"},
    {"if": "dialogue_ends_with_system_notification","then": "let_system_prompt_serve_as_natural_dialogue_terminator","because": "游戏系统提示是天然的对话终止信号，用系统音效或提示来结束对话，比任何台词都更有题材感"}
  ]',
  '[
    {"template": "【写法】主角说完最后一句话（通常是一句轻蔑或实用主义的总结），然后立刻转向任务或下一个目标，用行动宣告对话结束。这个行动要和本章的任务目标直接相关。", "type": "任务优先终止式", "context": "主角占优势时的收场"},
    {"template": "【写法】交易或结盟收场：主角用一句话确认条件，语气简短直接，然后立刻做下一件事。不要有任何情感性的收尾，纯粹的功利主义。", "type": "功利确认式", "context": "交易或结盟的收场"},
    {"template": "【写法】战略撤退收场：主角说一句话暗示自己会回来（"下次再说""记住这个名字"），然后离开。这句话要和本章的具体冲突有关，不能是通用的威胁。", "type": "战略撤退暗示回归式", "context": "被迫撤退时的收场"},
    {"template": "【写法】对话结束时，用一个游戏系统提示（叮的一声、系统消息弹出）来自然终止对话，这个系统提示要和本章的任务或事件直接相关。", "type": "系统提示终止式", "context": "游戏系统事件打断对话"},
    {"template": "【写法】主角不说话，用一个具体的游戏动作（收起武器、打开背包、激活技能）来结束对话，这个动作要传达出主角的下一步意图。", "type": "游戏动作终止式", "context": "无需言语的收场"}
  ]',
  '[
    "主角主动道歉或寻求和解来结束对话（破坏强者形象）",
    "用和本章任务无关的感悟来收场（脱离游戏题材调性）",
    "收场时主角表现出胆怯或退缩（破坏人设）",
    "引入本章没有出现过的新游戏元素来打断对话（外挂元素）"
  ]',
  '{}',
  '{}',
  '游戏对话收尾遵循实用主义原则：赢了用任务优先终止，交易用功利确认，撤退暗示回归。游戏系统提示是天然的对话终止信号。收尾要从本章已有的任务和事件里生长，禁止外挂元素。',
  'seed',
  1700000002
);

-- ============================================================
-- 12. 冲突升级句（游戏）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_conflict_escalation_001',
  'youxi',
  'conflict',
  '冲突升级句',
  'High',
  '[
    {"if": "user_instruction_implies_combat_or_pvp_confrontation","then": "escalate_through_skill_and_power_gap_revelation","because": "游戏冲突升级的核心是实力差距的逐步揭示——从试探到展示技能到全力出击，每一步都要有具体的游戏动作"},
    {"if": "conflict_involves_guild_or_faction_confrontation","then": "escalate_by_raising_stakes_with_numbers_and_resources","because": "公会或势力冲突的升级靠具体的数字（人数、装备等级、资源量），不靠情绪"},
    {"if": "conflict_is_escalating_and_protagonist_is_being_cornered","then": "use_unexpected_skill_or_system_ability_to_flip_situation","because": "被逼到墙角时，主角激活一个对方没见过的技能或系统能力，局势立刻逆转，这是游戏题材最有爽感的升级方式"},
    {"if": "conflict_is_about_to_peak","then": "use_a_specific_game_element_from_this_chapter_as_trigger","because": "游戏冲突爆发的触发点必须是本章已经出现过的游戏元素（装备、技能、任务），不能是凭空出现的新设定"}
  ]',
  '[
    {"template": "【写法】战斗冲突升级分三步：第一步是试探（双方互相测试实力，用具体的技能或动作）；第二步是展示（一方展示真实实力，对方意识到差距）；第三步是全力出击（决定性的攻击或技能）。每一步都要有具体的游戏动作描写。", "type": "战斗三步升级结构", "context": "游戏战斗冲突升级"},
    {"template": "【写法】冲突升级时，主角激活一个本章已经提到过的技能或装备，这个技能或装备的效果要超出对方的预期，用对方的震惊反应来定性实力差距。", "type": "技能揭示逆转式", "context": "技能或装备的关键时刻展示"},
    {"template": "【写法】势力冲突升级时，用具体的数字（人数、等级、资源）来标记双方的实力对比，这些数字要基于本章已经建立的游戏世界设定，不能是随机的。", "type": "数字实力对比升级式", "context": "势力或公会冲突的升级"},
    {"template": "【写法】冲突爆发的最后触发点，用本章已经出现过的一个具体游戏元素（某件装备、某个任务、某个NPC）作为导火索，让爆发有必然性。", "type": "本章游戏元素触发爆发式", "context": "冲突爆发的最后触发点"}
  ]',
  '[
    "冲突升级靠提高音量或加感叹号（没有实质内容的情绪堆砌）",
    "引入和本章游戏设定无关的新技能或新装备（外挂冲突）",
    "主角在冲突升级过程中表现出胆怯或犹豫（破坏人设）",
    "冲突爆发的触发点是本章从未出现过的新游戏元素（外挂触发）"
  ]',
  '{}',
  '{}',
  '游戏冲突升级遵循战斗三步结构，用技能和装备的揭示来标记实力差距。升级靠具体的游戏动作和数字，爆发点必须来自本章已有的游戏元素。禁止外挂新技能和情绪堆砌。',
  'seed',
  1700000002
);

-- ============================================================
-- 13. 开章与转场钩子（游戏）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_chapter_transition_001',
  'youxi',
  'structure',
  '开章与转场钩子',
  'High',
  '[
    {"if": "user_instruction_implies_new_chapter AND previous_chapter_ended_on_combat_or_reward","then": "open_at_immediate_aftermath_with_system_notification_or_loot","because": "游戏节奏要求新章节立刻承接上章战斗或任务的结果，系统提示或战利品是最自然的开章信号"},
    {"if": "user_instruction_implies_scene_switch_to_new_area","then": "use_teleport_or_purposeful_movement_as_transition","because": "游戏内的空间切换用传送或目的性移动来驱动，这是游戏题材最自然的转场方式"},
    {"if": "user_instruction_implies_time_skip_for_leveling_or_preparation","then": "compress_with_result_sentence_then_show_new_state","because": "游戏的升级和准备阶段不需要详细描写，用一句话说明结果，然后直接展示新状态"},
    {"if": "user_instruction_implies_new_quest_or_event_trigger","then": "open_with_system_notification_or_npc_dialogue_that_triggers_quest","because": "新任务或事件的开始用系统提示或NPC对话来触发，这是游戏题材最有沉浸感的开章方式"}
  ]',
  '[
    {"template": "【写法】新章节第一句话是上章战斗或任务的直接结果（系统提示、战利品、经验值），然后立刻进入主角的即时反应。不要用时间标记或环境描写作为缓冲。", "type": "战斗结果直入式开章", "context": "战斗或任务完成后的新章节"},
    {"template": "【写法】转场时，用主角的传送动作或目的性移动来驱动切换，加上一个游戏系统的反馈（传送光效、地图加载），让切换有游戏感。这个目的地要和用户指令的意图直接对应。", "type": "游戏传送驱动转场", "context": "用户指令明确指向新区域"},
    {"template": "【写法】时间跳跃时，用一句话说明时间和升级结果（等级、技能、装备的变化），然后直接展示新状态。不要描述升级过程，只展示结果。", "type": "升级结果标记时间跳跃", "context": "升级或准备阶段的时间压缩"},
    {"template": "【写法】新任务开章：用系统提示音或NPC的第一句话来触发新章节，这个触发要和本章已经建立的游戏世界背景直接相关，不能是凭空出现的新任务。", "type": "系统触发新任务式开章", "context": "新任务或事件的开始"}
  ]',
  '[
    "用"翌日清晨""不知不觉"等套话直接开章（不符合游戏题材的即时感）",
    "开章用大段游戏世界观描写来建立氛围（拖慢节奏）",
    "转场时引入本章没有出现过的新游戏区域或新系统（外挂转场）",
    "时间跳跃只说时间不说升级结果（信息量为零）",
    "转场方式和用户指令的意图脱节（自行决定跳跃方式）"
  ]',
  '{}',
  '{}',
  '游戏开章和转场遵循即时反馈原则：新章节从战斗结果或系统提示开始，转场用传送或目的性移动驱动，时间跳跃用升级结果标记。禁止硬套时间套话，禁止脱离用户指令意图的自行跳跃。',
  'seed',
  1700000002
);

-- ============================================================
-- 14. 连锁震惊写法（游戏）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_chain_shock_001',
  'youxi',
  'psychology',
  '连锁震惊写法',
  'Medium',
  '[
    {"if": "protagonist_achieves_something_impossible_in_game_context","then": "write_layered_shock_from_ordinary_players_to_rivals_to_top_players","because": "游戏题材的爽感在于被逐层认可，普通玩家→对手→强者的层级震惊是这个题材特有的爽感结构"},
    {"if": "protagonist_demonstrates_skill_that_contradicts_others_expectations","then": "show_each_level_being_forced_to_reassess","because": "从被当菜鸟到被强者重新审视，层级越高说明主角的实力越被认可"}
  ]',
  '[
    {"template": "【写法】按层级从低到高依次写反应：普通玩家（这操作怎么可能）→对手/竞争者（他是什么来头）→强者/顶尖玩家（这个人要盯住）。每层反应要有具体的情绪或语言，不能只写震惊。", "type": "三层递进式", "context": "主角展示出超出预期的操作或实力时"},
    {"template": "【写法】对手的不可置信要单独处理：先是轻蔑（不过如此），然后是不安（这人怎么这么强），然后是不可置信（这怎么可能），最后是沉默（无话可说）。四步走，体现被碾压的过程。", "type": "对手被碾压过程式", "context": "主角在对抗中超越对手时"},
    {"template": "【写法】旁观者的震惊要通过具体反应传达：停下来围观、沉默、重新打量——用这些反应暗示震惊，比直接写震惊更有画面感。", "type": "旁观者具体反应式", "context": "公开场合的实力展示时"}
  ]',
  '[
    "只写众人震惊、全服哗然等空洞描述",
    "所有层级同时震惊，失去层次感",
    "每章都强行安排震惊反应（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '连锁震惊写法：普通玩家→对手→强者的层级震惊，每层反应具体化。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000002
);

-- ============================================================
-- 15. 信息差释放写法（游戏）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_info_gap_release_001',
  'youxi',
  'structure',
  '信息差释放写法',
  'Medium',
  '[
    {"if": "protagonist_has_hidden_ability_or_knowledge_others_dont_know","then": "control_who_discovers_it_and_when","because": "游戏题材的隐藏实力价值在于分层揭露，先让对方以为是运气，再让对方意识到是实力，最后让对方发现根本无法理解"},
    {"if": "protagonists_true_capability_is_about_to_be_revealed","then": "write_the_process_of_others_going_from_dismissal_to_shock","because": "从以为是菜鸟到发现是高手的认知升级过程本身就是爽感"}
  ]',
  '[
    {"template": "【写法】隐藏实力的揭露要分阶段：先让对方以为是运气（这次是碰巧），再让对方意识到是实力（他是故意的），最后让对方发现根本无法理解（他的操作逻辑我看不懂）。每个阶段都是独立的爽点。", "type": "三阶段揭露式", "context": "主角有隐藏实力或技巧时"},
    {"template": "【写法】对方从以为是菜鸟到发现是高手的过程要写出来：先是轻视（这菜鸟），然后是疑惑（这操作不对劲），然后是震惊（他一直在藏实力），最后是重新评估（这人是谁）。这个过程本身就是爽感。", "type": "对方认知升级式", "context": "对手开始察觉主角不简单时"},
    {"template": "【写法】旧的实力即将被完全认可时，提前埋下新的更高层次的能力或秘密。让读者在享受当前爽点的同时，已经对下一个突破产生期待。", "type": "实力叠加式", "context": "一个隐藏实力即将完全暴露时"}
  ]',
  '[
    "一次性把所有实力都展示出来",
    "跳过对方从轻视到震惊的过程",
    "每章都强行安排实力揭露（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '信息差释放写法：隐藏实力分阶段揭露，写出对方从轻视到震惊的认知升级过程。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000002
);

-- ============================================================
-- 16. 情绪递进铺垫写法（游戏）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_emotion_escalation_001',
  'youxi',
  'structure',
  '情绪递进铺垫写法',
  'Medium',
  '[
    {"if": "building_up_to_a_reversal_or_domination_moment","then": "escalate_mockery_and_pressure_step_by_step","because": "游戏题材的爽感来自被嘲讽到极限然后碾压，铺垫越充分逆转越有力"},
    {"if": "protagonist_is_being_underestimated_or_mocked","then": "make_each_step_of_mockery_more_specific","because": "嘲讽越具体越个人化，后续碾压的爽感越强"}
  ]',
  '[
    {"template": "【写法】铺垫要分步走：被当菜鸟（装备/等级被看不起）→被嘲讽操作（具体的操作被嘲讽）→被公开羞辱（在众人面前被嘲讽）→被拿来对比（和强者对比）→被逼表态（赌约/挑战/被逼证明自己）。每一步都要有具体的游戏场景。", "type": "五步递进式", "context": "逆转/碾压场景的铺垫阶段"},
    {"template": "【写法】每一步嘲讽都要比上一步更具体：从针对装备，到针对操作，到针对主角本人。越到后面越个人化，逆转才有必然性。", "type": "嘲讽具体化递进式", "context": "对手持续嘲讽时"},
    {"template": "【写法】铺垫阶段主角的反应要克制：不是没有情绪，而是在积累。通过细节传达内心的积累，不要提前爆发，让读者跟着憋屈。", "type": "主角克制积累式", "context": "主角承受嘲讽的过程中"}
  ]',
  '[
    "铺垫只有一步就直接逆转",
    "每一步嘲讽都一样，没有递进",
    "主角提前爆发，破坏铺垫节奏",
    "每章都强行安排递进铺垫（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '情绪递进铺垫写法：嘲讽要分步递进，越来越具体越来越个人化，主角克制积累。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000002
);

-- ============================================================
-- 17. 配角反应具体化写法（游戏）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'youxi_npc_reaction_detail_001',
  'youxi',
  'psychology',
  '配角反应具体化写法',
  'Medium',
  '[
    {"if": "protagonist_demonstrates_skill_that_shocks_others","then": "write_specific_shock_and_disbelief_reactions","because": "游戏题材配角的震惊要具体化，只写震惊等于没写"},
    {"if": "opponent_is_forced_to_face_protagonists_true_strength","then": "show_opponent_going_from_contempt_to_disbelief","because": "对手从轻蔑到不可置信的过程是游戏题材最有爽感的配角反应"}
  ]',
  '[
    {"template": "【写法】配角的震惊要写出具体的情绪变化：从轻蔑到疑惑到震惊到沉默。每个阶段都要有具体的表现，不能只写他们震惊了。", "type": "情绪变化具体化式", "context": "主角展示出超出预期的实力时"},
    {"template": "【写法】对手的不可置信要写出过程：先是否认（这不可能），然后是动摇（他怎么做到的），然后是沉默（无话可说），最后是重新打量（这人是谁）。不能直接跳到最后。", "type": "对手不可置信过程式", "context": "对手被主角超越时"},
    {"template": "【写法】旁观者的反应要通过具体行为传达：停下来、沉默、重新打量——用这些反应暗示震惊，比直接写震惊更有画面感。", "type": "旁观者具体反应式", "context": "公开场合的实力展示时"}
  ]',
  '[
    "只写众人震惊、全场哗然等空洞描述",
    "配角反应一步到位，没有过程",
    "每章都强行安排配角震惊（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '配角反应具体化写法：情绪变化要具体，对手从轻蔑到不可置信的过程要写出来。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000002
);
