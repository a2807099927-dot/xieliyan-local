-- ============================================================
-- 历史穿越题材 写作技法种子数据 v1
-- 来源：三层分析结果整合
-- 角色名已全部匿名化为 XXX
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
  'lishi_dialogue_001',
  'lishi',
  'dialogue',
  '对话开场句',
  'High',
  '[
    {
      "if": "protagonist_needs_to_assert_authority OR issuing_orders",
      "then": "use_imperial_directive_opener OR formal_inquiry_opener",
      "because": "君主身份要求对话本身即是权力行使，语言即行动",
      "note": "历史题材主角多为君主/高位者，开场句必须体现身份感"
    },
    {
      "if": "protagonist_wants_to_show_composure_and_control",
      "then": "use_deliberate_calm_opener OR topic_shift_opener",
      "because": "穿越者主角通过现代思维的冷静对比古代的惊慌，形成独特爽点"
    },
    {
      "if": "need_fast_info_exchange OR tense_situation",
      "then": "use_unmodified_direct_question",
      "because": "省略修饰使对话成为情节推进主体，模拟真实争论的快速攻防"
    }
  ]',
  '[
    {"template": "朕且问你，XXX是怎么一回事？", "type": "君主质询式", "context": "掌握信息优势时追问"},
    {"template": "XXX，你觉得此事当如何处置？", "type": "征询意见式", "context": "试探臣属立场"},
    {"template": "劳烦XXX走一遭，替朕去办XXX。", "type": "君主委命式", "context": "下达任务，不容置疑"},
    {"template": "朕意已决，明日便XXX，诸卿不必多言。", "type": "宣布决策式", "context": "强行终止争论"},
    {"template": "你可知道，那XXX如今是何等光景？", "type": "信息探查式", "context": "以提问掌握主动权"},
    {"template": "此事不急，先说说XXX。", "type": "议题转移式", "context": "主动转换话题，掌控节奏"},
    {"template": "既然人都到齐了，那朕便直言了……", "type": "宣示式开场", "context": "正式场合，确立发言权"},
    {"template": "朕有一问，还请XXX为朕解惑。", "type": "求教式", "context": "以低姿态获取信息，实则控场"},
    {"template": "说来说去，还是回到了XXX上……你们说，是不是？", "type": "归纳引导式", "context": "引导讨论方向"},
    {"template": "杨卿何意？", "type": "极简质询式", "context": "警惕状态下的短促发问，含戒备"}
  ]',
  '[
    "哥几个，咱们聊聊？（口语化，不符合历史题材身份感）",
    "今夜月色正好，不知诸卿有何高见？（文绉绉且缺乏实际指向）",
    "关于XXX这事，朕也是醉了。（现代网络俚语，破坏历史氛围）"
  ]',
  '{
    "undercurrent": ["微微蹙眉", "一时情急", "却不料", "面色丝毫不变", "怔在当场", "心中翻腾起来", "隐隐", "沉默不语", "若有所思"],
    "open_conflict": ["当众冷笑", "再度迫上", "厉声以对", "昂然反问", "愤愤难平", "呵斥", "质问", "板起脸", "不等对方话音落地"],
    "explosion": ["勃然大怒", "拍案", "直接拔出刀来", "目眦欲裂", "奋力一推", "气急败坏", "再也忍耐不住", "涕泪交加"]
  }',
  '{
    "typical": [
      "有何不可吗？（XXX闻言只是微微一笑，倒似浑不在意）",
      "叫我大家就好，坐着说就行。（穿越者特有的放下身段）",
      "是吗？（XXX微微一怔，犹豫了片刻，不过很快回过神来）",
      "官家！（XXX一时情急，连称呼都改了）"
    ],
    "boundary": [
      "哦……（XXX一时恍惚，几乎脱口而出。）",
      "朕要召回XXX！（石破天惊，冲击力靠对话本身而非修饰）"
    ],
    "counter": [
      "今天天气真好，我们出去走走吧。（无目的寒暄）",
      "我感觉好累，能和你聊聊吗？（暴露脆弱）"
    ]
  }',
  '对话即权力行使。历史题材主角身份决定了开场句必须带身份感：君主质询、委命、宣示。穿越者视角的冷静与古人惊慌形成独特爽点。',
  'seed',
  1700000000
);

-- ============================================================
-- 2. 对话技法 —— 冲突降温句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_dialogue_002',
  'lishi',
  'dialogue',
  '冲突降温句',
  'High',
  '[
    {
      "if": "conflict_peak_reached AND protagonist_holds_supreme_authority",
      "then": "authority_termination OR decision_reserved",
      "because": "君主终止争论不需要理由，权威本身即理由"
    },
    {
      "if": "conflict_involves_multiple_factions AND no_clear_winner",
      "then": "topic_shift_to_higher_priority OR parallel_execution",
      "because": "用更紧迫的国事压制内部矛盾，是穿越者主角最常用的政治手段"
    },
    {
      "if": "need_to_protect_subordinate OR diffuse_personal_conflict",
      "then": "take_blame_tactic OR emotional_appeal_to_larger_cause",
      "because": "主动揽责建立君臣恩义，情感牌服务于政治目的"
    }
  ]',
  '[
    {"template": "也罢，此事到此为止，不必再议。", "type": "权威终止式", "context": "君主直接叫停，不容置疑"},
    {"template": "朕知道了，此事朕自有决断，都退下吧。", "type": "收归决策式", "context": "将决策权收归己有，延后处理"},
    {"template": "此事暂且搁置，先议XXX，不可因小失大。", "type": "议题转移式", "context": "用更高优先级压制当前冲突"},
    {"template": "就依XXX所言，先如此处置，后续再看。", "type": "选择性采纳式", "context": "快速结束争论，实则保留主动权"},
    {"template": "（一声叹气）……你们说的都有道理，但时局艰难，且相忍为国吧。", "type": "大局情感式", "context": "诉诸大局调和，适用于势均力敌的派系之争"},
    {"template": "此事朕亦有过，不必只责于XXX。", "type": "主动揽责式", "context": "为下属解围，建立恩义"},
    {"template": "朕乏了，今日便到这里，明日再议。", "type": "以身退场式", "context": "以身体状态为由强制中断"},
    {"template": "你们以为朕不知道其中利害吗？朕心里有数。", "type": "反向施压式", "context": "暗示自己掌控全局，令争论者噤声"},
    {"template": "此事既然有争议，那便两策并行，分头去做，看谁能成。", "type": "竞争验证式", "context": "将内部矛盾转化为外部行动"},
    {"template": "都别说了，此事朕意已决，若有差池，朕一力承担。", "type": "个人信誉担保式", "context": "以信誉强行压制异议"}
  ]',
  '[
    "求求你们不要再吵了，朕心烦意乱。（纯粹情感恳求，丧失君主权威）",
    "你们自己看着办吧，朕不管了。（完全放弃权威）",
    "此事孰是孰非，且看天意如何。（诉诸鬼神，脱离穿越者现代理性思维）"
  ]',
  '{}',
  '{}',
  '历史题材的冲突降温以权威终止为主，辅以政治手段（议题转移、竞争验证）。穿越者主角不依赖情感道歉，而是用现代政治智慧重构古代权力关系。',
  'seed',
  1700000000
);

-- ============================================================
-- 3. 场景转场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_structure_001',
  'lishi',
  'structure',
  '场景转场句',
  'High',
  '[
    {
      "if": "time_jump_is_meaningful_to_plot（等待/煎熬/时局变化）",
      "then": "use_direct_time_marker",
      "because": "明确时间推进让读者感受到等待感和历史进程的厚重感"
    },
    {
      "if": "external_conflict_ends_need_transition_to_inner_state",
      "then": "use_transitional_conjunction（然而/不过/回过神来）",
      "because": "制造语意停顿，自然将读者注意力从外部事件引向内心世界"
    },
    {
      "if": "need_fast_scene_switch_with_continuous_timeline",
      "then": "use_storyteller_style_marker（且说/另一边/话分两头）",
      "because": "古典说书人式硬切，保持叙事紧凑，同时带有历史题材特有的叙事风格"
    },
    {
      "if": "environment_change_signals_time_or_emotion_shift",
      "then": "use_environment_as_implicit_time_marker",
      "because": "比直接说时间更具文学性和画面感，符合历史题材的厚重氛围"
    }
  ]',
  '[
    {"template": "翌日清晨/中午/傍晚，XXX处……", "type": "时间+地点切换", "context": "标准跨天或跨时段转场"},
    {"template": "又过了数日，XXX已是XXX（新景象）。", "type": "时间跳跃式", "context": "跳过琐碎过程，直接展示变化结果"},
    {"template": "且说，就在XXX议事的同时，另一边，在XXX的XXX却……", "type": "说书人平行切换", "context": "同时展示两处场景，制造信息差"},
    {"template": "话分两头，且不提XXX这里如何，只说那XXX……", "type": "说书人分叙式", "context": "古典叙事风格转场，历史题材专用"},
    {"template": "就这样，此事暂告一段落，而时间也来到了XXX。", "type": "事件闭合+时间推进", "context": "一个事件弧线结束，开启新阶段"},
    {"template": "然而，事情并没有到此为止，仅仅是隔了一日，便有新的讯息传来……", "type": "转折推进式", "context": "制造意外感，维持紧张"},
    {"template": "待到XXX结束，XXX便即刻XXX，场景也随之转到了XXX。", "type": "动作驱动切换", "context": "以人物行动为转场信号"},
    {"template": "天色彻底黑了下来，回过神来的XXX一声感慨。", "type": "环境暗示时间", "context": "用自然变化暗示时间流逝，比直接说更有画面感"},
    {"template": "然而，当日晚间，秋风大作……", "type": "环境+时间切换", "context": "历史题材常用，带氛围感"},
    {"template": "随着XXX（标志性声音/动作），原本XXX的局面瞬间一变……", "type": "事件触发切换", "context": "以关键动作或声音作为转场信号"}
  ]',
  '[
    "[内景] 南阳府衙 - 日（电影剧本式硬切，破坏叙事沉浸感）",
    "完全无过渡的跳跃（上下段在时间、空间、逻辑上毫无关联）",
    "让我们把视线转向……（打破第四面墙）"
  ]',
  '{
    "time_signals_direct": ["翌日清晨", "这日中午", "隔了半日", "过了几日", "一刻钟后", "又过了数日"],
    "time_signals_implicit": ["天色彻底黑了下来", "正东面渐渐发白", "秋风大作"],
    "scene_switch_signals": ["且说", "另一边", "话分两头", "就在这时", "然而"],
    "emotion_transition_phrases": ["然而，……", "不过，……", "回过神来的XXX", "XXX也已经想明白了……却依旧……", "赵玖心下讶然"]
  }',
  '{
    "typical": [
      "翌日清晨，虽然天色已经发亮……",
      "这日中午，甫一回到行在……",
      "且说，自XXX以来……",
      "另一边，五位行在实权大员转出后殿……"
    ],
    "boundary": [
      "天色彻底黑了下来，回过神来的XXX一声感慨。（环境暗示时间）",
      "XXX也已经想明白了里面的道道，却依旧沉默。（情绪转场几乎无痕）"
    ],
    "counter": [
      "光阴似箭，日月如梭……（老旧套话）",
      "他走在路上思绪万千……（无信息量的慢转场）"
    ]
  }',
  '历史题材转场兼顾叙事效率与历史厚重感。说书人式硬切（且说/另一边）是历史题材专有手法。环境变化暗示时间比直接说更有文学性。',
  'seed',
  1700000000
);

-- ============================================================
-- 4. 章节收尾钩子句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_structure_002',
  'lishi',
  'structure',
  '章节收尾钩子句',
  'High',
  '[
    {
      "if": "chapter_ending AND unexpected_person_appears",
      "then": "unexpected_appearance_hook",
      "because": "意外登场制造强烈戏剧冲突和对后续情节的期待"
    },
    {
      "if": "chapter_ending AND decision_made_but_outcome_unknown",
      "then": "decision_consequence_hook",
      "because": "主角决策已定但前途未知，读者为结果而追读"
    },
    {
      "if": "chapter_ending AND distant_threat_developing",
      "then": "offscreen_threat_hook",
      "because": "千里之外的阴谋制造更大格局的紧张感"
    },
    {
      "if": "chapter_ending AND key_character_speaks_unexpectedly",
      "then": "surprising_speech_hook",
      "because": "沉默者开口往往意味着格局转变"
    }
  ]',
  '[
    {"template": "然而，就在XXX以为此事已定时，帐外忽然传来一阵急促的脚步声，一人匆匆闯入，却是XXX。", "type": "意外登场钩子", "context": "制造强烈转折感"},
    {"template": "XXX正待开口，却不料对面XXX忽然面色大变，指着他身后骇然言道：XXX！", "type": "视觉冲击钩子", "context": "身后危机，制造紧张"},
    {"template": "随着帐内一声叹气，XXX终于下定了决心，只是这个决定，却不知会将XXX引向何方。", "type": "决策悬念钩子", "context": "重大决定后的未知感"},
    {"template": "夜色渐深，XXX疲惫不堪，正欲歇息，却忽然闻得远处传来一声不同寻常的XXX。", "type": "夜间异响钩子", "context": "历史题材常用，制造夜间危机感"},
    {"template": "他这才发现，不知从何时起，那个本不该出现在此处的人，便已经立在了自己身后。", "type": "身后人物钩子", "context": "极强悬念，经典历史题材收尾"},
    {"template": "而他不知道的是，千里之外的XXX，一场针对他的阴谋，正悄然展开。", "type": "异地威胁钩子", "context": "扩大叙事格局，暗示更大危机"},
    {"template": "XXX收起XXX，心中却始终萦绕着一个解不开的谜团：XXX？", "type": "悬而未解钩子", "context": "以未解之谜驱动追读"},
    {"template": "灯火摇曳，XXX看着手中刚刚送达的密信，上面的内容只有短短几个字，却足以让他浑身冰冷。", "type": "密信悬念钩子", "context": "历史题材专有，密信/情报制造悬念"},
    {"template": "做完这一切，XXX如释重负，但他抬头望向XXX方向，心中却升起一股更深的不安。", "type": "完成后不安钩子", "context": "事情完成反而更不安，制造深层悬念"},
    {"template": "就在这时，一直沉默不语的XXX却忽然抬起头，说出了一句让满座皆惊的话。", "type": "沉默者开口钩子", "context": "沉默者发言往往意味着格局转变"}
  ]',
  '[
    "就这样，一天过去了，所有问题都得到了解决。（完全闭合，零追读动力）",
    "单纯的景物描写收尾，不带任何情绪或悬念暗示。",
    "未完待续。（直接提示性文字作为正式结尾）"
  ]',
  '{}',
  '{
    "stats": {
      "suspense_hook": "50%",
      "emotional_resonance": "40%",
      "action_cliffhanger": "10%"
    },
    "typical": [
      "赵玖愕然起身回头，这才发现，不知道从什么时候开始，这XXX便已经立在自己身后了……",
      "随着帐内一声叹气，帐内帐外却都没有再吭一声。（情绪收尾）",
      "天日昭昭，可证我心！XXX以手指胸，凛然言道。（精神宣言作为高潮）"
    ],
    "boundary": [
      "国仇家恨……而已！XXX面无表情。（兼具情绪收和悬念收的双重效果）"
    ],
    "counter": [
      "忙碌的一天终于结束了，他安心地睡了过去。"
    ]
  }',
  '历史题材收尾以悬念收（50%）和情绪收（40%）为主。相比都市的行动钩子，历史题材更偏重意外登场、密信情报、格局威胁等宏大叙事钩子。',
  'seed',
  1700000000
);

-- ============================================================
-- 5. 心理独白句（主角视角 + 他人视角分离）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_psychology_001',
  'lishi',
  'psychology',
  '心理独白句',
  'High',
  '[
    {
      "if": "protagonist_analyzing_complex_political_situation",
      "then": "rational_analysis_monologue_with_modern_perspective",
      "because": "穿越者用现代思维解读古代事件，是历史穿越题材的核心爽点，以须知/在他看来/说白了引导"
    },
    {
      "if": "protagonist_encounters_unexpected_event",
      "then": "surface_level_shock_reaction（愕然/怔住/心下一惊）",
      "because": "生理反应比大段独白更快传达震惊状态，维持情节紧张节奏"
    },
    {
      "if": "protagonist_identifies_historical_figure_or_pattern",
      "then": "recognition_insight_monologue（原来如此/怪不得/他哪里还不明白）",
      "because": "穿越者的历史先知优势在识破时爆发，是历史题材独有的爽感来源"
    }
  ]',
  '[
    {"template": "在XXX看来，此事荒唐之处在于XXX，而真正的关键却是XXX。", "type": "理性分析式", "context": "穿越者现代视角解读古代局势"},
    {"template": "说白了，这不过是一场XXX，XXX的心思昭然若揭。", "type": "一针见血式", "context": "看穿表象直达本质"},
    {"template": "作为一个穿越者，XXX对这种XXX的套路再熟悉不过了。", "type": "先知优势式", "context": "历史题材专有，穿越者的信息优势"},
    {"template": "如此说来，对方的意图岂不是XXX？想到这里，XXX不由心中冷笑。", "type": "推断冷笑式", "context": "识破对方意图后的掌控感"},
    {"template": "他哪里还不明白，这分明就是想借XXX来试探自己的底线！", "type": "识破试探式", "context": "看透政治手段"},
    {"template": "平心而论，这番作为倒也不能全怪XXX，毕竟时局如此……", "type": "理性客观式", "context": "穿越者对古人的理解与包容，显示格局"},
    {"template": "这便是了，想要破局，关键还在于XXX，而非他们争论的XXX。", "type": "抓住关键式", "context": "在混乱中找到核心"},
    {"template": "怪不得之前XXX会那般举动，原来症结在此。", "type": "恍然大悟式", "context": "前情伏笔回收时的顿悟感"},
    {"template": "又是这种XXX的习气……XXX心中暗暗摇头，却也知道眼下无可奈何。", "type": "无奈接受式", "context": "对古代官僚体制的现代人感慨"},
    {"template": "事情到了这一步，自己唯一能做的，恐怕也只有XXX了。", "type": "被迫决断式", "context": "局势逼迫下的无奈选择"}
  ]',
  '[
    "冗长的哲学性思辨（脱离当前情景的抽象独白）",
    "暴露主角恐惧和软弱（万一失败了怎么办/我好害怕）",
    "脱离穿越者视角的纯古代思维独白（与穿越者身份设定不符）"
  ]',
  '{
    "undercurrent": ["哼，蠢货。", "走着瞧。", "原来如此。", "心中暗暗摇头。"],
    "open_conflict": ["此人当真可恶。", "忍无可忍。", "这便是了，不得不动了。"],
    "explosion": ["再也按捺不住。", "怒从心头起。", "此仇不报非君子。"]
  }',
  '{
    "stats": {
      "surface_level_thought": "40%（生理反应/即时判断）",
      "strategic_planning": "55%（理性分析/决策推演/历史先知）",
      "deep_emotional_reflection": "5%（身份认同危机/梦境）"
    },
    "protagonist_own_thoughts": [
      "在XXX看来，此事荒唐之处在于XXX，而真正的关键却是XXX。",
      "说白了，这不过是一场XXX，XXX的心思昭然若揭。",
      "他哪里还不明白，这分明就是想借XXX来试探自己的底线！",
      "又是这种XXX习气……XXX心中暗暗摇头，却也知道眼下无可奈何。",
      "穿越的时候往前两年，搞个XXX不好吗？（穿越者吐槽式）"
    ],
    "others_perception_of_protagonist": [
      "众人见官家面无表情，端坐不动，一时竟无人敢揣度圣意。",
      "XXX心中一凛，暗道官家此举，看似随意，实则大有深意。",
      "这官家，自落井之后，行事愈发莫测，竟让人看不透了。",
      "官家此番恩威并施，手段之老辣，着实不像一个二十出头的年轻人。",
      "原来官家早就料到了这一步，我等实在是浅薄了！"
    ],
    "note": "他人对主角的感知与主角自身独白严格分离，不可混用"
  }',
  '心理描写以理性分析为主（55%），是穿越者现代思维碰撞古代环境的核心载体。他人对主角的感知必须与主角自身独白严格分离存储。',
  'seed',
  1700000000
);

-- ============================================================
-- 6. 节奏控制规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_rhythm_001',
  'lishi',
  'rhythm',
  '节奏控制规则',
  'High',
  '[
    {
      "if": "scene_type == background_or_political_analysis",
      "then": "long_sentences_with_multiple_clauses + long_paragraphs",
      "because": "降低阅读速度，让读者充分消化历史信息和复杂局势"
    },
    {
      "if": "scene_type == tense_conflict OR key_turning_point",
      "then": "short_sentences + single_line_paragraphs",
      "because": "短促句式和频繁换行模拟急促心跳，强化冲击力"
    },
    {
      "if": "after_long_narration_need_to_highlight_conclusion",
      "then": "single_line_summary_or_question",
      "because": "连续信息流之后孤立短句形成强烈视觉焦点，画龙点睛"
    },
    {
      "if": "character_is_silent_or_at_loss_for_words",
      "then": "ellipsis_as_standalone_paragraph",
      "because": "省略号独立成段比直接写他沉默了更具张力，将节奏控制权交给读者"
    }
  ]',
  '[
    {"template": "当然难掩！", "type": "单行断言", "context": "长段分析后的结论强调"},
    {"template": "没错！", "type": "单行确认", "context": "关键信息确认时的视觉强调"},
    {"template": "不香吗？", "type": "单行反问", "context": "穿越者现代口吻的幽默自嘲"},
    {"template": "……（独立成段）", "type": "沉默省略号", "context": "无言以对或内心纷乱的压抑感"},
    {"template": "哈……（独立成段）", "type": "冷笑拟声", "context": "比沉默多一分情绪指向的冷漠"},
    {"template": "这XXX……（独立成段）", "type": "人名+省略感叹", "context": "对某人或某事复杂情绪的浓缩表达"}
  ]',
  '[
    "通篇超过200字的长段落叙述（历史题材允许比都市更长，但仍有上限）",
    "意识流或蒙太奇手法",
    "现代网络梗打断历史叙事节奏（除非是穿越者吐槽场景）"
  ]',
  '{}',
  '{
    "stats": {
      "tense_scene_avg_sentence_chars": 12,
      "relaxed_scene_avg_sentence_chars": 30,
      "dialogue_paragraph_avg_lines": 1,
      "narration_paragraph_avg_lines": 5,
      "description_paragraph_avg_lines": 4,
      "single_line_paragraph_triggers": "关键信息公布、情绪转折、结论性断言"
    },
    "contrast": {
      "calm_analysis": "大段长句，详细铺陈穿越者的思考过程",
      "emotional_explosion": "单行咒骂式短句，节奏瞬间推至顶峰"
    }
  }',
  '历史题材节奏比都市更耐得住长句和长段落（背景介绍需要），但冲突爆发时同样切换到极短句。省略号独立成段是历史题材特有的留白手法。',
  'seed',
  1700000000
);

-- ============================================================
-- 7. 描写技法规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_description_001',
  'lishi',
  'description',
  '描写技法规则',
  'High',
  '[
    {
      "if": "new_character_appears_with_political_significance",
      "then": "quick_20_char_appearance_sketch_plus_rank_signal",
      "because": "快速建立角色形象并纳入权力关系网，服务于情节理解而非审美"
    },
    {
      "if": "chapter_opens_new_scene OR protagonist_emotion_about_to_shift",
      "then": "insert_40_to_80_char_environment_description_with_light_and_weather",
      "because": "环境是情绪的定音鼓，为接下来情节和心境变化铺垫基调"
    },
    {
      "if": "need_to_characterize_without_breaking_narrative_pace",
      "then": "embed_temperament_in_behavior_and_dialogue（扶刀蹲坐/拢袖）",
      "because": "行为暗示比静态描写更生动，人物塑造和情节推进融为一体"
    },
    {
      "if": "political_standoff_or_tense_atmosphere",
      "then": "use_atmosphere_keywords（凝重/肃然/凛然/人心惶惶）",
      "because": "氛围词直接定义场景情绪基调，比细节描写更高效"
    }
  ]',
  '[
    {"template": "那XXX身着XXX（服饰），年纪约才XXX模样，生的却也算是XXX。", "type": "初次登场速写", "context": "20字内完成外貌+身份双重信息"},
    {"template": "这年约XXX的XXX，闻言不由XXX（动作）。", "type": "年龄+即时反应", "context": "以反应暗示性格"},
    {"template": "秋风飒飒，日暖斜阳，傍晚时分……光影交错、气爽温煦。", "type": "章节开场环境", "context": "奠定场景基调，60字以内"},
    {"template": "只见他全副甲胄，扶刀蹲坐在XXX外，双目炯炯……", "type": "标志性姿态固化", "context": "通过反复出现的姿态固化人物形象"},
    {"template": "此时此刻，XXX中的气氛却不免有些凝重和严肃……", "type": "氛围定调句", "context": "政治博弈场景开场定调"},
    {"template": "殿外风雨大作，而殿中安静了许久……", "type": "内外对比氛围", "context": "外部激烈反衬内部对峙的寂静"}
  ]',
  '[
    "他感到一种宇宙般的孤独。（抽象意识流，不符合历史题材风格）",
    "她长得非常美丽，像天仙一样。（空洞形容词）",
    "大段的战争场面技术性描写（超过100字的纯武器/战术描述，破坏叙事节奏）"
  ]',
  '{}',
  '{
    "stats": {
      "sensory_channels": {"visual": "75%", "auditory": "10%", "tactile": "15%", "olfactory": "0%"},
      "description_type": {"action_based": "80%", "static_state": "20%"},
      "first_appearance_avg_chars": "20字左右",
      "description_order": "整体印象（年龄/身材）→ 关键特征（容貌/气质）",
      "direct_vs_implied_ratio": {"direct": "20%", "implied": "80%"}
    },
    "atmosphere_keywords": ["凝重", "严肃", "人心惶惶", "愕然", "无奈", "肃然", "凛然", "恍惚", "尴尬", "荒唐"],
    "contrast_cases": {
      "威严型武将": "身材高大、容貌威严 + 微微低下头（威严与恭顺的矛盾，制造神秘感）",
      "文武反差型": "直接交代文武背景信息，服务于快速拉拢情节，不做外貌描写",
      "reason": "描写方式完全服务于角色在情节中的功能定位"
    }
  }',
  '历史题材描写极度功能化。外貌点到即止（20字），环境服务氛围（40-80字），气质通过行为暗示。所有描写为情节理解和权力关系服务，不做审美铺陈。',
  'seed',
  1700000000
);

-- ============================================================
-- 8. 叙事结构规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_structure_003',
  'lishi',
  'structure',
  '叙事结构规则',
  'High',
  '[
    {
      "if": "new_chapter_starts",
      "then": "action_hook_40pct OR dialogue_hook_30pct OR environment_hook_20pct OR suspense_hook_10pct",
      "because": "历史题材比都市更多用对话和环境开篇，因为政治讨论和历史氛围是核心内容"
    },
    {
      "if": "chapter_approaching_end AND core_conflict_unresolved",
      "then": "suspense_ending_50pct OR emotional_ending_40pct OR action_ending_10pct",
      "because": "历史题材情绪收尾比例高于都市（40% vs 20%），因为人物关系和精神层面更重要"
    },
    {
      "if": "mid_arc_event_needs_development",
      "then": "8_chapter_arc_with_5_setup_nodes",
      "because": "历史题材事件弧线比都市更长（8章 vs 1-3章），政治阴谋需要更多铺垫"
    },
    {
      "if": "need_to_introduce_historical_figure_as_background",
      "then": "omniscient_narrator_direct_introduction",
      "because": "背景板人物需要快速交代，用上帝视角叙述比对话更高效"
    },
    {
      "if": "need_to_introduce_core_ally_or_key_figure",
      "then": "long_foreshadowing_through_seeking_and_not_finding",
      "because": "求而不得反复强调重要性，制造长线期待感"
    }
  ]',
  '[
    {"template": "先做小事，再谋大局。", "type": "战略独白", "context": "穿越者规划阶段"},
    {"template": "朕意已决。", "type": "最终拍板式", "context": "终止争论的最高权威句"},
    {"template": "此事，朕自有决断。", "type": "悬置决策式", "context": "不告知结果，制造悬念"}
  ]',
  '[
    "非线性叙事、倒叙插叙（故事线始终单向线性）",
    "超过10章的单一事件弧线（读者耐心有限）",
    "忽略历史背景交代直接进入冲突（读者需要基础信息才能理解）"
  ]',
  '{
    "undercurrent": ["开始布局", "话里有话", "互相试探", "递上奏章", "密信往来"],
    "open_conflict": ["当众质疑", "弹劾", "摊牌", "廷争", "拍案"],
    "explosion": ["兵变", "刺杀", "彻底决裂", "斩首示众", "兴师问罪"]
  }',
  '{
    "stats": {
      "chapter_hook_types": {"action_start": "40%", "dialogue_start": "30%", "environment_start": "20%", "suspense_start": "10%"},
      "chapter_ending_types": {"suspense_hook": "50%", "emotional_resonance": "40%", "action_cliffhanger": "10%"},
      "climax_position": "末尾80%",
      "event_arc_chapters": [6, 10],
      "setup_nodes_before_turning_point": 5,
      "foreshadowing_recovery_span": [6, 10]
    },
    "info_delivery_modes": {
      "universal_background": "上帝视角大段叙述（普适性高、难融入对话的设定）",
      "specific_intel": "一问一答式对话投放（针对当前情节的即时信息）",
      "key_figure_intro": "长线伏笔（求而不得，反复强调，多章后回收）"
    }
  }',
  '历史题材结构比都市更宏观，事件弧线更长（8章），情绪收尾比例更高（40%）。信息投放分三种模式：设定集中说明/对话按需投放/关键人物长线伏笔。',
  'seed',
  1700000000
);

-- ============================================================
-- 9. 信息密度规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_info_density_001',
  'lishi',
  'info_density',
  '信息密度规则',
  'High',
  '[
    {
      "if": "chapter_opens_and_reader_needs_background_for_current_plot",
      "then": "2_to_3_paragraph_concentrated_background_dump",
      "because": "确保读者在进入核心情节前掌握必要游戏规则，避免频繁打断情节解释"
    },
    {
      "if": "protagonist_interacts_with_new_character_or_group",
      "then": "embed_background_in_dialogue_through_self_intro_or_others_introduction",
      "because": "对话式信息投放比旁白更自然，信息传递过程本身成为情节"
    },
    {
      "if": "future_key_figure_or_event_needs_foreshadowing",
      "then": "mention_casually_in_dialogue_memory_or_background_narration",
      "because": "提前埋设制造原来如此的阅读快感，避免关键人物登场的突兀感"
    },
    {
      "if": "background_info_is_universal_and_hard_to_embed_in_dialogue",
      "then": "use_omniscient_narrator_style_concentrated_explanation",
      "because": "基础世界规则难以通过自然对话完成，集中说明效率最高"
    }
  ]',
  '[
    {"template": "现在跟来行在的XXX骑兵，全是当年XXX里面XXX营的老人……", "type": "通过人物自述投放历史背景", "context": "自然融入对话"},
    {"template": "原来，XXX是之前XXX的宰相，也算是XXX最后一位正牌子宰相……", "type": "旁白式历史人物介绍", "context": "上帝视角快速交代背景板人物"},
    {"template": "你们在XXX久随XXX，可曾认得一个叫XXX的人物？", "type": "通过提问埋伏笔", "context": "以求而不得方式强调关键人物"},
    {"template": "就连臣也是之前XXX要重建XXX，从XXX那里要来的……", "type": "对话中的来历说明", "context": "角色来历通过自然对话透露"},
    {"template": "XXX这个人，乃是这个年头天下间数得着的传奇人物……", "type": "上帝视角集中介绍", "context": "即将影响情节的重要背景板人物"}
  ]',
  '[
    "大段说明文式信息介绍超过一章的1/3篇幅（设定章节除外）",
    "关键人物在完全没有铺垫的情况下突然登场",
    "打破叙事层面的元叙事补充（作者PS/网文梗等）"
  ]',
  '{}',
  '{
    "stats": {
      "new_info_points_per_chapter": 5,
      "info_pacing": "均匀分布，略偏向章节开头",
      "foreshadowing_to_payoff_span": [6, 10]
    },
    "delivery_modes": {
      "concentrated_dump": "设定章节专用，可占篇幅2/3，用于普适性世界规则",
      "dialogue_embedded": "对话中自然投放，用于具体人物和即时情报",
      "long_foreshadow": "关键核心人物专用，求而不得反复提及，多章后回收"
    },
    "contrast": {
      "background_figure": "上帝视角直接全面交代（郭药师式），效率优先",
      "core_ally": "长线伏笔，通过询问和他人反应反复强调（岳飞式），期待感优先"
    }
  }',
  '历史题材信息密度最高（每章5个信息点），且存在专门的设定章节。信息投放按人物重要性选择策略：背景板用集中叙述，核心盟友用长线伏笔。',
  'seed',
  1700000000
);

-- ============================================================
-- 10. 他人对主角的评价（历史穿越补全）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_psychology_002',
  'lishi',
  'psychology',
  '心理独白句（他人对主角评价）',
  'Medium',
  '[
    {"if": "court_official_observing_protagonist_unusual_decision","then": "confused_but_respectful_evaluation","because": "臣属对君主超出常规举动的困惑评价，侧面强化穿越者的神秘感和先知优势"},
    {"if": "antagonist_faction_reassessing_protagonist_after_setback","then": "threat_recognition_with_fear","because": "政敌的重新评估是主角政治崛起的信号，增加后续博弈的合理性"},
    {"if": "loyal_subordinate_witnessing_protagonist_modern_wisdom","then": "awe_and_devotion_thought","because": "忠臣的震惊与折服是穿越者爽感的重要来源，通过他人视角放大主角的超前智慧"},
    {"if": "historical_figure_encountering_protagonist_for_first_time","then": "initial_underestimation_then_reevaluation","because": "历史名人对主角的初始轻视与后续改观，制造欲扬先抑的爽感节奏"}
  ]',
  '[
    {"template": "众人见官家面无表情，端坐不动，一时竟无人敢揣度圣意。", "type": "群臣敬畏式", "context": "主角沉默时群臣的集体反应，强化权威感"},
    {"template": "XXX心中一凛，暗道官家此举，看似随意，实则大有深意。", "type": "臣属警觉式", "context": "聪明臣属感知到主角行为背后的深意"},
    {"template": "这官家，自XXX以后，行事愈发莫测，竟让人看不透了。", "type": "臣属困惑式", "context": "穿越者行为超出古人认知框架的困惑"},
    {"template": "官家此番恩威并施，手段之老辣，着实不像一个XXX岁的年轻人。", "type": "能力惊叹式", "context": "对主角超出年龄的政治手腕的震惊"},
    {"template": "原来官家早就料到了这一步，我等实在是浅薄了！", "type": "先知折服式", "context": "主角预判成真后臣属的折服"},
    {"template": "XXX心中暗暗警惕，这位官家，绝非表面上看起来那般好对付。", "type": "政敌警觉式", "context": "对手感知到主角威胁后的内心警觉"},
    {"template": "此人……当真是天纵奇才，还是另有隐情？XXX百思不得其解。", "type": "历史名人困惑式", "context": "历史名人对主角超常表现的困惑与猜测"},
    {"template": "XXX看着眼前这位年轻的官家，心中涌起一股说不清道不明的感觉——此人，日后必成大器。", "type": "伯乐预感式", "context": "有眼力者对主角潜力的静默认可"},
    {"template": "他们私下里都说，官家这是被那场大病烧坏了脑子，XXX却觉得，恰恰相反。", "type": "少数清醒者式", "context": "在众人误解中，少数人看出主角的真实意图"},
    {"template": "XXX冷冷地看着那道旨意，心中已然明白——这位官家，是真的要动手了。", "type": "政敌恐惧式", "context": "政敌意识到主角开始清算时的恐惧"}
  ]',
  '[
    "XXX真是个明君，我从心底里佩服他。（过于直白的正面赞美，历史题材的认可都是含蓄的）",
    "大家都觉得官家英明神武，纷纷称颂。（集体正向反应，不符合朝堂政治的复杂性）"
  ]',
  '{}',
  '{}',
  '历史穿越题材他人评价分两类：臣属的困惑/折服（强化穿越者先知优势）和政敌的警觉/恐惧（标志政治崛起）。评价始终含蓄，通过他人的态度变化折射主角的权力积累。',
  'seed',
  1700000000
);

-- ============================================================
-- 11. 对话收尾句（历史穿越）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_dialogue_close_001',
  'lishi',
  'dialogue',
  '对话收尾句',
  'High',
  '[
    {"if": "protagonist_is_monarch_or_authority_and_wants_to_end_discussion","then": "end_with_imperial_decree_or_dismissal_that_closes_the_topic","because": "君主终止争论不需要理由，一句话宣告决定然后示意退下，权威本身就是收场的理由"},
    {"if": "protagonist_needs_to_deflect_political_pressure","then": "end_by_redirecting_to_higher_priority_state_affairs","because": "穿越者主角用更紧迫的国事来压制内部矛盾，这是现代政治智慧在古代的应用"},
    {"if": "dialogue_reveals_protagonist_has_foreknowledge","then": "end_with_cryptic_statement_that_hints_at_future_knowledge","because": "穿越者的先知优势在收场时最有张力——说一句让古人无法理解但读者能懂的话，然后离开"},
    {"if": "protagonist_needs_to_protect_subordinate_or_build_loyalty","then": "end_by_taking_responsibility_or_showing_trust","because": "主动揽责或表达信任是建立君臣恩义的核心手段，收场时的一句话可以奠定一段关系"}
  ]',
  '[
    {"template": "【写法】君主收场：主角说出决定，用"此事朕意已决"或类似的权威句式终止争论，然后用一个动作（起身、转向、拿起某件东西）宣告对话结束。不要等对方回应。", "type": "君主权威终止式", "context": "君主身份的对话收场"},
    {"template": "【写法】主角用一句话把当前争议引向一个更紧迫的国事，让所有人意识到现在争这个不是时候，然后直接进入新议题。这个国事要是本章已经建立的背景信息。", "type": "国事转移式", "context": "政治争论的收场"},
    {"template": "【写法】主角说一句话，这句话对古人来说是谜，但读者知道是穿越者的先知——可以是对某个历史事件的隐晦预言，也可以是对某人命运的暗示。说完后不解释，直接离开。", "type": "先知暗示式", "context": "穿越者优势的展示性收场"},
    {"template": "【写法】对话结束时，主角主动为某个下属或盟友说一句话，这句话要基于本章已经发生的具体事件，不能是通用的安慰。说完后，观察对方的反应来定性这段关系。", "type": "建立恩义式", "context": "君臣关系的收场"},
    {"template": "【写法】收场时，主角不直接回应对方的最后一句话，而是用一个动作（翻开奏折、走向地图、拿起茶杯）来表示这个话题已经结束，让对方自己意识到。", "type": "无言动作终止式", "context": "不需要言语的权威收场"}
  ]',
  '[
    "主角主动道歉或认错来结束对话（破坏君主权威）",
    "用和本章剧情无关的感悟或哲理来收场（脱离剧情）",
    "收场时暴露主角对局势的不确定或恐惧（破坏穿越者先知形象）",
    "引入本章没有出现过的新人物或新信息来打断对话（外挂元素）"
  ]',
  '{}',
  '{}',
  '历史穿越对话收尾从君主权威和穿越者先知优势出发：权威终止、国事转移、先知暗示是三大核心手法。收尾要从本章已有的政治格局和信息里生长，禁止外挂元素和软弱收场。',
  'seed',
  1700000000
);

-- ============================================================
-- 12. 冲突升级句（历史穿越）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_conflict_escalation_001',
  'lishi',
  'conflict',
  '冲突升级句',
  'High',
  '[
    {"if": "user_instruction_implies_political_confrontation","then": "escalate_through_faction_alignment_and_public_stance","because": "历史题材的冲突升级是政治性的——从私下试探到公开表态到派系站队，每一步都有更大的政治后果"},
    {"if": "conflict_involves_protagonist_using_modern_knowledge","then": "escalate_by_revealing_foreknowledge_at_critical_moment","because": "穿越者的先知优势在冲突升级时最有爆发力——在对方以为自己赢了的时候，主角说出一个只有穿越者才知道的信息"},
    {"if": "conflict_is_court_debate_or_political_argument","then": "escalate_through_evidence_and_historical_precedent","because": "朝堂冲突的升级靠证据和先例，不靠情绪——主角用古代典故或当前事实来逐步压制对方"},
    {"if": "conflict_is_about_to_peak","then": "use_a_political_consequence_specific_to_this_chapters_events","because": "历史题材冲突爆发的触发点必须是本章已经建立的政治格局的延伸，不能是凭空出现的新矛盾"}
  ]',
  '[
    {"template": "【写法】政治冲突升级分三层：第一层是私下试探（一方通过奏折或私信试探主角的立场）；第二层是公开表态（在朝堂或公开场合明确站队）；第三层是派系对决（双方的支持者都被卷入）。每一层都要有具体的对话或行动。", "type": "政治三层升级结构", "context": "历史题材标准政治冲突升级"},
    {"template": "【写法】在冲突升级的关键时刻，主角说出一个只有穿越者才知道的信息（某个历史事件的走向、某人的真实意图），这个信息要和本章的政治格局直接相关，不能是随机的历史知识。", "type": "先知信息逆转式", "context": "穿越者优势的冲突升级"},
    {"template": "【写法】朝堂辩论升级时，主角用一个具体的历史先例或当前事实来反驳对方，这个先例或事实要是本章已经建立的背景信息，不能是凭空引入的新知识。", "type": "证据先例升级式", "context": "朝堂辩论的升级"},
    {"template": "【写法】冲突爆发的最后触发点，用本章已经出现过的一个政治事件或人物关系作为导火索，让爆发有必然性而不是偶然性。", "type": "本章政治事件触发爆发式", "context": "冲突爆发的最后触发点"}
  ]',
  '[
    "冲突升级靠提高音量或加感叹号（没有实质内容的情绪堆砌）",
    "引入和本章政治格局无关的新矛盾来升级冲突（外挂冲突）",
    "主角在冲突升级过程中暴露软弱或不确定（破坏穿越者先知形象）",
    "冲突爆发的触发点是本章从未出现过的新信息（外挂触发）"
  ]',
  '{}',
  '{}',
  '历史穿越冲突升级遵循政治三层结构，穿越者先知优势在关键时刻爆发。升级靠证据和先例，爆发点必须来自本章已有的政治格局。禁止外挂新矛盾和情绪堆砌。',
  'seed',
  1700000000
);

-- ============================================================
-- 13. 开章与转场钩子（历史穿越）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_chapter_transition_001',
  'lishi',
  'structure',
  '开章与转场钩子',
  'High',
  '[
    {"if": "user_instruction_implies_new_chapter AND previous_chapter_ended_on_political_decision","then": "open_with_the_immediate_political_consequence_or_reaction","because": "历史题材的政治决定会立刻引发连锁反应，新章节应该从这个反应开始，不要用时间标记拉开距离"},
    {"if": "user_instruction_implies_scene_switch_to_different_faction","then": "use_contrast_with_protagonists_current_political_position","because": "切换到其他派系时，用与主角当前政治处境的对比来连接，这个对比本身就是叙事张力"},
    {"if": "user_instruction_implies_time_skip_for_political_development","then": "mark_time_with_specific_political_change_not_just_date","because": "历史题材的时间跳跃要用具体的政治变化来标记，让读者感受到历史进程的推进"},
    {"if": "user_instruction_implies_protagonist_reflection_on_historical_events","then": "anchor_scene_with_specific_historical_detail_then_enter_thought","because": "穿越者的反思场景要用一个具体的历史细节来锚定，然后从这个细节引出主角的现代视角思考"}
  ]',
  '[
    {"template": "【写法】新章节第一句话就是上章政治决定的直接后果（某人的反应、某件事的变化、某个消息的传来），不要用时间标记或环境描写作为缓冲。", "type": "政治后果直入式开章", "context": "政治决定后的新章节"},
    {"template": "【写法】切换到其他派系时，用一句话建立与主角当前处境的对比，这个对比要基于本章已有的政治信息，不能是随机的背景描写。", "type": "政治对比转场式", "context": "切换到其他派系的视角"},
    {"template": "【写法】时间跳跃时，用一句话同时说明时间长度和这段时间里发生的关键政治变化，然后直接进入新状态。不要只说时间，要说政治格局的变化。", "type": "政治变化标记时间跳跃", "context": "政治发展阶段的时间压缩"},
    {"template": "【写法】穿越者反思场景：用一个具体的历史细节（某件文物、某个地名、某个人物的行为）来锚定场景，然后从这个细节引出主角的现代视角思考。这个细节要和本章的主要事件有关。", "type": "历史细节锚定反思式", "context": "穿越者独处反思场景"},
    {"template": "【写法】如果用户指令暗示需要说书人式转场（且说/另一边），用这种方式时要同时带入一个信息点，不能只是切换场景，要让读者知道切换的原因。", "type": "信息化说书人转场", "context": "需要平行叙事时"}
  ]',
  '[
    "用"翌日清晨""数日之后"等套话直接开章，不承接上章的政治后果（硬切）",
    "开章用大段历史背景描写来建立氛围（拖慢节奏）",
    "转场时引入本章没有出现过的新政治势力（外挂转场）",
    "时间跳跃只说时间不说政治变化（信息量为零的套话）",
    "转场方式和用户指令的意图脱节（自行决定跳跃方式）"
  ]',
  '{}',
  '{}',
  '历史穿越开章和转场遵循政治逻辑：新章节从政治决定的后果开始，转场用政治对比连接，时间跳跃用政治变化标记。穿越者反思场景用历史细节锚定。禁止硬套时间标记和外挂政治势力。',
  'seed',
  1700000000
);

-- ============================================================
-- 14. 连锁震惊写法（历史穿越）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_chain_shock_001',
  'lishi',
  'psychology',
  '连锁震惊写法',
  'Medium',
  '[
    {"if": "protagonist_makes_decision_or_demonstrates_knowledge_that_shocks_court","then": "write_layered_reactions_from_minor_officials_to_ministers_to_emperor","because": "历史穿越的爽感在于穿越者的超前认知被逐层认可，小吏→朝臣→皇帝的层级震惊是这个题材特有的爽感结构"},
    {"if": "protagonist_uses_modern_knowledge_to_solve_ancient_problem","then": "show_each_level_being_forced_to_acknowledge_protagonists_wisdom","because": "古人被迫承认穿越者的超前智慧，层级越高说明影响越深远"}
  ]',
  '[
    {"template": "【写法】按层级从低到高依次写反应：小吏/执行者（此策从何而来，闻所未闻）→同僚/朝臣（此人有经天纬地之才）→皇帝/最高权威（朕要见此人/此人不可不用）。每层反应要有具体的行为或语言，不能只写震惊。", "type": "三层递进式", "context": "主角展示出超越时代的知识或决策时"},
    {"template": "【写法】政敌/对手的反应要单独处理：先是轻视（此人不过如此），然后是不安（此人似乎不简单），然后是警惕（此人是变数），最后是忌惮（必须除掉此人）。四步走，体现威胁感的递进。", "type": "政敌威胁感递进式", "context": "主角在政治场合展示实力时"},
    {"template": "【写法】忠臣/盟友的反应要通过具体行为传达：肃然起敬、重新行礼、主动靠近——用这些行为暗示折服，比直接写他们折服更有分量。", "type": "盟友折服行为式", "context": "主角展示先知优势时"}
  ]',
  '[
    "只写众臣震惊、满朝哗然等空洞描述",
    "所有层级同时震惊，失去层次感",
    "每章都强行安排震惊反应（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '连锁震惊写法：小吏→朝臣→皇帝的层级震惊，每层反应具体化。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);

-- ============================================================
-- 15. 信息差释放写法（历史穿越）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_info_gap_release_001',
  'lishi',
  'structure',
  '信息差释放写法',
  'Medium',
  '[
    {"if": "protagonist_has_foreknowledge_or_modern_knowledge_as_advantage","then": "control_who_discovers_it_and_when","because": "穿越者的先知优势价值在于分层揭露，先让身边人感到不寻常，再让政敌开始警惕，最后让皇帝意识到此人不凡"},
    {"if": "protagonists_foreknowledge_is_about_to_be_demonstrated","then": "write_the_process_of_ancients_going_from_confusion_to_awe","because": "古人从困惑到敬畏的过程本身就是历史穿越题材最核心的爽感来源"}
  ]',
  '[
    {"template": "【写法】先知优势的揭露要分阶段：先让身边人感到不寻常（此人行事与常人不同），再让政敌开始警惕（此人似乎早有预谋），最后让皇帝意识到不凡（此人有未卜先知之能）。每个阶段都是独立的爽点。", "type": "三阶段揭露式", "context": "主角有历史先知或现代知识优势时"},
    {"template": "【写法】古人从困惑到敬畏的过程要写出来：先是困惑（此人为何如此笃定），然后是惊疑（他怎么知道的），然后是敬畏（此人莫非有神助），最后是折服（原来官家早已料到）。这个过程本身就是爽感。", "type": "古人认知升级式", "context": "古人开始意识到主角的先知优势时"},
    {"template": "【写法】旧的先知优势即将被完全认可时，提前埋下新的更高层次的预判或知识。让读者在享受当前爽点的同时，已经对下一个先知时刻产生期待。", "type": "先知叠加式", "context": "一个先知优势即将完全被认可时"}
  ]',
  '[
    "一次性把所有先知优势都展示出来",
    "跳过古人从困惑到敬畏的过程",
    "每章都强行安排先知揭露（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '信息差释放写法：先知优势分阶段揭露，写出古人从困惑到敬畏的过程。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);

-- ============================================================
-- 16. 情绪递进铺垫写法（历史穿越）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_emotion_escalation_001',
  'lishi',
  'structure',
  '情绪递进铺垫写法',
  'Medium',
  '[
    {"if": "building_up_to_a_political_reversal_or_triumph","then": "escalate_political_pressure_step_by_step","because": "历史穿越的爽感来自政治压力积累到极限然后逆转，铺垫越充分逆转越有力"},
    {"if": "protagonist_is_being_politically_pressured_or_undermined","then": "make_each_step_of_pressure_more_specific_and_consequential","because": "政治压力越具体后果越严重，后续逆转的爽感越强"}
  ]',
  '[
    {"template": "【写法】政治铺垫要分步走：被轻视（对方不把主角放在眼里）→被刁难（对方开始主动设置障碍）→被当众否定（在朝堂公开场合被否定）→被政敌利用（被拿来作为攻击的靶子）→被逼表态（被逼到必须公开表明立场）。每一步都要有具体的朝堂场景。", "type": "五步政治递进式", "context": "政治逆转场景的铺垫阶段"},
    {"template": "【写法】政治压力要层层递进：从针对主角的具体决策，到针对主角的立场，到针对主角的根基（家族/势力/皇帝信任）。越到后面越触碰根本，逆转才有必然性。", "type": "政治压力递进式", "context": "政敌持续施压时"},
    {"template": "【写法】铺垫阶段主角的反应要沉稳：不是没有情绪，而是在运筹。通过细节（沉默、微笑、不动声色）传达内心的从容，让读者感受到穿越者的先知优势在积累。", "type": "主角沉稳积累式", "context": "主角承受政治压力的过程中"}
  ]',
  '[
    "铺垫只有一步就直接逆转",
    "每一步压力都一样，没有递进",
    "主角提前爆发，破坏沉稳人设",
    "每章都强行安排递进铺垫（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '情绪递进铺垫写法：政治压力分步递进，主角沉稳积累，穿越者的从容感要贯穿铺垫阶段。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);

-- ============================================================
-- 17. 配角反应具体化写法（历史穿越）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishi_npc_reaction_detail_001',
  'lishi',
  'psychology',
  '配角反应具体化写法',
  'Medium',
  '[
    {"if": "protagonist_demonstrates_foreknowledge_or_modern_wisdom","then": "write_specific_reactions_from_court_officials_and_enemies","because": "历史穿越配角的反应要体现古人视角，不能只写震惊，要写出他们具体的困惑、敬畏和忌惮"},
    {"if": "political_enemy_is_forced_to_face_protagonists_superiority","then": "show_enemy_going_from_contempt_to_wariness","because": "政敌从轻视到忌惮的过程是历史穿越题材最有爽感的配角反应"}
  ]',
  '[
    {"template": "【写法】朝臣的反应要写三个层面：行为变化（从随意到恭敬到小心翼翼）、语言变化（从轻描淡写到措辞谨慎）、内心判断（从此人不过如此到此人深不可测）。三个层面都写到，反应才立体。", "type": "三层面具体化式", "context": "主角展示出超越时代的智慧时"},
    {"template": "【写法】政敌的忌惮要写出过程：先是轻视（此人不足为虑），然后是不安（此人似乎早有预谋），然后是警惕（此人是变数），最后是忌惮（必须除掉此人）。不能直接跳到最后。", "type": "政敌忌惮过程式", "context": "政敌开始意识到主角的威胁时"},
    {"template": "【写法】忠臣/盟友的折服要通过具体行为传达：肃然起敬、重新行礼、主动靠近效忠——用这些行为暗示折服，比直接写他们折服更有历史感。", "type": "忠臣折服行为式", "context": "主角展示先知优势后"}
  ]',
  '[
    "只写众臣震惊、满朝哗然等空洞描述",
    "配角反应一步到位，没有过程",
    "每章都强行安排配角震惊（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '配角反应具体化写法：行为变化+语言变化+心理变化三层面，政敌从轻视到忌惮的过程要写出来。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000000
);
