-- ============================================================
-- 都市题材 写作技法种子数据 v2（整合版）
-- 来源：两轮三层分析结果合并
-- 角色名已全部匿名化为 XXX
-- 用途：覆盖 v1，直接 INSERT 到 craft_patterns 表
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
  'urban_dialogue_001',
  'urban',
  'dialogue',
  '对话开场句',
  'High',
  '[
    {
      "if": "protagonist_in_dominant_position OR facing_peer_or_lower",
      "then": "rhetorical_question OR commanding_opener OR dismissive_interrupt",
      "because": "确立主导权，迫使对方进入防御姿态",
      "example": "XXX，你是不是觉得我很好骗？"
    },
    {
      "if": "facing_authority_with_resources",
      "then": "deflect_and_redirect OR retreat_advance_tactic",
      "because": "维持关系比赢口舌之争更重要，太极手法化解潜在冲突",
      "example": "我怎么想的不重要，关键你们赶紧去XXX吧…"
    },
    {
      "if": "need_quick_social_bonding OR building_alliance",
      "then": "exchange_type_opener OR resource_provider_stance",
      "because": "以资源方姿态开场，降低对方防御心，构建合作假象",
      "example": "我有个想法，XXX你听听看。"
    },
    {
      "if": "need_fast_plot_acceleration OR verbal_sparring",
      "then": "short_unmodified_dialogue_rapid_exchange",
      "because": "高频视觉切换模拟紧张节奏，减少阅读阻力",
      "example": "你是谁？ / 我！？"
    }
  ]',
  '[
    {"template": "XXX，你过来一下，有点事。", "type": "命令式", "context": "确立主导地位，适用于同级或下级"},
    {"template": "怎么样，XXX那件事有结果了吗？", "type": "信息索取式", "context": "直接切入主题，跳过寒暄"},
    {"template": "我刚听说XXX，到底怎么回事？", "type": "传闻引入式", "context": "以传闻为引，迫使对方解释"},
    {"template": "XXX，你是不是觉得我很好骗？", "type": "反问施压式", "context": "施加心理压力，博弈优势时使用"},
    {"template": "行了行了，XXX，别跟我来这套。", "type": "打断式", "context": "应对套路，快速终止对方话术"},
    {"template": "我有个想法，XXX你听听看。", "type": "方案提供式", "context": "以资源方姿态开场，拉拢中立方"},
    {"template": "哟，这不是XXX吗，今天怎么有空？", "type": "戏谑式", "context": "对同级或下级，带俯视感"},
    {"template": "关于XXX的事，我想和你谈谈。", "type": "正式谈判式", "context": "正式利益交换场合"},
    {"template": "来，抽根烟，咱们边抽边说。", "type": "物质拉近式", "context": "开启非正式会谈，建立私下信任"},
    {"template": "你站住，XXX那东西是你拿的吧？", "type": "质问突袭式", "context": "掌握证据时，先发制人"}
  ]',
  '[
    "你好，请问现在有时间吗？我想占用您几分钟……（过度礼貌，不符合主角人设）",
    "我感觉心里很难受，能和你说说话吗？（主动暴露脆弱，主角极力避免）",
    "今天的月色真美啊，你有没有想起……（文艺慢开场，节奏断裂）",
    "生命的意义在于……（哲理文艺腔，完全不符合题材调性）"
  ]',
  '{
    "undercurrent": ["笑了笑", "没吭声", "若有所思", "斜睨一眼", "撇撇嘴", "冷笑一声", "不屑地说道"],
    "open_conflict": ["皱眉", "语气冷淡", "反问", "放屁！", "你敢！", "你他妈怎么说话的", "吵个毛"],
    "explosion": ["骂人", "拍桌子", "物理冲突", "啪的一声", "我靠！", "一把抓住", "咣当一声"]
  }',
  '{
    "typical": [
      "XXX，你过来一下，有点事。",
      "不用。（XXX摆摆手）我在对面新买了一套房子…",
      "你是谁？ / 我！？",
      "老四你抱怨个屁，刚才和妹妹们聊天怎么不说热？",
      "可以啊，你当我女朋友就行。（嘴上玩世不恭，心里另有算计）"
    ],
    "boundary": [
      "那我们还多久到XXX？（XXX无奈睁开眼）都他妈没上高速，你就不能闭嘴睡一觉吗？",
      "你他妈当个鸡把大点的小官，真把你牛逼坏了，需要帮你叉会腰不？（面对同级的降维打击）",
      "我怎么想的不重要，关键你们赶紧去XXX吧…（面对上级的油滑转移）"
    ],
    "counter": [
      "今天天气不错。（无目的寒暄，不符合题材）",
      "我内心真的很挣扎，不知道该怎么办……（暴露迷茫，与人设冲突）"
    ]
  }',
  '对话即谈判。策略因对象而异：面对同级/下级用降维打击，面对握有资源的上级用太极化解。每句对话都有明确的功利性目标。',
  'seed',
  1700000000
);

-- ============================================================
-- 2. 对话技法 —— 冲突降温句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_dialogue_002',
  'urban',
  'dialogue',
  '冲突降温句',
  'High',
  '[
    {
      "if": "conflict_peak_reached AND protagonist_winning AND opponent_is_peer",
      "then": "authority_closure OR dismissive_end",
      "because": "赢家不需要解释，直接终止，不给对方反驳空间"
    },
    {
      "if": "conflict_inconvenient_to_win OR opponent_holds_resources",
      "then": "fake_apology OR third_party_face_tactic OR material_distraction",
      "because": "假意退让推进自己的议程，维持关系比输赢更重要"
    },
    {
      "if": "need_establish_benefactor_position",
      "then": "senior_grace_closure",
      "because": "以前辈姿态收场，建立恩惠关系，形成欠人情的结构"
    }
  ]',
  '[
    {"template": "行了，这事到此为止，都别再提了。", "type": "权威收场式", "context": "绝对优势时，不容置疑地终止"},
    {"template": "今天看在XXX的面子上，我就不和你计较了。", "type": "第三方面子式", "context": "借第三方为自己找台阶"},
    {"template": "开个玩笑嘛，XXX你还当真了。", "type": "降级玩笑式", "context": "将严肃冲突降级，化解攻击性"},
    {"template": "算了算了，多大点事，晚上我请大家XXX。", "type": "物质转移式", "context": "用利益转移焦点，快速收场"},
    {"template": "事情已经解决了，大家该干嘛干嘛去。", "type": "驱散式", "context": "避免事态扩大，强行关闭话题"},
    {"template": "（拍了拍对方肩膀）以后注意点就行，没什么大不了的。", "type": "肢体+宽慰式", "context": "用动作彰显胜利者姿态"},
    {"template": "你还年轻，不懂这里面的水深，这事我帮你担了。", "type": "前辈恩惠式", "context": "建立恩惠关系，对方欠人情"},
    {"template": "行，我错了，行了吧？现在可以谈正事了吗？", "type": "假意道歉式", "context": "表面认错，实则推进自己议程"},
    {"template": "我知道你心里不服，不服就憋着。", "type": "强硬收场式", "context": "明确的优势地位，不给反驳空间"},
    {"template": "别吵了，想解决问题就听我的。", "type": "唯一解决者式", "context": "以方案提供者身份强行终止"}
  ]',
  '[
    "对不起，我真的错了，请你一定要原谅我。（真诚无条件道歉，主角极少使用）",
    "我们各退一步好吗？我理解你的感受……（寻求共情与和解，不符合赢家通吃逻辑）",
    "唉，我刚才是不是话说得太重了？其实我心里也不好受。（表露悔意和内疚）"
  ]',
  '{}',
  '{}',
  '冲突收场是赢家的特权。"化解"还是"激化"取决于结果对主角的利弊：体制内权威用太极，同级竞争者直接硬刚摧毁威信。',
  'seed',
  1700000000
);

-- ============================================================
-- 3. 场景转场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_structure_001',
  'urban',
  'structure',
  '场景转场句',
  'High',
  '[
    {
      "if": "scene_needs_time_jump",
      "then": "time_marker_hard_cut",
      "because": "追求叙事效率，省略中间过程，直接标注时间锚点，避免拖慢节奏"
    },
    {
      "if": "scene_needs_space_switch",
      "then": "character_exit_as_signal OR action_driven_switch",
      "because": "人物离场或目标性动作是最自然的切镜信号，无需解释"
    },
    {
      "if": "emotion_needs_reset OR tension_needs_release",
      "then": "external_event_interrupt OR sleep_wake_transition",
      "because": "外部事件或生理状态转换强行中断前一情绪流，为新情节清空情绪底色"
    },
    {
      "if": "need_show_parallel_development",
      "then": "meanwhile_at_location_switch",
      "because": "展示对手或盟友的动态，制造信息差和悬念"
    }
  ]',
  '[
    {"template": "第二天上午，XXX刚到XXX就看到……", "type": "时间+地点切换", "context": "跨天转场，直接入新场景"},
    {"template": "回到XXX后，XXX发现气氛有些不对劲。", "type": "地点标记+新悬念", "context": "返回熟悉场景，引入新冲突"},
    {"template": "等XXX离开后，他才拿出手机拨通了电话。", "type": "人物离场切镜", "context": "展示隐藏行动，制造信息差"},
    {"template": "吃完饭，XXX借口XXX，一个人来到了……", "type": "行动目的驱动", "context": "以目的为驱动，自然切换"},
    {"template": "手机突然响了，是XXX打来的。", "type": "外部事件强切", "context": "强行改变当前场景走向"},
    {"template": "接下来的几天，XXX一直忙着XXX的事。", "type": "时间模糊跳跃", "context": "快速跳过琐碎时段，保持节奏"},
    {"template": "与此同时，在XXX的地方……", "type": "平行叙事切换", "context": "展示对手或盟友动态"},
    {"template": "他想了想，决定先去XXX一趟。", "type": "内心决策驱动", "context": "主角主动切换，逻辑清晰"},
    {"template": "不一会儿，XXX回来了……", "type": "时间压缩切入", "context": "快速推进，省略等待过程"},
    {"template": "挂了电话，他二话不说，直接去了XXX。", "type": "通讯结束+立即行动", "context": "高节奏转场，强调果断"}
  ]',
  '[
    "他走在路上，看着天边的云彩，思绪万千，不知不觉就到了XXX。（抒情慢转场，节奏断裂）",
    "光阴似箭，日月如梭，转眼间又过去了一个星期。（老旧套话，不符合题材调性）",
    "让我们把镜头切换到另一边……（打破第四面墙，破坏沉浸感）"
  ]',
  '{
    "time_signals": ["第二天", "接下来的几天", "过了两天", "不一会儿", "回到XXX后"],
    "space_signals": ["等XXX离开后", "手机突然响了", "挂了电话", "与此同时"],
    "emotion_reset_signals": ["睡眠/清醒状态转换", "外部事件打断", "物件遗留（如纸条、手套）"]
  }',
  '{
    "typical": ["第二天上午，XXX刚到XXX就看到……", "不一会儿，XXX回来了…", "回到XXX的XXX忍不住吐槽几句…"],
    "counter": ["光阴似箭，日月如梭……", "他走在路上思绪万千……"]
  }',
  '转场必须带信息量。每个转场句同时完成切换场景+引入新悬念两个任务，绝不允许纯过渡性文字。',
  'seed',
  1700000000
);

-- ============================================================
-- 4. 章节收尾钩子句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_structure_002',
  'urban',
  'structure',
  '章节收尾钩子句',
  'High',
  '[
    {
      "if": "chapter_ending AND new_action_incoming",
      "then": "action_hook",
      "because": "即将开启新对话或新事件，维持追读惯性"
    },
    {
      "if": "chapter_ending AND partial_secret_revealed",
      "then": "info_gap_hook",
      "because": "制造信息缺口，读者带着疑问进入下一章"
    },
    {
      "if": "chapter_ending AND hidden_crisis_brewing",
      "then": "unease_hook",
      "because": "暗示隐藏危机，情绪上的不安驱动追读"
    },
    {
      "if": "chapter_ending AND protagonist_makes_decision",
      "then": "decision_mystery_hook",
      "because": "主角行动成谜，读者好奇心驱动翻页"
    }
  ]',
  '[
    {"template": "XXX笑了笑，拨通了XXX的电话。", "type": "行动钩子", "context": "即将开启新事件，行动方向成谜"},
    {"template": "正在这时，XXX的短信发了过来，上面只有几个字：XXX。", "type": "情报钩子", "context": "关键新情报，信息量巨大"},
    {"template": "他推开XXX的门，里面的场景让他愣了一下。", "type": "视觉冲击钩子", "context": "制造悬念，强迫翻页"},
    {"template": "看着XXX的背影，他总觉得哪里有些不对劲。", "type": "不安钩子", "context": "暗示隐藏危机或秘密"},
    {"template": "XXX看着他，冷冷地问道：你到底想干什么？", "type": "尖锐质问钩子", "context": "以问题结尾，对抗感强"},
    {"template": "他想了想，心里已经有了主意。", "type": "决策悬念钩子", "context": "行动成谜，制造期待"},
    {"template": "没想到，XXX居然会在这里出现。", "type": "意外登场钩子", "context": "打破现有格局，新变量引入"},
    {"template": "那XXX上，赫然写着XXX。", "type": "线索揭露钩子", "context": "秘密被揭一角，制造紧张"},
    {"template": "他拿起手机，编辑了一条短信发给XXX。", "type": "布局钩子", "context": "新布局开始，内容未知"},
    {"template": "他二话不说，一脚油门踩了下去。", "type": "果断行动钩子", "context": "以极简动作结尾，预示高潮"},
    {"template": "你压到我头发了。（XXX轻声开口）", "type": "暧昧悬念钩子", "context": "情感线收尾，制造暧昧张力"},
    {"template": "妈的，老子追XXX，需要她考虑个屁啊。", "type": "内心吐槽反差钩子", "context": "主角内心独白收尾，喜剧感+期待感"}
  ]',
  '[
    "忙碌的一天终于结束了，他安心地睡了过去。（完全闭合，零追读动力）",
    "夕阳西下，断肠人在天涯。（纯抒情，信息量为零）",
    "经过这件事，他明白了一个深刻的道理：XXX。（总结陈词，失去悬念）"
  ]',
  '{}',
  '{
    "typical": [
      "XXX笑了笑，拨通了XXX的电话。",
      "他推开门，里面的场景让他愣了一下。",
      "你会不会忘记自己叫XXX了！（以质问作为爆点结尾）",
      "看着昏黄路灯下好友的背影，XXX莫名觉得好像有很多故事。（情绪收尾）"
    ],
    "counter": ["忙碌的一天终于结束了，他安心地睡了过去。"]
  }',
  '章节结尾必须留钩子。禁止情感总结收尾和完全闭合收尾。每章结尾指向下一个事件、悬念或决策。',
  'seed',
  1700000000
);

-- ============================================================
-- 5. 心理独白句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_psychology_001',
  'urban',
  'psychology',
  '心理独白句',
  'High',
  '[
    {
      "if": "protagonist_about_to_make_unconventional_decision",
      "then": "insert_brief_rationale_monologue",
      "because": "为主角行为提供合理性，确保读者理解并认同其腹黑操作，避免角色失控",
      "note": "心理 vs 口头内容必须形成对比，制造信息差"
    },
    {
      "if": "protagonist_interacting_with_female_character",
      "then": "inner_thought_contradicts_spoken_words",
      "because": "塑造渣男+清醒人设，内外反差制造喜剧效果和人物魅力"
    },
    {
      "if": "event_just_concluded AND need_summary",
      "then": "penetrating_insight_monologue_with_sharp_conclusion",
      "because": "强化主角超越同龄人的成熟心智，满足读者智力优越感"
    },
    {
      "if": "protagonist_needs_to_show_composure_under_pressure",
      "then": "cold_dismissive_internal_assessment",
      "because": "读者通过主角的冷静判断其掌控力，这是爽感的核心来源"
    }
  ]',
  '[
    {"template": "这狗日的，果然没安好心。", "type": "负面判断式", "context": "对他人动机快速负面定性"},
    {"template": "看来，这件事的突破口还得是XXX。", "type": "战略分析式", "context": "锁定下一步关键目标"},
    {"template": "花XXX换来XXX，这笔买卖倒也不亏。", "type": "成本收益式", "context": "极度理性的利益算账"},
    {"template": "看他那副样子，心里想的无非就是XXX罢了。", "type": "洞察人性式", "context": "将复杂动机简单化，凸显主角阅历"},
    {"template": "就这点道行，也敢在老子面前玩花样。", "type": "轻蔑评估式", "context": "对对手实力的俯视评价"},
    {"template": "傻子嘛，这点事都看不明白。", "type": "智商评估式", "context": "对友方或中立角色的判断"},
    {"template": "行，既然你给我下套，那就别怪我掀桌子了。", "type": "应对策略式", "context": "生成反击计划"},
    {"template": "这倒是个机会，正好可以借着XXX把XXX也办了。", "type": "机会主义式", "context": "一事多用的连锁思维"},
    {"template": "妈的，又被这小妮子拿捏住了。", "type": "无奈享受式", "context": "面对特定女性的无奈，实则享受"},
    {"template": "算了，人在江湖，身不由己，这锅我先背了。", "type": "合理化借口式", "context": "为行为找宏大理由"},
    {"template": "反正我和XXX也不是很熟。（欺骗对方后向读者解释真实关系）", "type": "共谋感建立式", "context": "拉读者入上帝视角"},
    {"template": "坚决不能再让明珠蒙尘了啊。", "type": "目标确立式", "context": "对特定对象的占有和规划意图"}
  ]',
  '[
    "我这样做是不是有点不道德？内心真过意不去。（道德自省，与主角价值观冲突）",
    "万一失败了怎么办？我好害怕。（暴露恐惧，破坏掌控感人设）",
    "为什么没有人能真正理解我？我好孤独。（寻求共鸣，不符合强者心态）",
    "我内心真的很挣扎，不知道该怎么办……（暴露迷茫，主角几乎不允许此状态）"
  ]',
  '{
    "undercurrent": ["哼，蠢货。", "走着瞧。", "有意思。", "你看他那副样。"],
    "open_conflict": ["你他妈有病吧。", "谁给你的勇气？", "敢动我？", "放屁！"],
    "explosion": ["老子弄死你。", "滚蛋！", "给脸不要脸。", "一把抓住XXX"]
  }',
  '{
    "stats": {
      "surface_level_thought": "60%（反应/吐槽/即时判断）",
      "strategic_planning": "35%（利益分析/策略生成/目标规划）",
      "deep_emotional_reflection": "5%（仅在疲惫或特定情感触发时出现）"
    },
    "typical": [
      "这狗日的，果然没安好心。",
      "看来还得加把劲。",
      "真麻烦。",
      "我根本不在乎。",
      "绕来绕去最终还是便宜XXX了。"
    ],
    "boundary": [
      "我真的心动了。（深层情感，使用频率极低）",
      "突然觉得很累。（短暂情绪波动，迅速收回）",
      "蝴蝶振翅可以掀起巨浪…（引入理论合理化自身优势）"
    ],
    "counter": [
      "我是一个普通人，希望能平平淡淡生活。",
      "不知道该怎么办……"
    ]
  }',
  '心理描写是掌控全局愉悦感的来源。所有心理活动服务于目标达成，绝不暴露脆弱。内心与口头的反差是塑造城府的核心手法。',
  'seed',
  1700000000
);

-- ============================================================
-- 6. 节奏控制规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_rhythm_001',
  'urban',
  'rhythm',
  '节奏控制规则',
  'High',
  '[
    {
      "if": "scene_type == tense OR conflict_escalating",
      "then": "short_sentences_max_10_chars + rapid_line_breaks",
      "because": "视觉上的高频切换模拟紧张节奏，85%短句比例"
    },
    {
      "if": "scene_type == relaxed OR emotional_diffuse",
      "then": "mixed_sentences_15_25_chars",
      "because": "长短交错铺垫氛围，弥散性情绪用稍长句子表现无力感"
    },
    {
      "if": "protagonist_completes_power_move OR face_slap_moment",
      "then": "insert_single_line_environment_or_summary",
      "because": "给读者情绪释放节点，如电影慢镜头，强化爽感"
    },
    {
      "if": "dialogue_rounds >= 3_to_5",
      "then": "insert_single_sentence_narration_max_15_chars",
      "because": "避免对话悬浮，保持场景感，叙述插入不干扰对话流畅度"
    },
    {
      "if": "text_scene_too_long OR psychology_overloaded",
      "then": "replace_psychology_with_action_description",
      "because": "物理动作强制将读者注意力从思维域拉回事件域"
    }
  ]',
  '[
    {"template": "人在江湖，身不由己。", "type": "单行段总结", "context": "关键心理转折或装逼后的慢镜头"},
    {"template": "日。（XXX诧异转过头。）", "type": "极短惊讶句", "context": "突发信息冲击时"},
    {"template": "我靠！（XXX忍不住叫了一声。）", "type": "情绪爆发短句", "context": "冲突爆发或意外发现"},
    {"template": "呵，男人！", "type": "单行情绪总结", "context": "打脸/反转后的情绪释放点"},
    {"template": "今年也不是2019，它是2002。", "type": "信息炸弹单句", "context": "核心设定信息投放"},
    {"template": "成人的名利场总是少不了逢场作戏，谁当真谁就是傻瓜。", "type": "总结陈词段", "context": "场景结束后的主角感悟"}
  ]',
  '[
    "通篇超过150字的长段落（作者刻意避免大段心理分析或景物描写）",
    "意识流或复杂蒙太奇手法（所有场景切换清晰直白）",
    "今天真是一个美好的下午啊，我们来讨论文学吧。（文艺长句，节奏断裂）"
  ]',
  '{}',
  '{
    "stats": {
      "paragraph_avg_length": "2.8行",
      "conflict_short_sentence_ratio": "85%",
      "tense_sentence_max_chars": 10,
      "relaxed_sentence_range": [15, 25],
      "dialogue_narration_interval": "3-5轮对话插入一次叙述",
      "narration_insert_max_chars": 15,
      "single_line_paragraph": "High频率，用于强调和情绪节点"
    },
    "contrast": {
      "intense_emotion": "短促咒骂式独白 + 简短段落（爆发型）",
      "diffuse_emotion": "稍长叙述句 + 稍长段落（弥散型）"
    }
  }',
  '节奏由目的性事件驱动，不由情绪驱动。目的未达成则持续紧绷，目的达成则迅速转场，不拖情绪尾巴。',
  'seed',
  1700000000
);

-- ============================================================
-- 7. 描写技法规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_description_001',
  'urban',
  'description',
  '描写技法规则',
  'High',
  '[
    {
      "if": "important_female_character_first_appearance",
      "then": "overall_manner_dynamic THEN local_feature THEN clothing_accessories",
      "because": "先用动态抓眼球，再用局部聚焦，最后用服饰暗示身份，描写服务角色塑造而非纯粹的美"
    },
    {
      "if": "need_show_social_status OR identity",
      "then": "use_brand_price_product_model_as_symbol",
      "because": "消费符号快速建立角色社会坐标，比形容词更有说服力"
    },
    {
      "if": "need_show_protagonist_composure_and_control",
      "then": "describe_interaction_with_objects_in_skilled_unhurried_way",
      "because": "熟练不在乎的小动作比直接说他很成熟更有说服力，行为暗示的典范"
    },
    {
      "if": "need_tense_or_oppressive_atmosphere",
      "then": "use_onomatopoeia_and_strong_sensory_description",
      "because": "直接感官冲击快速将读者代入角色生理和心理状态"
    }
  ]',
  '[
    {"template": "石磨蓝的牛仔裤", "type": "服饰符号", "context": "定义社会阶层"},
    {"template": "洗得发白的帆布鞋", "type": "磨损符号", "context": "暗示经济状况"},
    {"template": "碎花裙摆在夏风中轻轻飘荡", "type": "动态开场描写", "context": "女性角色登场，先抓动态"},
    {"template": "带着油漆味的双手", "type": "气味+物件", "context": "暗示职业身份"},
    {"template": "眼神里有一种被遗弃的小动物感", "type": "情绪气质描写", "context": "引发保护欲"},
    {"template": "精致的名片在夜色中滑过一道弧线落在地上", "type": "动态物品描写", "context": "表现主角态度，不屑"},
    {"template": "直接把裤腿卷到膝盖，一屁股坐在路牙子上，连弹烟灰都很有节奏感", "type": "行为气质描写", "context": "主角老练掌控感"},
    {"template": "扭扭捏捏，抽烟时把头转过去，快速吸一口然后把烟蒂藏在身后", "type": "对比行为描写", "context": "衬托主角，他人的生涩"}
  ]',
  '[
    "她长得很美，像仙女一样。（空洞形容词，无社会信息）",
    "天空很蓝，白云很白。（纯景物，无叙事功能）",
    "他感到一种宇宙般的孤独。（抽象意识流，不符合题材风格）"
  ]',
  '{}',
  '{
    "stats": {
      "sensory_channels": {"visual": "90%", "auditory": "5%", "tactile": "4%", "olfactory": "1%"},
      "description_type": {"action_based": "70%", "static_state": "30%"},
      "first_appearance_avg_chars": "50字以内",
      "description_order": "整体气质/动态 → 局部特征 → 服饰配饰"
    },
    "contrast_cases": {
      "protagonist_smoking": "姿态老练洒脱，弹烟灰有节奏感（掌控感）",
      "sidekick_smoking": "扭扭捏捏，藏烟蒂，跟鹤嘴壶似的（生涩学生气）",
      "reason": "通过对比鲜明的动作细节，精准刻画社会经验差异"
    }
  }',
  '描写服从叙事。用物件和行为替代形容词，所有描写关联角色社会处境。对比描写是刻画角色差异的最高效手法。',
  'seed',
  1700000000
);

-- ============================================================
-- 8. 叙事结构规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_structure_003',
  'urban',
  'structure',
  '叙事结构规则',
  'High',
  '[
    {
      "if": "need_establish_protagonist_authority",
      "then": "arrange_lower_level_challenger_for_dimensional_strike",
      "because": "降维打击抬升主角地位，使成长路径清晰可见"
    },
    {
      "if": "plot_pacing_slow OR resource_acquisition_needed",
      "then": "introduce_gatekeeper_then_unconventional_bypass",
      "because": "闯关模式为资源获取提供合理性和爽感"
    },
    {
      "if": "need_introduce_new_resource_or_opportunity",
      "then": "embed_in_flyer_ad_or_offhand_remark",
      "because": "于无声处听惊雷，凸显主角发现机会的敏锐眼光"
    },
    {
      "if": "protagonist_demonstrating_information_advantage",
      "then": "rapid_fire_precise_info_to_establish_authority",
      "because": "信息即权力，精准投放快速打破僵局，建立不对等话语权"
    }
  ]',
  '[
    {"template": "先做小事，再搞大事。", "type": "战略独白", "context": "主角规划阶段"},
    {"template": "这就是生意。", "type": "价值观总结", "context": "完成一次资源交换后"},
    {"template": "咱们合作一下。", "type": "结盟邀请", "context": "拉拢中立方"},
    {"template": "把证据拿出来。", "type": "主导权确认", "context": "信息博弈时"},
    {"template": "这钱给你。", "type": "物质解决式", "context": "快速终结非核心矛盾"}
  ]',
  '[
    "我想过平淡的生活。（与主角进取人设冲突）",
    "今天天气真好，我们去郊游吧。（无目的性活动，不符合题材节奏）",
    "非线性叙事、倒叙插叙（故事线始终单向线性）"
  ]',
  '{
    "undercurrent": ["开始布局", "话里有话", "互相试探", "报价单", "合同附件"],
    "open_conflict": ["当面嘲讽", "挑衅", "摊牌", "数据对比", "财务质疑"],
    "explosion": ["砸车", "打人", "彻底决裂", "毁约", "撤资"]
  }',
  '{
    "stats": {
      "chapter_hook_types": {"action_start": "60%", "dialogue_start": "30%", "environment_start": "10%"},
      "chapter_ending_types": {"suspense_hook": "50%", "action_cliffhanger": "30%", "emotional_resonance": "20%"},
      "climax_position": "章节后半段60-80%处",
      "chapter_closure": "Semi-open（小闭环+新钩子）",
      "event_cycle_chapters": "1-3章完成一个事件闭环",
      "foreshadowing_recovery_span": "2-5章内回收"
    },
    "conflict_resolution_logic": {
      "vs_authority_with_resources": "太极化解（软化+转移+给台阶）",
      "vs_peer_competitor": "直接硬刚（摧毁威信+立威）",
      "decision_basis": "取决于冲突结果对主角的利弊，而非情绪"
    }
  }',
  '结构即利益链。化解还是激化冲突，取决于结果对主角的利弊。每章围绕获取资源-建立人脉-压制对手-获利展开，有明确目的。',
  'seed',
  1700000000
);

-- ============================================================
-- 9. 信息密度规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_info_density_001',
  'urban',
  'info_density',
  '信息密度规则',
  'High',
  '[
    {
      "if": "need_introduce_new_resource_or_opportunity",
      "then": "embed_info_in_flyer_ad_or_offhand_remark",
      "because": "于无声处听惊雷，凸显主角发现机会的敏锐，强化先知能力"
    },
    {
      "if": "protagonist_needs_to_demonstrate_superiority",
      "then": "rapid_fire_precise_unknown_info_to_opponent",
      "because": "信息即权力，精准投放打破僵局，建立不对等话语权"
    },
    {
      "if": "chapter_approaching_end AND need_next_chapter_setup",
      "then": "introduce_new_name_location_event_without_explanation",
      "because": "制造信息缺口，读者带着疑问进入下一章，核心追读技巧"
    },
    {
      "if": "need_anchor_time_period",
      "then": "use_specific_product_price_event_as_era_marker",
      "because": "具体可感的时代符号比抽象说明更能触发读者代入感"
    }
  ]',
  '[
    {"template": "XXX招收校园代理，有意请电联……（传单/广告发现机会）", "type": "机会引入式", "context": "引入核心商业机会"},
    {"template": "XXX是985和211，XXX也就是个二本…（通过对比引入信息）", "type": "对比信息式", "context": "快速建立信息坐标"},
    {"template": "前世XXX年后的同学聚会上，XXX给XXX敬酒时，杯沿都要低三寸。（开上帝视角预告未来）", "type": "预言式信息", "context": "增加当前互动的情感分量"},
    {"template": "今年也不是2019，它是2002。", "type": "核心设定信息炸弹", "context": "最重要的单一信息点投放"},
    {"template": "美国佬正准备打XXX（国际时事锚定时代）", "type": "时代坐标式", "context": "以时事定位时间背景"},
    {"template": "XXX，销售价XXX人民币（具体产品型号+价格）", "type": "消费水平锚定式", "context": "精准定位时代消费水平"}
  ]',
  '[
    "大段说明文式信息介绍（所有背景信息必须融入对话和情节）",
    "故弄玄虚的谜语人式信息投放（主角掌握的信息快速转化为行动和结果）"
  ]',
  '{}',
  '{
    "stats": {
      "new_info_points_per_chapter": "3-4个（人物/事件/资源）",
      "delivery_method": "主要通过对话和行动，而非旁白说明",
      "foreshadowing_to_payoff_span": "2-5章",
      "info_position": "章节结尾密集，引导追读"
    },
    "info_strategy_by_target": {
      "close_friend": "可以透露未来信息，试探确认，即使对方不信也无伤大雅",
      "business_partner_or_rival": "绝不透露来源，转化为商业嗅觉或前瞻性眼光包装"
    }
  }',
  '信息即筹码。每个数据点的更新代表主角势力版图的扩张。信息投放因对象不同策略截然不同。',
  'seed',
  1700000000
);

-- ============================================================
-- 10. 对话收尾句（都市）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_dialogue_close_001',
  'urban',
  'dialogue',
  '对话收尾句',
  'High',
  '[
    {"if": "protagonist_won_the_exchange AND opponent_is_peer_or_lower","then": "drop_final_line_and_leave_or_redirect_attention","because": "都市主角赢了不需要庆祝，扔下最后一句话然后立刻转移注意力到下一件事，这种不在乎本身就是最强的碾压"},
    {"if": "protagonist_needs_to_exit_from_authority_or_resource_holder","then": "end_with_face_saving_redirect_that_advances_own_agenda","because": "面对握有资源的上级，收场时要给对方台阶，但同时把话题引向对自己有利的方向，太极收场"},
    {"if": "dialogue_reached_stalemate_and_both_sides_need_to_step_back","then": "use_material_or_practical_redirect_to_end_standoff","because": "都市冲突的化解靠利益而不是情感，用一个实际的提议或行动来打破僵局，比继续争论更有效"},
    {"if": "protagonist_wants_to_leave_information_gap_as_leverage","then": "end_with_partial_information_that_makes_opponent_need_protagonist","because": "都市主角的核心优势是信息差，收场时故意留一个对方需要但没有的信息，让对方主动来找"}
  ]',
  '[
    {"template": "【写法】主角说完最后一句话，不等对方回应，直接做下一件事（拿起手机、走向门口、叫服务员），用行动宣告对话结束。这个行动要和本章的情节走向有关，不是随机的。", "type": "行动终止式", "context": "主角占优势时的收场"},
    {"template": "【写法】主角用一句话把当前争议转化为一个实际问题（"这个先放一放，XXX那边更急"），然后把话题引向对自己有利的方向。对方的反应要体现出被主导了节奏。", "type": "议程转移式", "context": "僵局时主动掌握下一步"},
    {"template": "【写法】主角故意说一句话，这句话包含一个对方需要但主角没有说完整的信息，然后停下来，让对方主动追问。这个信息必须是本章已经建立的某个线索。", "type": "信息钩子式", "context": "为下一次交锋建立筹码"},
    {"template": "【写法】对话结束时，主角不做任何评价，只是用一个简单的动作（点头、签字、放下某件东西）来确认结果，让对方自己意识到这场对话的输赢。", "type": "无言确认式", "context": "谈判或利益交换后的收场"},
    {"template": "【写法】主角用一句话给对方一个台阶，但这句话同时暗示了主角掌握着更多信息或资源，让对方在接受台阶的同时意识到自己处于劣势。", "type": "给台阶暗示优势式", "context": "面对上级或资源方时的收场"}
  ]',
  '[
    "主角主动道歉或认错来结束对话（破坏城府人设）",
    "用和本章剧情无关的感悟或哲理来收场（脱离剧情）",
    "收场时暴露主角的真实情绪或弱点（破坏掌控感）",
    "引入本章没有出现过的新信息来打断对话（外挂元素）"
  ]',
  '{}',
  '{}',
  '都市对话收尾从本次交锋的利益格局出发：赢了用行动宣告，面对上级用太极给台阶，僵局用实际提议打破。收尾要从本章已有的信息和情节里生长，禁止外挂元素和情感化收场。',
  'seed',
  1700000000
);

-- ============================================================
-- 11. 冲突升级句（都市）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_conflict_escalation_001',
  'urban',
  'conflict',
  '冲突升级句',
  'High',
  '[
    {"if": "user_instruction_implies_confrontation AND conflict_is_about_interests","then": "escalate_by_raising_the_stakes_with_specific_numbers_or_facts","because": "都市冲突的升级靠具体的利益数字和事实，不靠情绪——谁掌握更多具体信息谁就占优势"},
    {"if": "conflict_is_verbal_and_needs_to_escalate","then": "have_one_side_reveal_information_the_other_thought_was_secret","because": "都市冲突升级的关键转折点是信息暴露——对方以为主角不知道的事被主角说出来，局势立刻逆转"},
    {"if": "conflict_involves_public_setting_AND_needs_maximum_impact","then": "use_audience_reaction_to_amplify_the_power_shift","because": "都市冲突在公开场合的升级，旁观者的反应（沉默、窃笑、倒吸冷气）是权力转移的放大器"},
    {"if": "conflict_is_about_to_peak","then": "use_a_specific_piece_of_evidence_or_action_from_this_chapter","because": "都市冲突的爆发点必须是本章已经建立的某个具体事实或行动，不能是凭空出现的新信息"}
  ]',
  '[
    {"template": "【写法】冲突升级时，主角说出一个具体的数字、名字或事实，这个信息对方以为主角不知道。说出来之后，不要立刻解释主角怎么知道的，让信息本身制造冲击。", "type": "信息暴露逆转式", "context": "都市冲突的核心升级手法"},
    {"template": "【写法】冲突升级时，用在场旁观者的反应来标记权力的转移——他们从支持对方到沉默到倒向主角，这个过程要通过具体的动作或表情来展示，不要用旁白说明。", "type": "旁观者倒戈式", "context": "公开场合的冲突升级"},
    {"template": "【写法】冲突升级时，主角把对方的行为或言论和一个更大的利益格局挂钩（"你这样做的后果是XXX"），让对方意识到自己的处境比想象的更糟糕。", "type": "利益格局升级式", "context": "利益冲突的升级"},
    {"template": "【写法】冲突的最后一个升级点，用本章已经出现过的一个具体物件、合同条款或人物关系作为证据，让对方无法否认。这个证据要在本章早些时候已经出现过。", "type": "本章证据触发爆发式", "context": "冲突爆发的最后触发点"}
  ]',
  '[
    "冲突升级靠提高音量或加感叹号（没有实质内容的情绪堆砌）",
    "引入和本章剧情无关的新矛盾来升级冲突（外挂冲突）",
    "主角在冲突升级过程中暴露情绪或弱点（破坏城府人设）",
    "冲突爆发的触发点是本章从未出现过的新信息（外挂触发）"
  ]',
  '{}',
  '{}',
  '都市冲突升级靠信息暴露和利益格局，不靠情绪堆砌。升级的关键是主角掌握对方不知道自己知道的信息，爆发点必须来自本章已有的具体事实。禁止外挂新矛盾。',
  'seed',
  1700000000
);

-- ============================================================
-- 12. 开章与转场钩子（都市）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_chapter_transition_001',
  'urban',
  'structure',
  '开章与转场钩子',
  'High',
  '[
    {"if": "user_instruction_implies_new_chapter AND previous_chapter_ended_on_action_or_decision","then": "open_at_the_immediate_consequence_of_that_action","because": "都市节奏快，新章节应该直接从上章行动的后果开始，不要用时间标记或环境描写拉开距离"},
    {"if": "user_instruction_implies_scene_switch_to_new_location","then": "use_protagonists_purposeful_movement_as_transition","because": "都市主角的每个行动都有目的，用主角前往某地的动作来驱动转场，读者跟着目的走，不需要额外解释"},
    {"if": "user_instruction_implies_time_skip","then": "mark_time_with_a_specific_change_in_situation_not_just_a_date","because": "都市时间跳跃要用具体的情况变化来标记，不是日期，读者需要知道跳过的时间里发生了什么"},
    {"if": "user_instruction_implies_parallel_storyline","then": "connect_the_two_scenes_through_a_shared_interest_or_conflict","because": "都市的平行叙事要通过共同的利益或冲突来连接，让读者感受到两条线之间的张力"}
  ]',
  '[
    {"template": "【写法】新章节第一句话就是上章行动的直接后果（电话打通了、对方来了、事情成了或没成），不要用时间标记或环境描写作为缓冲。", "type": "后果直入式开章", "context": "上章以行动或决定结尾后的新章节"},
    {"template": "【写法】转场时，用主角正在做的一个具体动作（打电话、开车、走进某个地方）来驱动切换，这个动作要和用户指令里的意图直接对应。", "type": "目的动作驱动转场", "context": "用户指令明确指向新场景"},
    {"template": "【写法】时间跳跃时，用一句话同时说明时间长度和这段时间里发生的关键变化，然后直接进入新状态。不要只说时间，要说变化。", "type": "变化标记时间跳跃", "context": "需要时间跳跃时"},
    {"template": "【写法】切换到另一条故事线时，找到两条线之间的一个共同利益点或冲突点，用这个点作为连接，让读者感受到两条线之间的关联。", "type": "利益关联平行转场", "context": "平行叙事的场景切换"}
  ]',
  '[
    "用"第二天上午""接下来的几天"等时间标记直接开章，不承接上章的行动后果（硬切）",
    "开章用大段环境描写来建立氛围（拖慢节奏）",
    "转场时引入上章没有出现过的新元素（外挂转场）",
    "转场方式和用户指令的意图脱节（自行决定跳跃方式）"
  ]',
  '{}',
  '{}',
  '都市开章和转场遵循目的驱动原则：新章节从上章行动的后果开始，转场用主角的目的性动作驱动，时间跳跃用变化而非日期标记。禁止硬套时间标记，禁止脱离用户指令意图的自行跳跃。',
  'seed',
  1700000000
);

-- ============================================================
-- 13. 连锁震惊写法（都市）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_chain_shock_001',
  'urban',
  'psychology',
  '连锁震惊写法',
  'Medium',
  '[
    {"if": "protagonist_achieves_something_that_creates_cognitive_gap","then": "write_layered_shock_reactions_from_low_to_high","because": "爽感不是一个点而是一条线，同一件事要让不同层级的人依次震惊，每层反应都要具体，不能只写众人震惊"},
    {"if": "protagonist_demonstrates_unexpected_capability_or_resource","then": "show_each_level_reassessing_protagonist","because": "层级越高的人重新评估主角，说明主角的影响力在扩大，这是都市题材爽感的核心放大器"}
  ]',
  '[
    {"template": "【写法】主角完成一件事后，按层级从低到高依次写反应：普通员工/同事层（这怎么可能）→中层管理层（他是怎么做到的）→老板/决策层（这个人要重新看待）。每层反应要有具体的行为或语言，不能只写震惊两个字。", "type": "三层递进式", "context": "主角展示出超出预期的能力或资源时"},
    {"template": "【写法】对手/竞争者的反应要单独写：先是不相信（这不可能），然后是开始怀疑自己的判断（难道我看错了），最后是重新评估（这个人是威胁）。三步走，不能跳步。", "type": "对手重新评估式", "context": "主角在竞争场合展示实力时"},
    {"template": "【写法】旁观者的反应要有具体细节：他们停下来、交换眼神、压低声音议论——用这些具体行为来传达震惊，而不是直接写他们震惊了。", "type": "旁观者具体化式", "context": "公开场合的爽点时刻"}
  ]',
  '[
    "只写众人震惊、全场哗然等空洞描述（没有具体反应）",
    "所有层级同时震惊（失去层次感）",
    "每章都强行安排震惊反应（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '连锁震惊写法：同一件事让不同层级的人依次震惊，从低到高，每层反应具体化。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);

-- ============================================================
-- 14. 信息差释放写法（都市）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_info_gap_release_001',
  'urban',
  'structure',
  '信息差释放写法',
  'Medium',
  '[
    {"if": "protagonist_has_advantage_others_dont_know_about","then": "control_who_knows_what_and_when","because": "信息差的价值在于分层释放，同一个优势让不同的人在不同时机知道，每次释放都是独立的爽点"},
    {"if": "protagonist_secret_or_advantage_is_about_to_be_revealed","then": "write_the_process_of_others_going_from_not_knowing_to_knowing","because": "从不知道到知道的过程本身就是爽感来源，不能直接跳到结果"}
  ]',
  '[
    {"template": "【写法】控制信息释放的顺序：先让最亲近的人半信半疑，再让竞争对手开始察觉不对劲，最后让更大范围的人知道。每次释放时，写出对方从不知道到知道的具体过程，不能直接跳到结果。", "type": "分层释放式", "context": "主角有隐藏优势或秘密时"},
    {"template": "【写法】对方意识到信息差的过程要写出来：先是觉得奇怪（这不对劲），然后开始怀疑（他是不是早就知道了），最后确认（原来他一直都知道）。这个过程本身就是爽感。", "type": "对方觉察过程式", "context": "对手开始意识到主角的优势时"},
    {"template": "【写法】旧的信息差即将被完全揭晓时，提前埋下新的信息差。让读者在享受当前爽点的同时，已经对下一个秘密产生期待。", "type": "信息差叠加式", "context": "一个优势即将完全暴露时"}
  ]',
  '[
    "一次性把所有优势都展示出来（浪费信息差价值）",
    "跳过对方从不知道到知道的过程（失去爽感来源）",
    "每章都强行安排信息差释放（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '信息差释放写法：控制谁先知道谁后知道，写出对方从不知道到知道的过程。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);

-- ============================================================
-- 15. 情绪递进铺垫写法（都市）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_emotion_escalation_001',
  'urban',
  'structure',
  '情绪递进铺垫写法',
  'Medium',
  '[
    {"if": "building_up_to_a_face_slap_or_reversal_moment","then": "escalate_humiliation_or_pressure_step_by_step","because": "爽点前的铺垫要有层次，每一步比上一步更具体更个人化，这样爆发时的爽感才会成倍放大"},
    {"if": "protagonist_is_being_underestimated_or_pressured","then": "make_each_step_of_pressure_more_specific_and_personal","because": "压力越具体越个人化，后续反击的爽感越强"}
  ]',
  '[
    {"template": "【写法】铺垫要分步走，不能跳步：被忽视（对方根本不把主角放在眼里）→被轻视（对方开始主动贬低）→被当众否定（在公开场合被否定）→被拿来对比（和更成功的人对比）→被逼表态（被逼到必须回应的地步）。每一步都要有具体的场景和对话。", "type": "五步递进式", "context": "打脸/逆转场景的铺垫阶段"},
    {"template": "【写法】每一步的压力要比上一步更个人化：从针对主角的能力，到针对主角的背景，到针对主角最在意的东西。越到后面越触碰底线，爆发才有必然性。", "type": "压力个人化递进式", "context": "对手持续施压时"},
    {"template": "【写法】铺垫阶段主角的反应要克制：不是没有情绪，而是压着。通过细节（握紧的手、沉默、眼神变化）传达内心的积累，不要提前爆发。", "type": "主角克制积累式", "context": "主角承受压力的过程中"}
  ]',
  '[
    "铺垫只有一步就直接爆发（失去层次感）",
    "每一步压力都一样，没有递进（读者感受不到积累）",
    "主角提前爆发，破坏铺垫节奏",
    "每章都强行安排递进铺垫（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '情绪递进铺垫写法：爽点前的压力要分步递进，每步比上一步更具体更个人化。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);

-- ============================================================
-- 16. 配角反应具体化写法（都市）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'urban_npc_reaction_detail_001',
  'urban',
  'psychology',
  '配角反应具体化写法',
  'Medium',
  '[
    {"if": "protagonist_does_something_impressive_or_unexpected","then": "write_specific_behavioral_and_psychological_changes_in_supporting_characters","because": "配角的反应是爽感的放大器，但必须具体化才有效果，只写震惊两个字等于没写"},
    {"if": "antagonist_or_rival_is_forced_to_reassess_protagonist","then": "show_the_process_of_reassessment_not_just_the_result","because": "对手重新评估主角的过程本身就是爽感，不能只写结果"}
  ]',
  '[
    {"template": "【写法】配角的反应要写三个层面：行为变化（他做了什么不同的事）、语言变化（他说话的语气/内容变了）、心理变化（他内心的判断变了）。三个层面都写到，反应才立体。", "type": "三层面具体化式", "context": "主角展示出超出预期的能力时"},
    {"template": "【写法】对手/竞争者的不可置信要写出过程：先是否认（这不可能），然后是动摇（难道是真的），然后是沉默（无话可说），最后是重新打量（这个人不简单）。不能直接跳到最后。", "type": "对手不可置信过程式", "context": "对手被主角超越或击败时"},
    {"template": "【写法】旁观者的反应要通过具体行为传达：停下来、交换眼神、压低声音、主动靠近——用这些行为暗示震惊，比直接写震惊更有画面感。", "type": "旁观者行为暗示式", "context": "公开场合的爽点时刻"}
  ]',
  '[
    "只写众人震惊、全场哗然、无人不惊等空洞描述",
    "配角反应一步到位，没有过程",
    "所有配角反应都一样，没有差异化",
    "每章都强行安排配角震惊（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '配角反应具体化写法：写出行为变化、语言变化、心理变化三个层面，对手的不可置信要写过程不写结果。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);
