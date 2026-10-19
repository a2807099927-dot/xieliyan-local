-- ============================================================
-- 文娱题材 写作技法种子数据 v1（三层分析整合版）
-- 来源：三层分析
-- 角色名已全部匿名化为 XXX/XX
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
-- 1. 对话技法  开场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_dialogue_001',
  'wenyi',
  'dialogue',
  '对话开场句',
  'High',
  '[
    {
      "if": "need_quick_info_exchange OR functional_question",
      "then": "unmodified_simple_tag_opener OR action_tag_opener",
      "because": "文娱题材对话以后置动作/神态标签为主，最大限度减少叙述干扰，加快交锋节奏",
      "example": "\"抱歉，我不拍电影，也不当演员。\"XXX抬头露出了一个礼貌性的笑容看着XX。"
    },
    {
      "if": "protagonist_initiating_pitch_or_hustle",
      "then": "direct_value_proposition_opener OR identity_claim_opener",
      "because": "文娱主角以资源/才华为筹码开场，直接抛出价值主张，降低对方防御心",
      "example": "\"我有一个能拿奖的剧本，但现在就缺一个有眼光的投资人。\""
    },
    {
      "if": "need_establish_confrontation_or_challenge",
      "then": "rhetorical_question_or_challenge_opener",
      "because": "反问或挑战式开场直接建立对抗张力，迫使对方进入防御或回应状态",
      "example": "\"你是不是觉得本美女天真无邪，像傻白甜好骗？\""
    },
    {
      "if": "protagonist_in_awkward_or_exposed_position",
      "then": "deflect_or_reframe_opener",
      "because": "被识破时用重新定义话语权的方式化解，而非直接认错",
      "example": "\"我不是这个意思。我的意思是\""
    }
  ]',
  '[
    {"template": "\"你好，我是XXX，这是我的XXX，有兴趣聊聊吗？\"", "type": "自我介绍式", "context": "初次接触，以身份和资源开场"},
    {"template": "\"（美女/哥们），你想成为XXX吗？我这有个机会。\"", "type": "机会诱导式", "context": "拉拢潜在合作者"},
    {"template": "\"抱歉，能让我XXX吗？我有些想法。\"", "type": "请求切入式", "context": "主动争取展示机会"},
    {"template": "\"我观察你很久了，你很符合我XXX里一个角色的气质。\"", "type": "专业评估式", "context": "以专业眼光建立对方的被需要感"},
    {"template": "\"我有一个XXX，但现在就缺一个XXX。\"", "type": "资源匹配式", "context": "以互补需求为切入点"},
    {"template": "\"（突然出现）站住！这是我的XXX，你看一下。\"", "type": "强行推销式", "context": "主动出击，不给对方拒绝的机会"},
    {"template": "\"我们谈谈关于XXX的细节吧，时间宝贵。\"", "type": "直入正题式", "context": "跳过寒暄，直接进入利益谈判"},
    {"template": "\"你是不是XXX？我找你有点事。\"", "type": "身份确认式", "context": "确认对方身份后直接切入目的"},
    {"template": "\"别动，我觉得你现在的XXX非常有镜头感。\"", "type": "专业捕捉式", "context": "以专业视角制造对方的被关注感"},
    {"template": "\"我能问一下，你对XXX有什么看法吗？\"", "type": "探询式", "context": "以问题开场，试探对方立场"}
  ]',
  '[
    "\"您好，冒昧打扰您一下，不知您是否有几分钟空闲时间\"（过于礼貌卑微，不符合主角愣头青式直接风格）",
    "\"我不知道该不该问，但是\"（犹豫感与文娱主角的行动派风格冲突）",
    "\"今天天气真好，不是吗？\"（无目的寒暄，节奏断裂）",
    "\"生命的意义在于\"（哲理文艺腔，完全不符合题材调性）"
  ]',
  '{
    "undercurrent": ["微微一愣/一怔", "奇怪地看着", "皱眉", "下意识地", "沉默", "眼神闪过一丝深意", "嘴角微微露出些许弧度"],
    "open_conflict": ["你什么意思？", "你是不是觉得", "继续抢话", "你", "盯着XX", "目光相当锐利", "挑衅"],
    "explosion": ["草/握草/妈蛋/呸", "你！", "骗！", "站起来", "猛地", "狠狠地", "脸色大变"]
  }',
  '{
    "typical": [
      "\"抱歉，我不拍电影，也不当演员。\"XXX抬头露出了一个礼貌性的笑容看着XX。",
      "\"那你是\"",
      "\"你的剧本非常有潜力，而且能以小博大？\"XXX继续抢话。",
      "\"道具？剧本不是道具！\"",
      "\"上车吧。\"XXX扫了一眼剧本后，笑容突然变得严肃了起来。"
    ],
    "boundary": [
      "\"我有好剧本，我是一名非常优秀的导演与演员同时还是"远程"电影公司的老板。\"XX觉得自己的舌头有些打结。（紧张结巴式，暴露主角的真实状态）",
      "\"钢琴曲好听吗？\"（无修饰的简单问句，以问题开场）",
      "\"说不出来？\"XXX挑衅XX\"或者说，你不懂？\"（连续追问式挑衅）"
    ],
    "counter": [
      "\"您好，冒昧打扰\"（过度礼貌，不符合题材）",
      "\"我不知道该不该问\"（犹豫开场，破坏节奏）"
    ]
  }',
  '对话以后置动作/神态标签为主（65%动作修饰），节奏紧凑，以对方直接反应驱动快节奏交锋。文娱主角开场必须带明确的功利性目标。',
  'seed',
  1700000003
);

-- ============================================================
-- 2. 对话技法  冲突降温句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_dialogue_002',
  'wenyi',
  'dialogue',
  '冲突降温句',
  'High',
  '[
    {
      "if": "conflict_peak_reached AND need_redirect_to_main_agenda",
      "then": "topic_redirect_to_business OR action_based_closure",
      "because": "用更重要的正事强行转移话题，占据主导权，不在无意义争论上浪费时间"
    },
    {
      "if": "verbal_argument_unwinnable AND need_face_saving_exit",
      "then": "action_demonstration_redirect OR reframe_opponent_as_ignorant",
      "because": "放弃言语辩论转为行动展示，或将对方质疑降维到不懂行层面，进行不对等打击"
    },
    {
      "if": "protagonist_needs_to_use_retreat_as_advance",
      "then": "fake_withdrawal_to_force_reconsideration",
      "because": "以退为进，通过放弃威胁迫使对方重新评估价值，从而挽留自己"
    },
    {
      "if": "conflict_needs_physical_environment_change",
      "then": "location_change_interrupt",
      "because": "通过改变物理环境打断当前情绪和冲突状态，强制重置场景"
    }
  ]',
  '[
    {"template": "\"行了，这事就到此为止。我们谈点正事，XXX要紧。\"", "type": "议程转移式", "context": "用正事强行终止争论，占据主导权"},
    {"template": "\"（突然一笑）算了，跟你说不通。你跟我来，我用XXX告诉你答案。\"", "type": "行动展示式", "context": "放弃言语辩论，转为行动证明"},
    {"template": "\"好，既然你这么觉得，那这个XXX就当我没提过。东西还我，我走了。\"", "type": "以退为进式", "context": "通过放弃威胁迫使对方挽留"},
    {"template": "\"你不懂，这是一种XXX，不是用XXX能衡量的。\"", "type": "降维打击式", "context": "将对方质疑降维到不懂行层面"},
    {"template": "\"我不是这个意思。我的意思是，XXX。\"", "type": "话语重构式", "context": "重新定义冲突焦点，掌握解释权"},
    {"template": "\"你可以不信，但XXX会证明一切。\"", "type": "延迟裁决式", "context": "将争议推给未来结果裁决，暂时搁置"},
    {"template": "\"行吧，你是对的。但现在，我们得先解决XXX。\"", "type": "表面让步式", "context": "表面认可，实则抢夺议程设置权"},
    {"template": "\"（叹气）我们都是XXX，没必要为这点小事伤了和气。\"", "type": "身份拔高式", "context": "暗示对方争执格局小了"},
    {"template": "\"这件事没得商量。要么XXX，要么就算了。\"", "type": "最后通牒式", "context": "用强硬姿态直接结束争论"},
    {"template": "\"别说了，上车。我们换个地方谈。\"", "type": "环境切换式", "context": "通过改变物理环境打断冲突状态"}
  ]',
  '[
    "\"对不起，我刚才说话太冲了，我们各退一步，好好商量一下行吗？\"（主角降温方式是掌控或转移，不是真诚道歉与和解）",
    "\"我理解你的感受，你说得也有道理\"（共情式让步，不符合主角强势风格）",
    "\"算了，是我的错，我以后注意。\"（无条件认错，破坏主角人设）"
  ]',
  '{}',
  '{
    "typical": [
      "\"行了，这事就到此为止。我们谈点正事，XXX要紧。\"",
      "\"好，既然你这么觉得，那这个XXX就当我没提过。东西还我，我走了。\"",
      "\"你不懂，这是一种XXX，不是用XXX能衡量的。\"",
      "\"你可以不信，但XXX会证明一切。\"",
      "\"别说了，上车。我们换个地方谈。\""
    ],
    "boundary": [
      "\"行吧，你是对的。但现在，我们得先解决XXX。\"（表面让步，实则转移议程）",
      "\"（叹气）我们都是XXX，没必要为这点小事伤了和气。\"（以身份感化，非强硬收场）"
    ],
    "counter": [
      "\"对不起，我刚才说话太冲了\"（真诚道歉）",
      "\"我理解你的感受\"（共情让步）"
    ]
  }',
  '文娱冲突降温以掌控话语权为核心：转移议程、行动证明、以退为进、降维打击是四大手法。绝无真诚道歉或无原则妥协。',
  'seed',
  1700000003
);

-- ============================================================
-- 3. 场景转场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_structure_001',
  'wenyi',
  'structure',
  '场景转场句',
  'High',
  '[
    {
      "if": "scene_needs_clear_separation",
      "then": "ellipsis_hard_cut",
      "because": "省略号分隔符是文娱题材最常用的转场信号，明确分割不同场景或时间段，简洁高效"
    },
    {
      "if": "chapter_opening_needs_scene_establishment",
      "then": "time_location_label_direct_cut",
      "because": "时间+地点的标签式语句直接进行场景定位，开门见山，符合快节奏阅读习惯"
    },
    {
      "if": "emotion_switch_tense_to_relaxed",
      "then": "summary_action_relief_signal",
      "because": "用总结性动作（松了口气/看着背影）标志危机暂时解除，然后切入新场景"
    },
    {
      "if": "emotion_switch_relaxed_to_tense",
      "then": "sudden_external_interrupt",
      "because": "用突然的外部动作或一句话打破平静，直接将节奏拉紧"
    }
  ]',
  '[
    {"template": "", "type": "省略号硬切", "context": "最常用的场景分隔符，明确切割不同场景"},
    {"template": "第二天一早，天刚刚亮的时候", "type": "时间标记式", "context": "跨天转场"},
    {"template": "当XX做完这一切以后，已经是XXX了。", "type": "时间压缩式", "context": "省略过程，直接标注结果时间"},
    {"template": "时间过得很快，转眼间就到了XXX。", "type": "模糊跳跃式", "context": "快速跳过无剧情意义的时段"},
    {"template": "XXX（地点），夏。", "type": "标签式开场", "context": "章节开头直接定位时间地点"},
    {"template": "与此同时，在XXX的XXX", "type": "平行叙事切换", "context": "展示另一方的动态"},
    {"template": "当XX再次睁开眼睛的时候，发现自己正在XXX。", "type": "意识恢复切换", "context": "以睡眠/昏迷为时间跳跃节点"},
    {"template": "夜，深了。", "type": "氛围时间标记", "context": "以极简句标注时间推移"},
    {"template": "一阵XXX后，XX发现", "type": "声音/事件触发式", "context": "以外部事件打断当前状态"},
    {"template": "回到XXX后，XX", "type": "归来标记式", "context": "以归来动作标志场景切换"}
  ]',
  '[
    "\"他慢慢地走在回去的路上，思绪万千，看着路边的风景逐渐变化，大约过了半个小时，他终于来到了目的地的大门前。\"（过程描写过于细腻，拖慢整体快节奏）",
    "夕阳的余晖渐渐隐没在地平线下，夜的帷幕缓缓拉开，星星开始眨眼（抒情慢转场，节奏断裂）",
    "因为刚才的决定导致了XXX，所以现在我必须前往XXX来弥补（说明文式过渡）"
  ]',
  '{
    "time_signals": ["第二天一早", "晌午刚过", "时间过得很快", "夜，深了", "已经是XXX了"],
    "space_signals": ["", "XXX（地点），夏", "回到XXX后", "与此同时"],
    "emotion_reset_signals": ["XX看着XXX的背影松了口气", "\"站住！\"", "一阵XXX后"]
  }',
  '{
    "typical": [
      "",
      "2002年，横店，夏。",
      "第二天一早，天刚刚亮的时候",
      "当XX做完这一切以后，已经是XXX了。",
      "夜，深了。"
    ],
    "counter": [
      "他慢慢地走在回去的路上，思绪万千（过程描写过长）",
      "夕阳的余晖渐渐隐没（抒情慢转场）"
    ]
  }',
  '转场追求极致效率。省略号硬切和时间+地点标签是两大核心手法，绝不允许抒情性慢转场或过程性描写作为过渡。',
  'seed',
  1700000003
);

-- ============================================================
-- 4. 章节收尾钩子句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_structure_002',
  'wenyi',
  'structure',
  '章节收尾钩子句',
  'High',
  '[
    {
      "if": "chapter_ending AND new_problem_emerging",
      "then": "question_mark_hook OR sudden_crisis_hook",
      "because": "将新麻烦作为未解决的问题抛给读者，直接转化为驱动下一章阅读的动力"
    },
    {
      "if": "chapter_ending AND protagonist_in_shock_or_confusion",
      "then": "blank_mind_hook OR triple_question_hook",
      "because": "主角的茫然和困惑与读者同步，制造强烈的未完成感"
    },
    {
      "if": "chapter_ending AND unexpected_person_or_event_appears",
      "then": "sudden_appearance_hook",
      "because": "新变量的突然出现打破现有格局，强制读者翻页寻求答案"
    },
    {
      "if": "chapter_ending AND protagonist_realizes_bigger_challenge",
      "then": "escalation_realization_hook",
      "because": "主角意识到真正的麻烦才刚开始，制造更大的期待和紧张感"
    }
  ]',
  '[
    {"template": "XX看着眼前的XXX，一时间XXX（愣住了/傻眼了）。", "type": "震惊反应钩子", "context": "突发状况让主角措手不及"},
    {"template": "他看着XXX，脑海中只剩下一连串的问号：？？？", "type": "问号钩子", "context": "以标点符号直接呈现主角的茫然"},
    {"template": "就在这时，一个XXX突然从XXX传来。", "type": "突发事件钩子", "context": "新声音或新身影的突然出现"},
    {"template": "我是谁？我在哪？我在做什么？XX感觉自己的脑子一片空白。", "type": "三连问崩溃钩子", "context": "情绪崩溃式结尾，制造喜剧感和期待"},
    {"template": "XX张了张嘴，却发现自己一个字都说不出来，场面一度非常尴尬。", "type": "尴尬僵局钩子", "context": "以尴尬状态结尾，制造喜剧悬念"},
    {"template": "事情的发展，似乎完全超出了他的预料。", "type": "预料之外钩子", "context": "暗示局势失控，引发读者好奇"},
    {"template": "他低头看了看XXX，然后，整个人都XXX了。", "type": "发现冲击钩子", "context": "发现关键信息后的强烈反应"},
    {"template": "\"你！你说什么！\"XXX猛地站了起来，死死地盯着XX。", "type": "对方爆发钩子", "context": "以对方的强烈反应结尾，制造对抗悬念"},
    {"template": "我该怎么办？XX现在很方，冷汗瞬间就下来了。", "type": "主角慌乱钩子", "context": "主角陷入困境，以慌乱状态结尾"},
    {"template": "这一刻，XX突然意识到，真正的XXX才刚刚开始。", "type": "升级预告钩子", "context": "以叙述者口吻预告更大的挑战"}
  ]',
  '[
    "\"他解决了所有问题，心满意足地看着夕阳西下，对美好的明天充满了希望。\"（过于圆满，缺乏悬念）",
    "就这样，一天又过去了。（完全闭合，零追读动力）",
    "看着远方的夕阳，他心中一片宁静。（纯抒情，信息量为零）",
    "经过这件事，他明白了一个深刻的道理：XXX。（总结陈词，失去悬念）"
  ]',
  '{}',
  '{
    "typical": [
      "他打算做出改变了！",
      "我特么成功了？",
      "我该怎么办？",
      "文化人的世界，能叫无耻吗？",
      "万事俱备，只欠肥羊",
      "\"？？？\"",
      "XX慌了！"
    ],
    "counter": [
      "就这样，一天又过去了。（完全闭合）",
      "看着远方的夕阳，他心中一片宁静。（纯抒情）"
    ]
  }',
  '章节结尾必须留钩子。悬念收（70%）和情绪收（30%）是两大类型，禁止完全闭合和纯抒情收尾。以主角的茫然、慌乱或意外发现作为最高频的钩子形式。',
  'seed',
  1700000003
);

-- ============================================================
-- 5. 心理独白句（第一版占位，由下方第二版覆盖）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_psychology_001',
  'wenyi',
  'psychology',
  '心理独白句',
  'High',
  '[
    {
      "if": "protagonist_behavior_contradicts_inner_state",
      "then": "inner_monologue_reveals_contrast",
      "because": "内外反差是文娱题材制造喜剧效果和角色魅力的核心手段，让读者进入主角内心弹幕"
    },
    {
      "if": "protagonist_encounters_strong_stimulus_or_turning_point",
      "then": "short_reactive_monologue",
      "because": "模仿人类受冲击时的瞬间反应，快速传达情绪，保持情节紧凑感"
    },
    {
      "if": "protagonist_needs_self_motivation_before_key_action",
      "then": "slogan_style_self_encouragement",
      "because": "简单粗暴的自我催眠和鼓劲，短句最有效，制造紧张感和喜剧感"
    },
    {
      "if": "protagonist_needs_to_rationalize_questionable_behavior",
      "then": "self_justification_monologue",
      "because": "为行为找宏大理由，降低道德负担，同时制造读者的会心一笑"
    }
  ]',
  '[
    {"template": "XX心想，这XXX比想象中要XXX得多。", "type": "局势评估式", "context": "对当前情况的快速判断"},
    {"template": "（内心吐槽）我特么的这和说好的剧本完全不一样啊！", "type": "吐槽式", "context": "现实与预期不符时的内心抱怨"},
    {"template": "XX在心中不断给自己打气：XXX就发达了！", "type": "自我鼓劲式", "context": "关键行动前的自我催眠"},
    {"template": "草/妈蛋，这次装逼看来要XXX了，得想个办法圆回来。", "type": "危机应对式", "context": "意识到局面失控时的即时反应"},
    {"template": "看着XXX，XX心里一阵XXX，但表面上依旧云淡风轻。", "type": "内外反差式", "context": "内心与外表的对比，制造喜剧感"},
    {"template": "XX告诉自己，必须XXX，人设不能崩！", "type": "人设维护式", "context": "强行维持形象的自我告诫"},
    {"template": "我该怎么办？我现在很方，得赶紧想个对策。", "type": "慌乱求解式", "context": "陷入困境时的即时反应"},
    {"template": "不管了，拼了！大不了XXX，反正不能怂。", "type": "破釜沉舟式", "context": "背水一战时的决心"},
    {"template": "这杀千刀的世道不骗老实人骗谁？", "type": "自我合理化式", "context": "为不道德行为找宏大理由"},
    {"template": "真他娘漂亮！", "type": "直接情绪爆发式", "context": "强烈感官冲击下的即时反应"}
  ]',
  '[
    "\"我为何会沦落至此？人生的意义究竟为何？这种存在主义的虚无感包裹着我\"（过于深刻文艺的哲学思辨，与主角务实吐槽风格不符）",
    "\"我这样做是不是有点不道德？内心真过意不去。\"（道德自省，主角不做此类反思）",
    "\"万一失败了怎么办？我好害怕。\"（暴露恐惧，破坏行动派人设）"
  ]',
  '{}',
  '{
    "stats": {
      "surface_level_thought_ratio": "20%（动作反应，如愣住了）",
      "direct_inner_monologue_ratio": "75%（直接想法/吐槽/决策）",
      "deep_subconscious_ratio": "5%（比喻式深层描写，如野猫）"
    },
    "trigger_scenes": {
      "most_dense": "做出重大决定前、与人交锋时、装逼前后的内心活动",
      "secondary": "遭遇强烈感官冲击（如美女出现）时"
    },
    "protagonist_self_assessment": [
      "XX心想，这XXX比想象中要XXX得多。",
      "（内心吐槽）我特么的这和说好的剧本完全不一样啊！",
      "XX在心中不断给自己打气：XXX就发达了！",
      "草/妈蛋，这次装逼看来要XXX了，得想个办法圆回来。",
      "看着XXX，XX心里一阵XXX，但表面上依旧云淡风轻。",
      "XX告诉自己，必须XXX，人设不能崩！",
      "我该怎么办？我现在很方，得赶紧想个对策。",
      "不管了，拼了！大不了XXX，反正不能怂。",
      "这杀千刀的世道不骗老实人骗谁？",
      "真他娘漂亮！"
    ],
    "others_assessment_of_protagonist": [
      "XXX看着XX，觉得这个人XXX（很有趣/有点东西/不像个骗子）。",
      "在XXX眼里，XX简直就是个XXX（怪人/不知天高地厚的家伙）。",
      "XXX心想，这世界上怎么会有如此XXX的人？",
      "难道，他真的XXX？XXX开始有些怀疑自己的判断。",
      "XXX摇了摇头，她觉得XX根本就是个XXX，自己看走眼了。",
      "XX的这一手操作，让XXX瞬间就XXX（愣住了/刮目相看）。",
      "XXX完全看不透XX这个人，他到底想干什么？",
      "这个人，看起来XXX，但又觉得XXX（处处透着古怪和不协调）。",
      "XXX开始怀疑，XX刚才那番话到底是不是在XXX（说谎/装傻）。",
      "起初XXX以为他只是个XXX，但现在看来，事情没那么简单。"
    ]
  }',
  '严格锁定主角有限第三人称视角，大量使用直白的中层心理描写展现主角动机、情绪和吐槽。内外反差是制造喜剧效果的核心手法，绝不暴露哲理思辨或道德挣扎。',
  'seed',
  1700000003
);

-- ============================================================
-- 4. 章节收尾钩子句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_structure_002',
  'wenyi',
  'structure',
  '章节收尾钩子句',
  'High',
  '[
    {
      "if": "chapter_ending AND protagonist_faces_new_obstacle",
      "then": "panic_question_hook OR situation_reversal_hook",
      "because": "以主角的困境或疑问结尾，制造强烈未完成感，最大化激励读者点击下一章"
    },
    {
      "if": "chapter_ending AND new_threat_or_character_appears",
      "then": "sudden_voice_or_presence_hook",
      "because": "以突然出现的声音或人物结尾，直接制造危机感驱动翻页"
    },
    {
      "if": "chapter_ending AND protagonist_achieves_partial_success",
      "then": "ironic_self_question_hook OR fate_foreshadow_hook",
      "because": "以反问或叙述者预示结尾，在成功中埋下新的不确定性"
    },
    {
      "if": "chapter_ending AND protagonist_completely_exposed_or_humiliated",
      "then": "emotional_collapse_hook OR blank_mind_hook",
      "because": "以主角情绪崩溃或脑子空白结尾，制造情绪低谷，为下章反弹蓄力"
    }
  ]',
  '[
    {"template": "XX看着眼前的XXX，一时间XXX（愣住了/傻眼了）。", "type": "震惊反应钩子", "context": "突发状况让主角措手不及"},
    {"template": "他看着XXX，脑海中只剩下一连串的问号：？？？", "type": "标点悬念钩子", "context": "用标点符号直接表达困惑"},
    {"template": "就在这时，一个XXX突然从XXX传来。", "type": "突发事件钩子", "context": "新威胁或新角色的突然出现"},
    {"template": "我是谁？我在哪？我在做什么？XX感觉自己的脑子一片空白。", "type": "情绪崩溃钩子", "context": "主角完全失控时的内心独白"},
    {"template": "XX张了张嘴，却发现自己一个字都说不出来，场面一度非常尴尬。", "type": "尴尬僵局钩子", "context": "主角被逼到无话可说的境地"},
    {"template": "事情的发展，似乎完全超出了他的预料。", "type": "预期落空钩子", "context": "局势失控的简洁总结"},
    {"template": "他低头看了看XXX，然后，整个人都XXX（不好了/懵了）。", "type": "发现悬念钩子", "context": "发现关键信息后的震惊"},
    {"template": "\"你！你说什么！\"XXX猛地站了起来，死死地盯着XX。", "type": "对方爆发钩子", "context": "以对方的强烈反应结尾"},
    {"template": "我该怎么办？XX现在很方，冷汗瞬间就下来了。", "type": "主角慌乱钩子", "context": "主角陷入困境的直接表达"},
    {"template": "这一刻，XX突然意识到，真正的XXX才刚刚开始。", "type": "预告式钩子", "context": "以叙述者口吻预告后续高潮"}
  ]',
  '[
    "\"他解决了所有问题，心满意足地看着夕阳西下，对美好的明天充满了希望。\"（过于圆满，缺乏悬念）",
    "就这样，一天又过去了。（完全闭合，零追读动力）",
    "看着远方的夕阳，我心中一片宁静。（纯抒情，信息量为零）",
    "经过这件事，他明白了一个深刻的道理：XXX。（总结陈词，失去悬念）"
  ]',
  '{}',
  '{
    "typical": [
      "XX看着眼前的XXX，一时间愣住了/傻眼了。",
      "他看着XXX，脑海中只剩下一连串的问号：？？？",
      "我该怎么办？XX现在很方，冷汗瞬间就下来了。",
      "\"你！你说什么！\"XXX猛地站了起来，死死地盯着XX。",
      "这一刻，XX突然意识到，真正的XXX才刚刚开始。"
    ],
    "counter": [
      "就这样，一天又过去了。（完全闭合）",
      "看着远方的夕阳，我心中一片宁静。（纯抒情）"
    ]
  }',
  '章节结尾必须留钩子。悬念收（70%）和情绪收（30%）是两大类型，禁止完全闭合和纯抒情收尾。主角困境、突发事件、情绪崩溃是三大核心钩子触发场景。',
  'seed',
  1700000003
);

-- ============================================================
-- 5. 心理独白句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_psychology_001',
  'wenyi',
  'psychology',
  '心理独白句',
  'High',
  '[
    {
      "if": "protagonist_behavior_contradicts_true_feelings AND performing_facade",
      "then": "colloquial_inner_monologue_revealing_contrast",
      "because": "内外反差是文娱题材喜剧效果和角色魅力的核心来源，口语化吐槽让读者进入主角内心弹幕"
    },
    {
      "if": "protagonist_encounters_strong_stimulus_or_plot_twist",
      "then": "short_reactive_psychological_description",
      "because": "模仿人类受冲击时的瞬间反应，快速传达情绪，保持情节紧凑感"
    },
    {
      "if": "protagonist_needs_self_motivation_before_key_action",
      "then": "slogan_style_self_encouragement",
      "because": "简单粗暴的自我催眠和鼓劲，短句最有效，传达紧张和不确定中的强行决心"
    },
    {
      "if": "protagonist_needs_to_rationalize_questionable_behavior",
      "then": "self_justification_monologue",
      "because": "为行为找宏大理由，降低道德负担，同时制造喜剧效果"
    }
  ]',
  '[
    {"template": "XX心想，这XXX比想象中要XXX得多。", "type": "局势判断式", "context": "对当前情况的快速评估"},
    {"template": "（内心吐槽）我特么的这和说好的剧本完全不一样啊！", "type": "崩溃吐槽式", "context": "现实与预期落差时的内心爆发"},
    {"template": "XX在心中不断给自己打气：XXX就发达了！", "type": "自我鼓劲式", "context": "关键行动前的自我催眠"},
    {"template": "草/妈蛋，这次装逼看来要XXX了，得想个办法圆回来。", "type": "危机应对式", "context": "被识破或失控时的紧急应对"},
    {"template": "看着XXX的反应，XX心里一阵XXX，但表面上依旧云淡风轻。", "type": "内外反差式", "context": "内心与外表的鲜明对比"},
    {"template": "XX告诉自己，必须XXX，人设不能崩！", "type": "人设维护式", "context": "强行维持形象的自我告诫"},
    {"template": "我该怎么办？我现在很方，得赶紧想个对策。", "type": "慌乱求解式", "context": "陷入困境时的即时反应"},
    {"template": "不管了，拼了！大不了XXX，反正不能怂。", "type": "破釜沉舟式", "context": "无路可退时的孤注一掷"},
    {"template": "这杀千刀的世道不骗老实人骗谁？", "type": "自我合理化式", "context": "为不道德行为找借口"},
    {"template": "XX看着眼前的XXX，脑子里只有一个念头：XXX。", "type": "单一念头式", "context": "强烈刺激下的思维简化"}
  ]',
  '[
    "\"我为何会沦落至此？人生的意义究竟为何？这种存在主义的虚无感包裹着我\"（过于深刻文艺的哲学思辨，与主角务实吐槽风格不符）",
    "\"我这样做是不是有点不道德？内心真过意不去。\"（道德自省，主角不做此类反思）",
    "\"万一失败了怎么办？我好害怕。\"（暴露恐惧，破坏行动派人设）"
  ]',
  '{
    "undercurrent": ["微微一愣/一怔", "奇怪地看着", "皱眉", "下意识地", "沉默", "眼神闪过一丝深意", "嘴角微微露出些许弧度"],
    "open_conflict": ["你什么意思？", "你是不是觉得", "继续抢话", "盯着XX", "目光相当锐利", "挑衅"],
    "explosion": ["草/握草/妈蛋/呸", "你！", "骗！", "站起来", "猛地", "狠狠地", "脸色大变"]
  }',
  '{
    "stats": {
      "surface_level_thought_ratio": "20%（动作反应，如愣住了）",
      "direct_inner_monologue_ratio": "75%（直接想法/吐槽/决策）",
      "deep_subconscious_ratio": "5%（比喻式深层，如野猫）"
    },
    "protagonist_self_assessment": [
      "XX心想，这XXX比想象中要XXX得多。",
      "（内心吐槽）我特么的这和说好的剧本完全不一样啊！",
      "XX在心中不断给自己打气：XXX就发达了！",
      "草/妈蛋，这次装逼看来要XXX了，得想个办法圆回来。",
      "看着XXX的反应，XX心里一阵XXX，但表面上依旧云淡风轻。",
      "XX告诉自己，必须XXX，人设不能崩！",
      "我该怎么办？我现在很方，得赶紧想个对策。",
      "不管了，拼了！大不了XXX，反正不能怂。",
      "这杀千刀的世道不骗老实人骗谁？",
      "XX看着眼前的XXX，脑子里只有一个念头：XXX。"
    ],
    "others_assessment_of_protagonist": [
      "XXX看着XX，觉得这个人XXX（很有趣/有点东西/不像个骗子）。",
      "在XXX眼里，XX简直就是个XXX（怪人/不知天高地厚的家伙）。",
      "XXX心想，这世界上怎么会有如此XXX（冒着傻气/厚脸皮）的人？",
      "难道，他真的XXX（懂行/有才华）？XXX开始有些怀疑自己的判断。",
      "XXX摇了摇头，她觉得XX根本就是个XXX，自己看走眼了。",
      "XX的这一手操作，让XXX瞬间就XXX（愣住了/刮目相看）。",
      "XXX完全看不透XX这个人，他到底想干什么？",
      "这个人，看起来XXX（很真诚），但又觉得XXX（处处透着古怪和不协调）。",
      "XXX开始怀疑，XX刚才那番话到底是不是在XXX（说谎/装傻）。",
      "起初XXX以为他只是个XXX（小角色/愣头青），但现在看来，事情没那么简单。"
    ],
    "trigger_scenes": {
      "most_dense": "做出重大决定前、与人交锋时、以及装逼前后的内心活动",
      "secondary": "遭遇强烈刺激或情节转折时"
    }
  }',
  '严格锁定主角有限第三人称视角，大量使用直白的中层心理描写展现动机、情绪和吐槽。内外反差是喜剧效果核心，口语化吐槽是最高频的独白类型。',
  'seed',
  1700000003
);

-- ============================================================
-- 6. 他人对主角的评价
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_psychology_002',
  'wenyi',
  'psychology',
  '心理独白句（他人对主角评价）',
  'Medium',
  '[
    {"if": "industry_insider_observing_protagonist_first_time","then": "dismissive_or_skeptical_evaluation","because": "行业内人士的初始轻视是文娱题材欲扬先抑的标准铺垫，为后续打脸蓄力"},
    {"if": "antagonist_reassessing_protagonist_after_unexpected_performance","then": "threat_recognition_or_grudging_respect","because": "对手的重新评估是主角开始崛起的信号，增加后续对抗的合理性和张力"},
    {"if": "bystander_witnessing_protagonist_highlight_moment","then": "shock_or_collective_reevaluation","because": "群体反应是文娱题材高光时刻的放大器，通过他人震惊强化主角的逆袭爽感"},
    {"if": "ally_or_mentor_observing_protagonist_potential","then": "quiet_recognition_with_expectation","because": "伯乐式的静默认可比直接赞美更有分量，为主角提供情感支撑"}
  ]',
  '[
    {"template": "XXX看着XX，心里暗暗摇头：这种人，在这行里能走多远？", "type": "行业人士轻视式", "context": "初次接触时的否定评价，为打脸铺垫"},
    {"template": "XXX皱了皱眉，这个人……有点意思。", "type": "对手初步警觉式", "context": "对手感知到主角潜力后的第一反应"},
    {"template": "在XXX眼里，XX不过是个不知天高地厚的愣头青，迟早碰壁。", "type": "前辈俯视式", "context": "有经验者对新人的惯性轻视"},
    {"template": "XXX心想，这小子到底是真不懂规矩，还是装的？", "type": "疑惑评估式", "context": "对主角行为的困惑，无法定性"},
    {"template": "XXX的眼神变了，她没想到，这个人居然……", "type": "预期颠覆式", "context": "主角表现超出预期后的震惊"},
    {"template": "XXX看着台上的XX，突然有种说不清楚的感觉——这个人，以后会很麻烦。", "type": "对手深层预感式", "context": "有眼力的对手感知到主角的威胁性"},
    {"template": "周围的人都愣住了，没有人说话，所有人都在看着XX。", "type": "集体震惊式", "context": "高光时刻的群体反应，放大爽感"},
    {"template": "XXX没有说话，只是静静地看着XX，眼神里有什么东西在变化。", "type": "伯乐静默认可式", "context": "导师/伯乐的无声认可，分量最重"},
    {"template": "XXX心里有些不是滋味——凭什么？这个人凭什么？", "type": "竞争者嫉妒式", "context": "同级竞争者的嫉妒心理，侧面抬高主角"},
    {"template": "起初XXX以为他只是个XXX，但现在看来，事情没那么简单。", "type": "认知修正式", "context": "对主角的判断从轻视转向重视"}
  ]',
  '[
    "XXX真是个天才，我从心底里佩服他。（过于直白的正面赞美，文娱题材的认可都是含蓄的）",
    "大家都觉得XX很厉害，纷纷鼓掌。（集体正向反应，不符合行业竞争的现实逻辑）"
  ]',
  '{}',
  '{}',
  '他人对主角的评价分三个阶段：初始轻视（铺垫）→ 困惑/警觉（转折信号）→ 震惊/认可（爽点放大）。评价始终含蓄，绝不直白赞美，通过他人的态度变化折射主角的成长轨迹。',
  'seed',
  1700000003
);

-- ============================================================
-- 7. 节奏控制规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_rhythm_001',
  'wenyi',
  'rhythm',
  '节奏控制规则',
  'High',
  '[
    {"if": "protagonist_inner_tucao_peaks OR key_emotion_moment","then": "single_line_paragraph","because": "在视觉上形成停顿，强化该句的冲击力和喜剧效果，如电影慢镜头"},
    {"if": "scene_type == verbal_sparring OR fast_plot_advance","then": "short_sentences_max_12_chars + rapid_line_breaks","because": "高频视觉切换模拟紧张节奏，75%短句比例，加快阅读速度"},
    {"if": "scene_type == background_or_environment_or_memory","then": "long_compound_sentences + longer_paragraphs","because": "舒缓句式给读者消化信息的空间，营造沉浸感"},
    {"if": "dialogue_rounds >= 3_to_5","then": "insert_single_sentence_narration_max_45_chars","because": "防止对话悬浮，保持场景感，叙述插入不干扰对话流畅度"},
    {"if": "highlight_moment_or_face_slap_completed","then": "insert_brief_environment_or_reaction_sentence","because": "给读者情绪释放节点，强化爽感，不立即推进下一事件"}
  ]',
  '[
    {"template": "文化人的世界，能叫无耻吗？", "type": "单行段-自我合理化", "context": "装逼或不道德行为后的慢镜头总结"},
    {"template": "万事俱备，只欠肥羊。", "type": "单行段-计划完成", "context": "布局完成后的自得感"},
    {"template": "我特么成功了？", "type": "单行段-震惊自问", "context": "意外成功时的不敢置信"},
    {"template": "XX慌了！", "type": "单行段-状态标注", "context": "紧张场景的快速状态呈现"},
    {"template": "\"？？？\"", "type": "单行段-标点情绪", "context": "完全懵圈时的极简表达"},
    {"template": "他打算做出改变了！", "type": "单行段-决心宣告", "context": "关键转折点的情绪强调"},
    {"template": "XX看着XXX的反应，嘴角微微上扬。", "type": "短句-高光收尾", "context": "打脸成功后的克制得意"},
    {"template": "场面，一度非常尴尬。", "type": "单行段-喜剧定格", "context": "尴尬场景的喜剧式总结"}
  ]',
  '[
    "在紧张冲突场景中使用超过30字的长句（破坏紧张感）",
    "通篇超过150字的连续心理分析段落（节奏断裂）",
    "意识流或蒙太奇手法（所有场景切换清晰直白）"
  ]',
  '{}',
  '{}',
  '节奏由目的性事件驱动。单行段是文娱题材最重要的节奏工具，用于强化吐槽、定格高光、制造喜剧感。对话场景保持极短段落，叙述插入不超过45字。',
  'seed',
  1700000003
);

-- ============================================================
-- 8. 描写技法规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_description_001',
  'wenyi',
  'description',
  '描写技法规则',
  'High',
  '[
    {"if": "important_character_first_appearance","then": "overall_impression THEN key_prop_or_detail THEN temperament_summary","because": "文娱题材人物描写聚焦整体印象→关键道具→气质总结，服务于角色在行业中的定位"},
    {"if": "need_show_character_industry_status","then": "use_brand_equipment_work_as_symbol","because": "行业符号快速建立角色的专业坐标，比形容词更有说服力"},
    {"if": "need_show_protagonist_composure_under_pressure","then": "describe_body_sensation_and_micro_expression","because": "体感描写配合克制的外表，制造内外张力，强化角色的表演感"},
    {"if": "chapter_opens_new_scene OR emotional_turning_point","then": "brief_sensory_environment_description_max_60_chars","because": "快速建立场景基调，以体感为主，视觉为辅"}
  ]',
  '[
    {"template": "XXX穿着一件XXX，手里拿着XXX，站在XXX门口，看起来XXX。", "type": "整体印象+道具式", "context": "人物登场，服装+道具快速定位"},
    {"template": "她的笑容很职业，眼神却不在这里。", "type": "气质矛盾式", "context": "通过细节矛盾暗示角色的复杂性"},
    {"template": "XXX的化妆台上摆着XXX，这在这个行业里意味着XXX。", "type": "行业符号式", "context": "通过道具暗示角色的行业地位"},
    {"template": "XX感觉心跳快了一拍，但脸上依旧挂着那个标准的微笑。", "type": "体感+外表反差式", "context": "内心紧张与外表从容的对比"},
    {"template": "灯光亮起来的瞬间，整个片场安静了。", "type": "环境定格式", "context": "关键时刻的场景定格，制造仪式感"},
    {"template": "XXX的眼神扫过来，只有一秒，但XX感觉像是被看穿了。", "type": "眼神冲击式", "context": "强者眼神的压迫感描写"},
    {"template": "那个剧本，比XX想象中要厚得多。", "type": "道具信息式", "context": "通过道具细节传递信息"},
    {"template": "舞台的灯光很热，汗水顺着脊背往下流，但XX没有动。", "type": "体感坚持式", "context": "关键表演时刻的身体感知"}
  ]',
  '[
    "她长得很美，像仙女一样。（空洞形容词，无行业信息）",
    "天空很蓝，白云很白。（纯景物，无叙事功能）",
    "超过100字的连续外貌描写段落（文娱题材首次出场控制在90字以内）"
  ]',
  '{}',
  '{}',
  '文娱描写以行业符号和体感描写为核心。道具和环境服务于角色的行业定位，体感描写制造内外张力。描写密度适中，首次出场90字以内。',
  'seed',
  1700000003
);

-- ============================================================
-- 9. 叙事结构规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_structure_003',
  'wenyi',
  'structure',
  '叙事结构规则',
  'High',
  '[
    {"if": "chapter_opening AND need_hook_reader","then": "inner_conflict_start_60pct OR environment_start_30pct OR dialogue_start_10pct","because": "文娱题材以主角内心冲突开场为主（60%），直接拉入主角的处境和情绪"},
    {"if": "chapter_approaching_end AND core_conflict_unresolved","then": "suspense_ending_70pct OR emotional_resonance_30pct","because": "文娱题材悬念收尾比例最高（70%），以主角困境或意外发现驱动追读"},
    {"if": "protagonist_about_to_perform_highlight_moment","then": "setup_doubt_or_setback_first","because": "欲扬先抑是文娱题材情绪曲线的核心模式，高光前必须有被质疑或轻视的铺垫"},
    {"if": "protagonist_completes_small_goal","then": "immediately_introduce_next_bigger_obstacle","because": "保持叙事连续性，避免情节松弛，每个小胜利后立即引入新挑战"}
  ]',
  '[
    {"template": "XX盯着手机屏幕上的那条消息，心里有点乱。", "type": "内心冲突开场", "context": "直接拉入主角的情绪状态"},
    {"template": "2002年，横店，夏。XX站在群演通道里，手里攥着一个剧本。", "type": "时间地点+状态开场", "context": "快速建立场景和主角处境"},
    {"template": "\"就这水平，还想XXX？\"XXX冷冷地扫了XX一眼。", "type": "欲扬先抑铺垫", "context": "高光时刻前的质疑和轻视"},
    {"template": "事情解决了，但XX还没来得及松口气，手机就响了。", "type": "胜利后即转折", "context": "防止情节松弛的即时转折"},
    {"template": "XX看着那个名字，愣了很久。", "type": "悬念收尾", "context": "以主角的反应暗示重大信息"},
    {"template": "这件事，算是告一段落了。但XX知道，真正的麻烦才刚刚开始。", "type": "小闭环+新钩子", "context": "完成一个事件弧线，同时开启下一个"}
  ]',
  '[
    "高潮置于章节前1/3（前移导致后段拖沓）",
    "完全闭合式结尾（无悬念信息的平静收场）",
    "非线性叙事结构（故事线保持单向线性）",
    "超过4章的纯日常无冲突段落"
  ]',
  '{
    "undercurrent": ["微微一愣/一怔", "奇怪地看着", "皱眉", "下意识地", "沉默", "眼神闪过一丝深意"],
    "open_conflict": ["你什么意思？", "你是不是觉得", "继续抢话", "盯着XX", "目光相当锐利", "挑衅"],
    "explosion": ["草/握草/妈蛋/呸", "你！", "骗！", "站起来", "猛地", "狠狠地", "脸色大变"]
  }',
  '{}',
  '文娱结构以装逼-打脸微循环为核心，3-4章完成一个事件弧。欲扬先抑是情绪曲线核心模式，高光置于章节末尾，悬念收尾比例最高（70%）。',
  'seed',
  1700000003
);

-- ============================================================
-- 10. 信息密度规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_info_density_001',
  'wenyi',
  'info_density',
  '信息密度规则',
  'High',
  '[
    {"if": "chapter_opens_and_reader_needs_industry_context","then": "deliver_through_bystander_gossip_or_industry_insider_dialogue","because": "行业内幕通过旁人对话投放比旁白更自然，同时建立行业氛围"},
    {"if": "need_reveal_protagonist_background_or_past","then": "embed_in_reaction_to_current_event","because": "通过主角对当前事件的反应自然带出背景，避免突兀的回忆段落"},
    {"if": "need_setup_next_event_arc_foreshadowing","then": "casual_mention_in_dialogue_or_prop","because": "以道具或对话中的随口一提埋下伏笔，1-2章内快速回收"},
    {"if": "chapter_approaching_end AND need_next_chapter_setup","then": "introduce_new_name_or_opportunity_without_explanation","because": "制造信息缺口，读者带着疑问进入下一章，核心追读驱动技法"}
  ]',
  '[
    {"template": "\"哎，你知道吗，XXX最近好像要XXX了……\"旁边有人在低声议论。", "type": "旁人八卦式", "context": "通过旁人对话引入行业信息"},
    {"template": "XX看着合同上的数字，想起了三年前自己第一次签约时的情形。", "type": "对比触发回忆式", "context": "通过当前事件自然带出背景"},
    {"template": "\"对了，XXX那边有个XXX的机会，你有没有兴趣？\"", "type": "配角提醒式", "context": "通过配角引入下一事件弧"},
    {"template": "桌上放着一份合同，抬头写着XXX的名字。", "type": "道具信息式", "context": "通过道具细节传递关键信息"},
    {"template": "\"XXX？\"XX愣了一下，这个名字，他在哪里听过？", "type": "信息缺口式", "context": "以主角的困惑制造追读动力"},
    {"template": "这个行业里，有些事情是不能说的。XX知道，但他没想到会这么快。", "type": "行业潜规则暗示式", "context": "暗示行业黑暗面，制造悬念"}
  ]',
  '[
    "大段说明文式旁白（超过150字的连续行业背景介绍）",
    "与主线无关的闲笔信息（所有信息都为当前或下一章节情节服务）",
    "长线复杂伏笔超过3章不回收（文娱题材伏笔回收极快1-2章）"
  ]',
  '{}',
  '{}',
  '文娱信息密度最高（每章5-7个信息点），开头集中投放（70%）。行业八卦和道具细节是两大核心信息载体，伏笔回收极快（1-2章），每章末尾必须留信息缺口驱动追读。',
  'seed',
  1700000003
);

-- ============================================================
-- 11. 对话收尾句（文娱）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_dialogue_close_001',
  'wenyi',
  'dialogue',
  '对话收尾句',
  'High',
  '[
    {"if": "protagonist_won_the_exchange AND wants_to_signal_dominance","then": "drop_one_line_and_leave_without_waiting_for_response","because": "赢家不需要确认，最后一句话扔下去就走，沉默留给对方，主动权始终在主角手里"},
    {"if": "protagonist_lost_or_was_exposed AND needs_to_exit_gracefully","then": "reframe_the_situation_then_redirect_attention","because": "被识破时不能直接认输，用重新定义话题或转移焦点来收场，保住人设"},
    {"if": "dialogue_reached_stalemate AND both_sides_need_to_step_back","then": "use_action_to_end_words_let_behavior_speak","because": "言语僵局时用行动收场比继续争论更有力，行动本身就是最后的表态"},
    {"if": "protagonist_wants_to_leave_hook_for_next_interaction","then": "end_with_ambiguous_statement_that_invites_interpretation","because": "留一句让对方反复琢磨的话，比说清楚更有后续张力，为下一次交锋埋线"}
  ]',
  '[
    {"template": "【写法】主角说完最后一句话后，不等对方回应，直接转身或拿起某件东西开始做别的事，用行动宣告对话结束。对方的反应留给读者想象。", "type": "行动终止式", "context": "主角占优势时的收场，不给对方反驳空间"},
    {"template": "【写法】主角把话题从当前争议点转移到一个更实际的问题上，用"先解决XXX"或"这个之后再说"把对话引向行动，而不是继续争论。", "type": "议程转移式", "context": "僵局时主动掌握下一步方向"},
    {"template": "【写法】主角说一句表面上是让步、实则是反将一军的话，然后沉默，让对方意识到自己反而陷入了被动。", "type": "以退为进式", "context": "被质疑时的反向收场"},
    {"template": "【写法】主角说完后，描写对方的表情或沉默，用对方的反应来定性这场对话的胜负，主角本人不做任何评价。", "type": "他人反应定性式", "context": "通过对方的失语或震惊来宣告主角赢了"},
    {"template": "【写法】主角留下一句意思模糊、可以多种解读的话，然后离开。这句话要和本章的核心矛盾有关，让读者和对方都在猜主角的真实意图。", "type": "悬念留白式", "context": "为下一次交锋埋线"},
    {"template": "【写法】主角不说话，用一个具体的动作（放下某件东西、整理衣服、看向别处）来结束对话，这个动作要能传达出主角的情绪或态度。", "type": "无言动作式", "context": "言语已经说尽，用行为做最后表态"},
    {"template": "【写法】主角用一句话把对方的逻辑或立场彻底归纳成一个简单的标签，然后表示不屑继续，这个归纳要让对方无法反驳。", "type": "降维归纳式", "context": "对方说了很多，主角一句话定性"},
    {"template": "【写法】主角说完后，场景里出现一个外部事件（电话响、有人进来、某件事发生），自然打断对话，但这个外部事件要和本章剧情有关，不能是凭空出现的。", "type": "剧情事件打断式", "context": "用本章已有的剧情元素自然终止对话"}
  ]',
  '[
    "用一句和本章剧情无关的格言或感悟收场（脱离剧情的哲理腔）",
    "主角主动道歉或认错来结束对话（破坏人设）",
    "引入本章从未出现过的新人物或新信息来打断对话（外挂元素）",
    "用纯粹的景物描写来结束对话场景（无叙事功能的抒情）"
  ]',
  '{}',
  '{}',
  '对话收尾从本次交锋的走向里生长：赢了就用行动或沉默宣告，输了就用转移或重构保住人设，僵局就用行动代替言语。禁止外挂新元素，禁止脱离本章剧情的套路收场。',
  'seed',
  1700000003
);

-- ============================================================
-- 12. 冲突升级句（文娱）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_conflict_escalation_001',
  'wenyi',
  'conflict',
  '冲突升级句',
  'High',
  '[
    {"if": "user_instruction_implies_confrontation AND current_tension_is_low","then": "use_misunderstanding_or_information_gap_to_ignite","because": "文娱冲突通常从信息不对等开始——一方知道对方不知道的事，或者误解了对方的意图，这是最自然的点火方式"},
    {"if": "conflict_is_verbal_sparring AND needs_to_escalate","then": "have_one_side_cross_a_personal_boundary_or_reveal_a_secret","because": "言语交锋升级的关键是触碰到对方真正在意的东西，不是单纯加大音量"},
    {"if": "conflict_involves_power_imbalance AND protagonist_is_weaker","then": "let_protagonist_find_unexpected_leverage_mid_conflict","because": "文娱主角的逆转往往来自掌握了对方不知道自己知道的信息，这是装逼打脸的核心结构"},
    {"if": "conflict_is_about_to_peak AND needs_maximum_impact","then": "use_public_exposure_or_third_party_witness_to_amplify","because": "有观众的冲突比私下冲突爽感更强，旁观者的反应是冲突烈度的放大器"}
  ]',
  '[
    {"template": "【写法】冲突从低到高分三步：第一步是试探（一方说了一句话，另一方的反应暗示不对劲）；第二步是明牌（某一方说出了真实意图或掌握的信息）；第三步是爆发（另一方意识到自己被将了一军）。每一步都要有具体的对话或动作，不能跳步。", "type": "三步升级结构", "context": "完整的冲突升级节奏"},
    {"template": "【写法】在冲突中途，主角突然说出一个对方以为主角不知道的信息，用这个信息逆转局势。这个信息必须是本章或前几章已经埋下的，不能凭空出现。", "type": "信息逆转式", "context": "文娱装逼打脸的核心手法"},
    {"template": "【写法】冲突升级时，让第三方（旁观者、路过的人、突然进来的人）出现，他们的存在让冲突双方都不得不调整策略，同时他们的反应定性了冲突的走向。", "type": "第三方介入式", "context": "公开场合的冲突升级"},
    {"template": "【写法】用主角的内心独白来标记冲突升级的节点——不是描述冲突本身，而是主角在冲突中的实时判断（这人在试探我 / 他知道了 / 现在可以出牌了），让读者跟着主角的思路走。", "type": "内心独白标记节点式", "context": "让读者感受到主角的掌控感"},
    {"template": "【写法】冲突升级时，不要只靠对话，要加入具体的肢体动作或场景细节（站起来、走近、拿起某件东西），这些动作要和人物的情绪状态一致，不能是随机的。", "type": "动作强化升级式", "context": "让冲突有画面感而不只是嘴仗"}
  ]',
  '[
    "冲突升级靠提高音量或加感叹号（没有实质内容的情绪堆砌）",
    "引入和本章剧情无关的新矛盾来升级冲突（外挂冲突）",
    "冲突升级过程中主角暴露恐惧或软弱（破坏人设）",
    "用旁白直接告诉读者冲突很激烈（而不是通过对话和动作展示）"
  ]',
  '{}',
  '{}',
  '文娱冲突升级遵循信息不对等→明牌→爆发的三步结构。升级的关键是信息逆转和公开见证，不是情绪堆砌。每一步升级都要有具体的对话或动作支撑，禁止外挂新矛盾。',
  'seed',
  1700000003
);

-- ============================================================
-- 13. 开章与转场钩子（文娱）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_chapter_transition_001',
  'wenyi',
  'structure',
  '开章与转场钩子',
  'High',
  '[
    {"if": "user_instruction_implies_time_has_passed AND previous_chapter_ended_on_high_emotion","then": "carry_emotional_residue_into_new_scene_before_marking_time","because": "情绪高点之后硬切时间标记会打断读者的情绪连续性，应先用一两句话承接上章的情绪余韵，再自然过渡到新时间"},
    {"if": "user_instruction_points_to_new_location_or_new_scene","then": "use_protagonist_purposeful_action_as_transition_signal","because": "主角的目的性动作（去找某人、打开某个东西、走向某个地方）是最自然的转场信号，读者跟着人物走，不需要额外的时间标记"},
    {"if": "user_instruction_implies_new_chapter_start AND previous_chapter_ended_on_cliffhanger","then": "open_new_chapter_in_medias_res_at_the_consequence","because": "悬念收尾之后，新章节应该直接从悬念的后果开始，不要用时间标记或环境描写拉开距离，读者需要立刻知道发生了什么"},
    {"if": "user_instruction_implies_protagonist_reflection_or_alone_time","then": "use_sensory_detail_from_current_environment_to_anchor_the_scene","because": "独处场景的开场不需要时间标记，用主角当下感知到的一个具体细节（声音、光线、温度）来锚定场景，比时间标记更有沉浸感"},
    {"if": "user_instruction_implies_scene_switch_within_same_timeline","then": "use_contrast_or_parallel_to_connect_the_two_scenes","because": "同一时间线内的场景切换，用两个场景之间的对比或呼应来连接，比硬切更有叙事张力"}
  ]',
  '[
    {"template": "【写法】新章节开头，先用一句话承接上章最后的情绪状态（主角的感受或处境），然后再引入新场景的第一个具体细节。不要用时间标记开头，除非时间跳跃本身是信息点。", "type": "情绪承接式开章", "context": "上章情绪高点后的新章节"},
    {"template": "【写法】转场时，用主角正在做的一个具体动作来驱动切换——这个动作要和用户指令里的意图直接相关。读者跟着动作走，自然进入新场景，不需要解释。", "type": "动作驱动转场", "context": "用户指令明确指向新场景"},
    {"template": "【写法】新章节直接从上章悬念的后果现场开始，第一句话就是主角面对那个悬念的即时反应。不要用环境描写或时间标记拉开距离。", "type": "后果直入式开章", "context": "上章悬念收尾后的新章节"},
    {"template": "【写法】独处场景开章时，用主角感知到的一个具体感官细节（不是视觉，优先用听觉或触觉）来锚定场景，然后从这个细节自然引出主角的状态或思考。", "type": "感官锚定式开章", "context": "主角独处或反思场景"},
    {"template": "【写法】如果用户指令暗示需要时间跳跃，用一句话说明时间变化，但这句话要同时包含一个信息点（发生了什么变化），不能只是时间标记。", "type": "信息化时间标记", "context": "需要时间跳跃时"},
    {"template": "【写法】场景切换时，找到两个场景之间的一个共同元素（同一个人物、同一件事的不同侧面、情绪上的对比），用这个元素作为连接点，让切换有内在逻辑。", "type": "元素呼应式转场", "context": "同一时间线内的场景切换"}
  ]',
  '[
    "用"翌日清晨""第二天一早"等时间标记直接开章，不承接上章情绪（硬切）",
    "开章用大段环境描写来建立氛围，而不是直接进入人物状态（拖慢节奏）",
    "转场时引入上章没有出现过的新元素来驱动切换（外挂转场）",
    "用"话说""且说"等说书人式转场词（不符合文娱题材的现代感）",
    "转场和用户指令的意图脱节，自行决定时间或空间的跳跃方式"
  ]',
  '{}',
  '{}',
  '开章和转场必须从用户指令的意图出发，结合上章的结尾状态来决定手法。情绪高点后用情绪承接，悬念后用后果直入，需要转场时用动作驱动。禁止硬套时间标记，禁止脱离剧情的外挂转场。',
  'seed',
  1700000003
);

-- ============================================================
-- 14. 连锁震惊写法（文娱）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_chain_shock_001',
  'wenyi',
  'psychology',
  '连锁震惊写法',
  'Medium',
  '[
    {"if": "protagonist_achieves_something_that_breaks_industry_expectations","then": "write_layered_reactions_from_audience_to_peers_to_industry_leaders","because": "文娱的爽感在于被行业逐层认可，路人→同行→行业大佬的层级震惊是这个题材特有的爽感结构"},
    {"if": "protagonist_work_or_performance_exceeds_all_expectations","then": "show_each_level_being_forced_to_acknowledge_protagonist","because": "被迫承认比主动赞美更有爽感，层级越高的人被迫承认说明主角的影响力越大"}
  ]',
  '[
    {"template": "【写法】按层级从低到高依次写反应：路人/普通观众（这作品/表演怎么这么好）→同行/竞争者（他用了什么手法，我怎么没想到）→行业前辈/资本（这个人要关注/签下来）。每层反应要有具体的行为或语言。", "type": "三层递进式", "context": "主角的作品或表演超出行业预期时"},
    {"template": "【写法】竞争者/对手的反应要单独处理：先是不屑（不过如此），然后是不安（数据怎么这么高），然后是不可置信（这怎么可能），最后是沉默（无话可说）。四步走，体现被碾压的过程。", "type": "对手被碾压过程式", "context": "主角在竞争中超越对手时"},
    {"template": "【写法】行业大佬/前辈的反应要通过具体行为传达：放下手里的事、重新看一遍、主动打听——用这些行为暗示重视，比直接写他们震惊更有分量。", "type": "大佬行为暗示式", "context": "有地位的人开始关注主角时"}
  ]',
  '[
    "只写众人震惊、全行业哗然等空洞描述",
    "所有层级同时震惊，失去层次感",
    "每章都强行安排震惊反应（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '连锁震惊写法：路人→同行→行业大佬的层级震惊，每层反应具体化。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000003
);

-- ============================================================
-- 15. 信息差释放写法（文娱）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_info_gap_release_001',
  'wenyi',
  'structure',
  '信息差释放写法',
  'Medium',
  '[
    {"if": "protagonist_has_talent_or_knowledge_others_dont_know_about","then": "control_who_discovers_it_and_when","because": "文娱的才华/优势价值在于分层揭露，先让身边人半信半疑，再让行业数据说话，最后让顶层无法忽视"},
    {"if": "protagonists_true_capability_is_about_to_be_revealed","then": "write_the_process_of_industry_going_from_dismissal_to_acknowledgment","because": "从被否定到被承认的过程本身就是文娱题材最核心的爽感来源"}
  ]',
  '[
    {"template": "【写法】才华/优势的揭露要分阶段：先让身边人半信半疑（他真的有这个能力？），再让数据/结果说话（这个数字是真的？），最后让行业无法忽视（这个人是谁）。每个阶段都是独立的爽点。", "type": "三阶段揭露式", "context": "主角有隐藏才华或优势时"},
    {"template": "【写法】行业人士从否定到承认的过程要写出来：先是否定（这不可能），然后是动摇（数据不会说谎），然后是重新评估（我之前看走眼了），最后是主动靠近（这个人值得合作）。这个过程本身就是爽感。", "type": "行业认知转变式", "context": "行业人士开始重新评估主角时"},
    {"template": "【写法】旧的优势即将被完全认可时，提前埋下新的更高层次的才华或机会。让读者在享受当前爽点的同时，已经对下一个突破产生期待。", "type": "优势叠加式", "context": "一个才华即将被完全认可时"}
  ]',
  '[
    "一次性把所有才华都展示出来",
    "跳过行业人士从否定到承认的过程",
    "每章都强行安排才华揭露（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '信息差释放写法：才华分阶段揭露，写出行业从否定到承认的过程。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000003
);

-- ============================================================
-- 16. 情绪递进铺垫写法（文娱）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_emotion_escalation_001',
  'wenyi',
  'structure',
  '情绪递进铺垫写法',
  'Medium',
  '[
    {"if": "building_up_to_a_highlight_moment_or_reversal","then": "escalate_doubt_and_pressure_step_by_step","because": "文娱的爽感来自长线积累后的爆发，铺垫可以跨越很多章，但每一步都要比上一步更具体更个人化"},
    {"if": "protagonist_is_being_doubted_or_denied_by_industry","then": "make_each_denial_more_specific_and_more_public","because": "被否定越具体越公开，后续被承认的爽感越强，这是文娱题材情绪积累的核心"}
  ]',
  '[
    {"template": "【写法】铺垫要分步走，节奏可以慢但层次不能少：被无视（对方根本不把主角放在眼里）→被否定（对方主动否定主角的能力）→被当众嘲讽（在公开场合被否定）→被拿来对比（和成功者对比）→被逼放弃（被逼到必须证明自己的地步）。每一步都要有具体的行业场景。", "type": "五步递进式", "context": "高光时刻/逆转场景的铺垫阶段"},
    {"template": "【写法】行业鄙视链的压力要层层递进：从针对主角的作品，到针对主角的能力，到针对主角的背景和资源。越到后面越触碰底线，爆发才有必然性。", "type": "行业压力递进式", "context": "行业人士持续否定主角时"},
    {"template": "【写法】铺垫阶段主角的反应要克制：不是没有情绪，而是在积累。通过细节（沉默、眼神、细微的动作）传达内心的积累，不要提前爆发，让读者跟着憋屈。", "type": "主角克制积累式", "context": "主角承受行业压力的过程中"}
  ]',
  '[
    "铺垫只有一步就直接爆发",
    "每一步压力都一样，没有递进",
    "主角提前爆发，破坏铺垫节奏",
    "每章都强行安排递进铺垫（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '情绪递进铺垫写法：行业否定要分步递进，节奏可以慢但层次不能少，主角克制积累。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000003
);

-- ============================================================
-- 17. 配角反应具体化写法（文娱）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'wenyi_npc_reaction_detail_001',
  'wenyi',
  'psychology',
  '配角反应具体化写法',
  'Medium',
  '[
    {"if": "protagonist_work_or_performance_forces_others_to_acknowledge","then": "write_specific_attitude_changes_not_just_shock","because": "文娱配角的反应要体现行业专业性，不能只写震惊，要写出他们具体的态度转变"},
    {"if": "competitor_or_doubter_is_forced_to_face_protagonists_achievement","then": "show_the_process_of_going_from_dismissal_to_acknowledgment","because": "从否定到承认的过程是文娱题材最有爽感的配角反应，不能只写结果"}
  ]',
  '[
    {"template": "【写法】行业人士的态度转变要写三个层面：行为变化（他做了什么不同的事，比如重新看了一遍、主动打听）、语言变化（语气从否定到中立到肯定）、内心判断（从看不上到动摇到承认）。三个层面都写到。", "type": "三层面具体化式", "context": "主角的作品或表现超出行业预期时"},
    {"template": "【写法】竞争者/对手的不可置信要写出过程：先是否认（这数据是刷的），然后是动摇（好像不是），然后是沉默（无话可说），最后是重新打量（这个人不简单）。不能直接跳到最后。", "type": "对手不可置信过程式", "context": "对手被主角的成绩超越时"},
    {"template": "【写法】旁观者的反应要通过具体行为传达：停下来讨论、主动转发、改变之前的评价——用这些行为暗示认可，比直接写他们认可更有说服力。", "type": "旁观者行为暗示式", "context": "公开场合的高光时刻"}
  ]',
  '[
    "只写众人震惊、全行业哗然等空洞描述",
    "配角态度转变一步到位，没有过程",
    "每章都强行安排配角震惊（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '配角反应具体化写法：行为变化+语言变化+心理变化三层面，从否定到承认的过程要写出来。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000003
);
