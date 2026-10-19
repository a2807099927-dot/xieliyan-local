-- ============================================================
-- 历史爽文题材 写作技法种子数据 v1（三层分析整合版）
-- 来源：三层分析
-- 角色名已全部匿名化为 XXX/XX/ZZZ
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
  'lishishuangwen_dialogue_001',
  'lishishuangwen',
  'dialogue',
  '对话开场句',
  'High',
  '[
    {"if": "need_quick_info_exchange OR functional_question","then": "unmodified_or_simple_tag_opener","because": "加快节奏，让读者聚焦于对话内容本身"},
    {"if": "dialogue_needs_emotional_subtext OR character_state_display","then": "expression_or_action_modified_opener","because": "为对话赋予表演性，让读者在听到台词前已感知角色状态"},
    {"if": "protagonist_initiating_negotiation_or_hustle","then": "benefit_proposition_opener OR casual_conspiratorial_opener","because": "以利益或同盟感开场，降低对方防御心，符合主角市井智慧人设"},
    {"if": "protagonist_facing_social_pressure_or_challenge","then": "deflect_with_humor_or_mock_compliance","because": "用玩世不恭的态度化解压力，维持主角的心理优势"}
  ]',
  '[
    {"template": "\"我说XXX，你这事儿办得也太不地道了吧？\"", "type": "质问式", "context": "对熟人的直接质问，带口语化亲近感"},
    {"template": "\"这位XXX，跟你商量个事如何？保证对你没坏处。\"", "type": "利益诱导式", "context": "拉拢中立方或陌生人"},
    {"template": "\"嘿，XXX，我倒是有个想法，不知道你有没有兴趣听听？\"", "type": "试探邀请式", "context": "提出合作或计划"},
    {"template": "\"XXX，你过来，我有个主意，保证让那帮XXX吃不了兜着走。\"", "type": "密谋式", "context": "拉拢盟友共同对付敌人"},
    {"template": "\"敢问这位XXX，这XXX是怎么个说法？别跟我来虚的。\"", "type": "直接追问式", "context": "要求对方给出明确答案"},
    {"template": "\"行了行了，XXX，别整那些没用的，咱们明人不说暗话。\"", "type": "打断套话式", "context": "跳过客套直入正题"},
    {"template": "\"哦？XXX，这话听起来倒是有趣，不知可否详细说说？\"", "type": "装作好奇式", "context": "以兴趣为掩护套取信息"},
    {"template": "\"我说兄弟，你这样可不行啊，听我一句劝\"", "type": "过来人劝说式", "context": "以前辈姿态开场"},
    {"template": "\"XXX，别急，先听我说完，这事没那么简单。\"", "type": "拦截打断式", "context": "阻止对方冲动行事"},
    {"template": "\"那什么，XXX，我能问个问题吗？就一个。\"", "type": "装无害式", "context": "以无害姿态开场，实则套话"}
  ]',
  '[
    "\"启禀大人，草民有一事不明，恳请大人解惑。\"（过于卑微顺从，不符合主角性格）",
    "\"在下斗胆，想与阁下探讨一下关于XXX的深层哲理。\"（过于文绉绉和学术化，不符合爽文快节奏）",
    "\"您好，冒昧打扰，不知是否有时间\"（现代礼貌腔，穿越主角不会这样说）"
  ]',
  '{
    "undercurrent": ["冷笑","哼了一声","眼中闪过一丝","眉头一皱","脸色一变","不屑"],
    "open_conflict": ["你这小子","你敢","你这是何意","好大的胆子","怒道","冷冷道","你这无耻登徒子"],
    "explosion": ["大叫一声","怒火滔天","我杀了你","一拳砸在","重责一百大板","拔腿就跑","哇的一声大哭"]
  }',
  '{
    "typical": [
      "\"好说，好说。\"XX轻咳两声，笑道：\"这位兄台叫住在下，不知有何指教？\"",
      "\"你这小子，看什么看？\"绝色公子尚未开腔，倒是他旁边那位青衣小厮忍不住了。",
      "\"兄台可有功名在身？\"XX摇头道：\"不曾考取功名。\"",
      "\"哇，快看，快看，是金陵第一才子XXX候公子哎\"",
      "\"小兄弟，想笑就笑吧，别把自己憋的难受。\""
    ],
    "boundary": [
      "一个苍老的黑影，缓缓走到XX身前，声音嘶哑着道：\"你回来了。\"（将环境和人物状态作为对话引入的一部分）",
      "\"黄兄，与这厮站在一起，恁地辱没了你的身份，咱们离他远点\"（群体背景对话，塑造主角被孤立处境）",
      "\"哪里来的乡巴佬\"（无主语的背景音式对话，营造群体恶意氛围）"
    ],
    "counter": [
      "\"什么？\"XX大吃一惊，这ZZZ是他在这世界上认识的第一个人（对话后没有立即接内心吐槽，而是转为严肃情节信息补充）",
      "\"你回来了。\"（极简无修饰，营造平静但略带神秘的氛围，与大多数充满情绪的对话引入不同）"
    ]
  }',
  '对话以神态修饰引入为主（45%），并常以主角内心吐槽或心理活动收尾（50%）来强化角色性格。穿越者视角的现代口语化是核心特征。',
  'seed',
  1700000004
);

-- ============================================================
-- 2. 对话技法  冲突降温句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_dialogue_002',
  'lishishuangwen',
  'dialogue',
  '冲突降温句',
  'High',
  '[
    {"if": "conflict_inconvenient_to_escalate AND protagonist_needs_exit","then": "mock_compliance_or_fake_surrender","because": "用夸张认怂快速脱离接触，保留主角的心理优势和喜剧感"},
    {"if": "protagonist_holds_advantage AND wants_to_end_dispute","then": "contemptuous_dismissal_with_self_elevation","because": "将对方拉低到不值得争论的层次，自我拔高以结束冲突"},
    {"if": "conflict_needs_redirect_to_practical_interest","then": "interest_based_redirect","because": "用利益衡量标准消解情绪冲突，体现主角的商人/实用主义本色"},
    {"if": "protagonist_genuinely_outmatched_and_needs_to_survive","then": "strategic_retreat_with_internal_vow","because": "好汉不吃眼前亏，表面退让内心记仇，为后续翻盘埋伏笔"}
  ]',
  '[
    {"template": "\"好了好了，这事就到此为止吧，我还有正事要办。\"", "type": "议程转移式", "context": "以更重要之事为由显示对方纠缠无意义"},
    {"template": "\"也罢，就当是我错了，行了吧？懒得跟你计较。\"", "type": "虚假让步式", "context": "用轻蔑的让步剥夺对方继续争论的理由"},
    {"template": "\"嘿嘿，跟你们这些XXX计较，倒显得我没意思了。\"", "type": "降维鄙视式", "context": "将对方拉低到不值得争论的层次"},
    {"template": "\"行了，你说的都对，我服了，这总行了吧？\"", "type": "夸张认怂式", "context": "全盘承认对方观点使其失去攻击目标，带强烈反讽"},
    {"template": "\"我今天心情好，不跟你一般见识，下次可就没这么好运了。\"", "type": "恩赐式警告", "context": "将不追究归因于我的恩赐，建立心理优势并带警告"},
    {"template": "\"（长叹一口气）罢了，就当我什么都没说过，你们继续。\"", "type": "戏剧化退出式", "context": "用疲惫感表现对牛弹琴的无奈，主动退出争论"},
    {"template": "\"这事儿，咱们换个时间再聊，如何？我可没功夫在这耗着。\"", "type": "时间成本式", "context": "以时间成本为由要求暂停，暗示对方纠缠是浪费时间"},
    {"template": "\"得得得，你厉害，你牛，我怕了你了，我走还不行吗？\"", "type": "江湖认怂式", "context": "用一套口头认怂快速脱离接触"},
    {"template": "\"我这个人，不喜欢跟XXX动手，咱们还是谈谈能解决问题的事吧。\"", "type": "理性一方式", "context": "将自己塑造成理性一方，暗示对方无理取闹"},
    {"template": "\"不就这么点事儿嘛，值得吗？有这功夫，咱们都能赚XXX两银子了。\"", "type": "利益换算式", "context": "用利益衡量标准消解情绪冲突"}
  ]',
  '[
    "\"对不起，我真的不是故意的，请您原谅我吧。\"（过于真诚示弱，不符合主角爽文人设）",
    "\"此事确有误会，待我细细向你分说这其中的原委\"（长篇大论讲道理，不符合快节奏风格）",
    "\"我愿意承担一切责任，请您息怒。\"（无条件认错，破坏主角形象）"
  ]',
  '{}',
  '{
    "typical": [
      "\"也罢，就当是我错了，行了吧？懒得跟你计较。\"",
      "\"嘿嘿，跟你们这些XXX计较，倒显得我没意思了。\"",
      "\"得得得，你厉害，你牛，我怕了你了，我走还不行吗？\"",
      "\"我今天心情好，不跟你一般见识，下次可就没这么好运了。\"",
      "\"不就这么点事儿嘛，值得吗？有这功夫，咱们都能赚XXX两银子了。\""
    ],
    "boundary": [
      "\"罢了，就当我什么都没说过，你们继续。\"（戏剧化退出，带自嘲感）",
      "\"好汉不吃眼前亏，这次先忍了，以后有你好瞧的。\"（内心独白式降温，表面退让内心记仇）"
    ],
    "counter": [
      "\"对不起，我真的不是故意的\"（真诚道歉）",
      "\"此事确有误会，待我细细分说\"（长篇解释）"
    ]
  }',
  '历史爽文冲突降温以喜剧性认怂和利益转移为核心手法。主角绝不真诚道歉，用夸张退让、鄙视降维或利益换算快速脱离无意义冲突。',
  'seed',
  1700000004
);

-- ============================================================
-- 3. 场景转场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_structure_001',
  'lishishuangwen',
  'structure',
  '场景转场句',
  'High',
  '[
    {"if": "scene_needs_time_jump","then": "time_marker_hard_cut","because": "追求叙事效率，省略中间过程，直接标注时间锚点，避免拖慢节奏"},
    {"if": "scene_needs_space_switch","then": "character_exit_or_action_driven_switch","because": "人物离场或目标性动作是最自然的切镜信号，无需解释"},
    {"if": "emotion_needs_reset OR tension_needs_release","then": "external_event_interrupt OR sleep_wake_transition","because": "外部事件或生理状态转换强行中断前一情绪流，为新情节清空情绪底色"},
    {"if": "need_show_parallel_development","then": "meanwhile_at_location_switch","because": "展示对手或盟友的动态，制造信息差和悬念"}
  ]',
  '[
    {"template": "翌日清晨，XXX刚推开房门，便看到……", "type": "时间+地点切换", "context": "跨天转场，直接入新场景"},
    {"template": "回到XXX后，XXX发现气氛有些不对劲。", "type": "地点标记+新悬念", "context": "返回熟悉场景，引入新冲突"},
    {"template": "等XXX离开后，他才从袖中取出那封信。", "type": "人物离场切镜", "context": "展示隐藏行动，制造信息差"},
    {"template": "用过午膳，XXX借口XXX，一个人来到了……", "type": "行动目的驱动", "context": "以目的为驱动，自然切换"},
    {"template": "正在这时，门外忽然传来一阵急促的脚步声。", "type": "外部事件强切", "context": "强行改变当前场景走向"},
    {"template": "接下来几日，XXX一直忙着XXX的事。", "type": "时间模糊跳跃", "context": "快速跳过琐碎时段，保持节奏"},
    {"template": "与此同时，在XXX府中……", "type": "平行叙事切换", "context": "展示对手或盟友动态"},
    {"template": "他想了想，决定先去XXX一趟。", "type": "内心决策驱动", "context": "主角主动切换，逻辑清晰"},
    {"template": "不多时，XXX便到了……", "type": "时间压缩切入", "context": "快速推进，省略等待过程"},
    {"template": "话分两头，且说那XXX这边……", "type": "说书式平行切换", "context": "带有古典小说韵味的视角切换"}
  ]',
  '[
    "他走在路上，看着天边的云彩，思绪万千，不知不觉就到了XXX。（抒情慢转场，节奏断裂）",
    "光阴似箭，日月如梭，转眼间又过去了一个月。（老旧套话，不符合题材调性）",
    "让我们把镜头切换到另一边……（打破第四面墙，破坏沉浸感）",
    "此时此刻，历史的车轮正在缓缓转动……（上帝视角宏大叙事，不符合主角中心视角）"
  ]',
  '{
    "time_signals": ["翌日","接下来几日","过了两天","不多时","回到XXX后","次日一早"],
    "space_signals": ["等XXX离开后","门外忽然传来","话分两头","与此同时"],
    "emotion_reset_signals": ["睡眠/清醒状态转换","外部事件打断","物件遗留（如书信、令牌）"]
  }',
  '{
    "typical": [
      "翌日清晨，XXX刚推开房门，便看到……",
      "不多时，XXX便到了……",
      "回到XXX后，XXX忍不住在心里吐槽了几句……",
      "等XXX离开后，他才从袖中取出那封信。",
      "接下来几日，XXX一直忙着XXX的事。"
    ],
    "boundary": [
      "话分两头，且说那XXX这边……（说书式切换，偶尔使用增加古典韵味）",
      "正在这时，门外忽然传来一阵急促的脚步声。（外部事件强行打断当前场景）"
    ],
    "counter": [
      "光阴似箭，日月如梭……（老旧套话）",
      "他走在路上思绪万千……（抒情慢转场）",
      "此时此刻，历史的车轮正在缓缓转动……（上帝视角宏大叙事）"
    ]
  }',
  '转场必须带信息量。每个转场句同时完成切换场景+引入新悬念两个任务，绝不允许纯过渡性文字。偶尔可用说书式切换增加古典韵味。',
  'seed',
  1700000004
);

-- ============================================================
-- 4. 章节收尾钩子句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_structure_002',
  'lishishuangwen',
  'structure',
  '章节收尾钩子句',
  'High',
  '[
    {"if": "chapter_ending AND new_action_incoming","then": "action_hook","because": "即将开启新对话或新事件，维持追读惯性"},
    {"if": "chapter_ending AND partial_secret_revealed","then": "info_gap_hook","because": "制造信息缺口，读者带着疑问进入下一章"},
    {"if": "chapter_ending AND hidden_crisis_brewing","then": "unease_hook","because": "暗示隐藏危机，情绪上的不安驱动追读"},
    {"if": "chapter_ending AND protagonist_makes_decision","then": "decision_mystery_hook","because": "主角行动成谜，读者好奇心驱动翻页"}
  ]',
  '[
    {"template": "XXX嘿嘿一笑，心里已经有了主意。", "type": "决策悬念钩子", "context": "主角计划成谜，制造期待"},
    {"template": "正在这时，门外传来一声通报：\"XXX大人到！\"", "type": "意外登场钩子", "context": "打破现有格局，新变量引入"},
    {"template": "那信封上，赫然盖着XXX的印章。", "type": "线索揭露钩子", "context": "秘密被揭一角，制造紧张"},
    {"template": "看着XXX的背影，他总觉得哪里有些不对劲。", "type": "不安钩子", "context": "暗示隐藏危机或秘密"},
    {"template": "XXX冷冷地看着他，问道：\"你到底是什么人？\"", "type": "尖锐质问钩子", "context": "以问题结尾，身份危机感"},
    {"template": "没想到，XXX居然会在这里出现。", "type": "意外重逢钩子", "context": "打破现有格局，旧人新局"},
    {"template": "他二话不说，转身便朝XXX方向走去。", "type": "果断行动钩子", "context": "以极简动作结尾，预示高潮"},
    {"template": "这一刻，他忽然想到了一个绝妙的主意。", "type": "灵感钩子", "context": "现代知识即将派上用场"},
    {"template": "\"来人，把这个XXX给我拿下！\"", "type": "危机爆发钩子", "context": "主角陷入危机，悬念拉满"},
    {"template": "嘿嘿，这帮古人哪里见过这种操作？", "type": "内心吐槽反差钩子", "context": "穿越者优势即将展现，喜剧感+期待感"}
  ]',
  '[
    "忙碌的一天终于结束了，他安心地睡了过去。（完全闭合，零追读动力）",
    "夕阳西下，断肠人在天涯。（纯抒情，信息量为零）",
    "经过这件事，他明白了一个深刻的道理：XXX。（总结陈词，失去悬念）",
    "就这样，平静的日子又过了几天。（无事件性，节奏停滞）"
  ]',
  '{}',
  '{
    "typical": [
      "XXX嘿嘿一笑，心里已经有了主意。",
      "正在这时，门外传来一声通报：\"XXX大人到！\"",
      "他二话不说，转身便朝XXX方向走去。",
      "嘿嘿，这帮古人哪里见过这种操作？",
      "那信封上，赫然盖着XXX的印章。"
    ],
    "boundary": [
      "\"来人，把这个XXX给我拿下！\"（危机爆发式结尾，使用频率较低）",
      "看着XXX的背影，他总觉得哪里有些不对劲。（情绪收尾，带悬念）"
    ],
    "counter": [
      "忙碌的一天终于结束了，他安心地睡了过去。（完全闭合）",
      "经过这件事，他明白了一个深刻的道理。（总结陈词）"
    ]
  }',
  '章节结尾必须留钩子。悬念收占60%，情绪收20%，动作收20%。禁止情感总结收尾和完全闭合收尾。每章结尾指向下一个事件、悬念或决策。',
  'seed',
  1700000004
);

-- ============================================================
-- 5. 心理独白句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_psychology_001',
  'lishishuangwen',
  'psychology',
  '心理独白句',
  'High',
  '[{"if":"protagonist_encounters_ancient_phenomenon_contradicting_modern_values","then":"modern_perspective_tucao_monologue","because":"穿越者身份的核心表达机制，以现代常识吐槽古代现象制造喜剧效果和优越感"},{"if":"protagonist_faces_physical_or_social_threat","then":"short_direct_inner_reaction","because":"直白传达紧张感和即时应激反应，增强代入感"},{"if":"protagonist_observes_environment_or_character","then":"subjective_filter_observation_monologue","because":"所有外部描写通过主角主观滤镜进行，使描写本身也成为角色塑造的一部分"},{"if":"protagonist_needs_to_rationalize_shameless_behavior","then":"self_justification_with_humor","because":"为不道德行为找宏大理由，降低道德负担同时制造读者会心一笑"}]',
  '[{"template":"日，这XXX还真是个奇葩，这种事都想得出来。","type":"吐槽评价式","context":"对古代现象的现代视角吐槽"},{"template":"看来这XXX也不是什么省油的灯，我得小心提防着点。","type":"警惕评估式","context":"对新角色的快速判断"},{"template":"这事儿有点意思，我倒要看看他们葫芦里卖的什么药。","type":"好奇观察式","context":"面对未知局势的主动探究"},{"template":"妈的，老子要不是看在XXX的面子上，早就一巴掌过去了。","type":"愤怒压制式","context":"被激怒但选择忍耐"},{"template":"嘿嘿，这可是个好机会，正好可以利用一下，让他们XXX。","type":"机会主义式","context":"发现可利用的局势"},{"template":"这他娘是什么规矩/道理，简直是扯淡，完全不把人当人看。","type":"现代价值观冲突式","context":"对古代不合理制度的愤怒"},{"template":"罢了，罢了，好汉不吃眼前亏，这次就先忍了，以后有你好瞧的。","type":"战略退让式","context":"暂时退让但内心记仇"},{"template":"乖乖不得了，这小妞/小子，还真有两把刷子，不过跟我比还嫩了点。","type":"俯视评价式","context":"对他人能力的认可但仍保持优越感"},{"template":"我靠，这也能行？看来这个世界的XXX，还真是刷新我的三观。","type":"三观刷新式","context":"遭遇超出现代认知的事物"},{"template":"这笔买卖稳赚不赔，老子发财了！","type":"利益计算式","context":"发现商机时的兴奋"}]',
  '["我究竟是谁？我从哪里来？又要到哪里去？这穿越的意义何在？（过于哲学深刻的自我拷问）","他的眼神如同一潭深不见底的湖水，我从中看到了悲伤、决绝……（过于细腻文艺的他人心理分析）","我这样做是不是有点不道德？内心真过意不去。（道德自省，主角不做此类反思）"]',
  '{"undercurrent":["冷笑","哼了一声","眼中闪过一丝","眉头一皱","不屑"],"open_conflict":["你这小子","你敢","好大的胆子","怒道","冷冷道"],"explosion":["大叫一声","怒火滔天","我杀了你","拔腿就跑","猛地站起"]}',
  '{"stats":{"surface_level_thought_ratio":"15%（动作反应）","direct_inner_monologue_ratio":"85%（直接想法/吐槽/判断）","deep_subconscious_ratio":"0%"},"trigger_scenes":{"most_dense":"观察新事物、遭遇冲突、进行内心吐槽时，几乎贯穿全文","secondary":"面对美女或利益诱惑时"},"protagonist_self_assessment":["日，这XXX还真是个奇葩。","看来这XXX也不是什么省油的灯。","妈的，老子要不是看在XXX的面子上……","嘿嘿，这可是个好机会。","罢了，好汉不吃眼前亏。","我靠，这也能行？","这笔买卖稳赚不赔！","无耻者，无敌！","这杀千刀的世道不骗老实人骗谁？","小子，得意什么，论起XXX，你爷爷我的手段比你高了千倍万倍。"],"others_assessment_of_protagonist":["看他那副XXX的德行，心里准是在想XXX吧。","不用说，这帮XXX肯定以为老子是个好欺负的软柿子了。","瞧她那眼神，分明是在对我放电，这小妞，莫不是看上我了？","这帮家伙，心里一定在骂我XXX，还装出一副道貌岸然的样子。","她这么做，无非是想XXX罢了，这点小心思，在我面前根本不够看。"]}',
  '采用高度稳定的主角限定视角，心理描写以大量直白、口语化的内心独白和吐槽为主（85%中层），深度较浅但频率极高。穿越者现代视角吐槽是核心喜剧机制。',
  'seed',
  1700000004
);

-- ============================================================
-- 6. 节奏控制规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_rhythm_001',
  'lishishuangwen',
  'rhythm',
  '节奏控制规则',
  'High',
  '[{"if":"protagonist_inner_tucao_peaks OR key_emotion_moment","then":"single_line_paragraph","because":"在视觉上形成停顿，强化该句的冲击力和喜剧效果"},{"if":"scene_type == physical_conflict OR chase","then":"short_sentences_reduce_modifiers","because":"模仿急促呼吸和心跳，加快阅读速度，营造紧张感"},{"if":"scene_type == background_or_environment_or_memory","then":"long_compound_sentences","because":"能容纳更多信息，放缓节奏，营造沉浸感和稳定感"},{"if":"rapid_plot_advance OR quick_character_interaction","then":"short_paragraphs_frequent_line_breaks","because":"加快阅读速度，制造紧张急促的电影剪辑感"}]',
  '[{"template":"日，死人妖！","type":"单行段-内心吐槽","context":"对古代现象的现代视角爆发"},{"template":"无耻者，无敌！","type":"单行段-座右铭","context":"主角行事准则的强调"},{"template":"家——丁——？","type":"单行段-震惊拆字","context":"接收到震惊信息时的拆字强调"},{"template":"春风和蔼，杨柳依依，宽广的玄武湖有如一面硕大而光滑的镜子……","type":"舒缓长句-环境开场","context":"新场景开篇的氛围营造"},{"template":"她将手里的小扇抛开，纤细的手掌淡蓝荧光闪动，带着一股强劲的掌风……","type":"紧张短句-动作描写","context":"物理冲突时的快速动作呈现"},{"template":"XX心里大吃了一惊，这乱七八糟的玩意儿是什么？武功？魔法？","type":"短句群-震惊反应","context":"遭遇超出认知事物时的连续质问"},{"template":"主仆二人望着XX一齐微笑。","type":"极简定格句","context":"场景定格制造悬念"},{"template":"他紧张了！他结巴了！","type":"短句-状态强调","context":"紧张场景的快速状态呈现"}]',
  '["在紧张冲突场景中使用超过30字的长句（破坏紧张感）","通篇超过150字的连续心理分析段落（节奏断裂）","意识流或蒙太奇手法（所有场景切换清晰直白）"]',
  '{}',
  '{"stats":{"tense_scene_avg_sentence_length":"12字","relaxed_scene_avg_sentence_length":"25字","dialogue_paragraph_avg_lines":1.5,"narration_paragraph_avg_lines":3,"description_paragraph_avg_lines":4,"single_line_paragraph_triggers":"主角内心吐槽、强调情绪、制造笑点"},"contrast":{"physical_conflict":"连续短促叙述句描绘动作迅捷（表现动作的快）","social_conflict":"连串短对话段落层层施压（表现言语攻击的多和密集）"}}',
  '通过在紧张场景使用短句、舒缓场景使用长句来控制节奏，并频繁使用单行段落强化主角的内心吐槽和喜剧效果。',
  'seed',
  1700000004
);

-- ============================================================
-- 7. 描写技法规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_description_001',
  'lishishuangwen',
  'description',
  '描写技法规则',
  'High',
  '[{"if":"key_character_first_appearance_with_future_plot_importance","then":"detailed_distinctive_appearance_description","because":"需要给读者留下深刻第一印象，并服务于后续情节如性别误认"},{"if":"new_chapter_or_major_scene_start","then":"brief_visual_auditory_environment_description","because":"为接下来的情节提供舞台背景，建立场景基调"},{"if":"characters_in_emotional_opposition_or_protagonist_inner_turmoil","then":"brief_atmosphere_keywords","because":"快速直接地外化人物内心状态，增强戏剧冲突感"},{"if":"need_show_character_social_status_or_personality","then":"clothing_accessories_behavior_implication","because":"比直接定义更具说服力，让读者自行判断"}]',
  '[{"template":"细柳眉，丹凤眼，唇如绛点，眸如晨星，手拿一把白色小扇……","type":"古典精致式外貌","context":"重要角色登场，制造性别误导或惊艳感"},{"template":"XX打量着清澈水面中自己的倒影，剑眉星目，鼻如悬胆，笑容可亲……","type":"镜像自观式","context":"主角外貌通过自我观察呈现"},{"template":"春风和蔼，杨柳依依，宽广的玄武湖有如一面硕大而光滑的镜子……","type":"视觉意象环境开场","context":"新场景开篇奠定基调"},{"template":"她脸色通红的望着XX，眼里喷出一股股的怒火……","type":"情绪外化氛围","context":"冲突场景的即时情绪呈现"},{"template":"只可惜一身青布长衫，脚上一双漏了顶的破布鞋……","type":"服装反衬式","context":"通过服装描写反衬主角落魄处境"},{"template":"那小厮盯着XX的短发，像是想笑，却又不敢笑的样子，小脸憋的通红。","type":"他人反应衬托式","context":"通过他人反应突出主角的格格不入"},{"template":"中间一艘船上，一个年轻公子哥站立船头，面如冠玉，抚扇轻立，面带微笑……","type":"远景登场式","context":"重要配角的远景式首次亮相"},{"template":"他的瞳孔中空空如也，像是被人生生挖去了般，露出两个空空的肉洞……","type":"恐怖细节式","context":"反派或异常角色的恐怖特征描写"}]',
  '["她长得很美，像仙女一样。（空洞形容词，无具体信息）","天空很蓝，白云很白。（纯景物无叙事功能）","超过100字的连续外貌描写段落（首次出场控制在60字以内）"]',
  '{}',
  '{"stats":{"sensory_channels":{"visual":"85%","auditory":"15%","tactile":"0%","olfactory":"0%"},"first_appearance_avg_chars":"约60字","description_order":"细节→整体感受","direct_vs_pov_ratio":"5%直接描写 vs 95%主角视角","direct_label_vs_behavioral_hint":"40%直接定义 vs 60%行为暗示","environment_avg_chars":"约150字","environment_timing":"章节或大场景开头"},"atmosphere_keywords_top10":["怒火","冷笑","嘿嘿一笑","脸色通红","心里一惊","大吃一惊","剧痛","无奈","得意","不屑"],"contrast_cases":{"character_A":"古典精致词汇（绛点/晨星）强调俊俏，目的是性别误导制造戏剧性","character_B":"生活化直白词汇（弯弯的眉毛/红润的小嘴）强调美丽，目的是建立亲切邻家形象","reason":"根据角色在情节中的功能选择不同的描写风格"}}',
  '描写技法高度功能化，环境描写用于开场奠基调，人物描写聚焦主角视角的关键特征，氛围紧随主角情绪而动。描写风格直接预设角色的功能定位。',
  'seed',
  1700000004
);

-- ============================================================
-- 8. 叙事结构规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_structure_003',
  'lishishuangwen',
  'structure',
  '叙事结构规则',
  'High',
  '[{"if":"chapter_ending","then":"throw_unresolved_problem_or_shocking_discovery","because":"典型连载小说章末钩子技法，最大化读者追更欲望"},{"if":"new_location_or_storyline_starts","then":"environment_description_or_introductory_dialogue_opening","because":"为读者提供必要背景信息，平稳引入新情节"},{"if":"protagonist_completes_small_goal_or_resolves_small_conflict","then":"immediately_introduce_next_bigger_trouble","because":"保持叙事连续性和紧张感，避免情节松弛"},{"if":"protagonist_about_to_perform_highlight_moment","then":"setup_doubt_or_setback_first","because":"欲扬先抑，通过拉低心理预期使后续高光反差更强烈"}]',
  '[{"template":"正文第一章开头，用大段环境描写做钩子。","type":"环境开篇","context":"故事总开篇，建立世界观"},{"template":"\"原来你是个小妞啊。\"XX脱口而出道。","type":"身份揭露悬念收尾","context":"关键信息揭露作为章节结尾"},{"template":"那恶狗如同一滩稀泥般，软软的掉落在了墙角下。","type":"动作收尾","context":"以动作结果结束章节"},{"template":"魏大叔突然又道：\"晚荣，我前几天对你提过的事情，你考虑的怎么样了？\"","type":"新情节线索引入","context":"通过配角对话引入新事件弧"},{"template":"林三？家丁选拔大赛？XX差点晕倒。","type":"主角震惊反应钩子","context":"以主角的震惊反应作为结尾钩子"}]',
  '["高潮置于章节前1/3（前移导致后段拖沓）","完全闭合式结尾（无悬念信息的平静收场）","非线性叙事结构（故事线保持单向线性）","超过4章的纯日常无冲突段落"]',
  '{"undercurrent":["冷笑","哼了一声","眼中闪过一丝","眉头一皱","不屑"],"open_conflict":["你这小子","你敢","好大的胆子","怒道","冷冷道","你这无耻登徒子"],"explosion":["大叫一声","怒火滔天","我杀了你","一拳砸在","重责一百大板","拔腿就跑"]}',
  '{"stats":{"chapter_opening_types":{"action":"40%","dialogue":"30%","environment":"20%","suspense":"10%"},"chapter_ending_types":{"suspense_hook":"60%","emotional_resonance":"20%","action_cliffhanger":"20%"},"climax_position":"末尾（高潮与结尾悬念重合）","event_cycle_chapters":"3-4章完成一个事件闭环","foreshadowing_recovery_span":"1-2章内回收","emotional_peak_frequency":"平均每5章一次大波峰","peak_buildup_method":"通过连续对话冲突和情节升级逐步积累矛盾直至爆发"},"core_structure_loop":"被轻视/质疑（低谷）→ 内心吐槽蓄力 → 用现代知识或市井智慧反击（爽点）→ 新悬念/新麻烦（循环触发）","transition_techniques":{"scene_change":"明确地点转换词或另起一段直接描述新场景","time_jump":"直接说明（第二天一大早/过了良久）","emotion_switch":"主角内心独白硬切换"}}',
  '采用典型网络小说序列化结构，通过章节末尾悬念钩子驱动阅读，3-4章内完成小型事件弧。欲扬先抑是情绪曲线核心模式，高潮置于章节末尾。',
  'seed',
  1700000004
);

-- ============================================================
-- 9. 信息密度规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_info_density_001',
  'lishishuangwen',
  'info_density',
  '信息密度规则',
  'High',
  '[{"if":"need_introduce_local_common_knowledge_protagonist_doesnt_know","then":"deliver_through_bystander_gossip_or_sidekick_dialogue","because":"避免主角全知全能，使信息传递显得真实自然，同时增加场景生动性"},{"if":"need_setup_next_event_arc_foreshadowing","then":"key_character_request_or_secret_reveal","because":"将信息直接转化为主角即将面临的任务或挑战，驱动情节发展"},{"if":"protagonist_needs_broader_worldview_or_past_context","then":"arrange_reading_or_inner_summary","because":"相对集中的信息投放方式，适合在情节暂缓时补充设定"},{"if":"chapter_needs_suspense_ending","then":"introduce_new_problem_as_final_info_point","because":"将新信息作为未解决问题抛给读者，直接转化为驱动下一章阅读的动力"}]',
  '[{"template":"到这里都一个月了，霉运就一直没有离开过他……","type":"内心总结式信息","context":"通过主角内心回顾交代时间和处境"},{"template":"\"哇，快看，快看，是金陵第一才子XXX候公子哎——\"","type":"路人八卦式信息","context":"通过旁人对话引入重要角色信息"},{"template":"XX来到这个世界已经一个月了，早已经知道现在所处的这个时代叫做华朝……","type":"主角认知总结式","context":"集中交代世界观基础设定"},{"template":"前几天ZZZ曾经给XX提过这件事情，大意是让XX去冒充某位大户人家的公子……","type":"配角任务式伏笔","context":"通过配角提出任务引入新情节线"},{"template":"\"对了，有一件事情我差点忘记。晚荣，明天就是萧家的家丁选拔大赛了……\"","type":"配角提醒式信息","context":"以配角提醒引入下一事件弧"},{"template":"这个叫XXX的小妞，方才焦急间耳孔通红，XX才注意到她耳朵上竟有两个细细的耳孔……","type":"微小细节揭示式","context":"通过微小生理细节揭示关键信息（如性别）"}]',
  '["大段说明文式旁白（超过150字的连续设定解释）","与主线无关的闲笔信息（所有信息都为当前或下一章节情节服务）","长线复杂伏笔超过3章不回收（本题材伏笔回收极快1-2章）"]',
  '{}',
  '{"stats":{"avg_new_info_points_per_chapter":4,"delivery_method":"均匀分布，通过对话和主角内心思考自然引出","foreshadowing_to_payoff_span":"1-2章","info_position":"均匀分布，与情节转折结合"},"info_delivery_methods":{"bystander_gossip":"路人八卦对话（引入重要角色/事件信息）","sidekick_dialogue":"配角直接告知（引入任务/挑战）","protagonist_inner_summary":"主角内心总结（交代世界观/时间线）","micro_detail":"微小细节观察（揭示隐藏信息如性别）"},"contrast_cases":{"case_A":"通过粉丝之口强调XXX的才女美女标签和总督千金家世（信息点：个人能力+身份地位）","case_B":"通过大叔之口强调萧大小姐的待嫁状态和庞大家产（信息点：婚姻价值+利益冲突）","reason":"根据角色在情节中的功能选择不同的信息侧重点"}}',
  '信息投放节奏平稳，每章通过对话和心理活动引入4个新知识点或情节线索，并设置快节奏回收的短线伏笔（1-2章）以推进剧情。路人八卦和配角提醒是两大核心信息载体。',
  'seed',
  1700000004
);

-- ============================================================
-- 10. 他人对主角的评价（历史爽文补全）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_psychology_002',
  'lishishuangwen',
  'psychology',
  '心理独白句（他人对主角评价）',
  'Medium',
  '[
    {"if": "ancient_person_observing_protagonist_modern_behavior","then": "confused_or_amused_evaluation","because": "古人对穿越者现代行为的困惑和好奇，是历史爽文喜剧效果的重要来源"},
    {"if": "antagonist_underestimating_protagonist_initially","then": "dismissive_evaluation_setting_up_face_slap","because": "反派的初始轻视是打脸爽点的必要铺垫，轻视越深，打脸越爽"},
    {"if": "bystander_witnessing_protagonist_modern_knowledge_application","then": "shock_or_collective_reevaluation","because": "旁观者的震惊是主角用现代知识碾压古人的爽感放大器"},
    {"if": "ally_or_mentor_sensing_protagonist_unusual_potential","then": "quiet_recognition_with_expectation","because": "伯乐式的静默认可为主角提供情感支撑，也暗示后续的重要合作"}
  ]',
  '[
    {"template": "XXX看着XX那副德行，心里暗暗摇头：这小子，怕是个傻的。", "type": "初始轻视式", "context": "反派或路人对主角的第一印象，为打脸铺垫"},
    {"template": "XXX皱了皱眉，这人……说话怎么这么奇怪？", "type": "古人困惑式", "context": "古人对穿越者现代口语的困惑"},
    {"template": "这小子到底是真傻还是装傻？XXX一时也看不透。", "type": "疑惑评估式", "context": "对主角行为无法定性的困惑"},
    {"template": "XXX心里有些不是滋味——这个外来的小子，凭什么？", "type": "竞争者嫉妒式", "context": "同级竞争者的嫉妒，侧面抬高主角"},
    {"template": "XXX的眼神变了，她没想到，这个看起来傻乎乎的家伙，居然……", "type": "预期颠覆式", "context": "主角表现超出预期后的震惊"},
    {"template": "周围的人都愣住了，没有人说话，所有人都在看着XX。", "type": "集体震惊式", "context": "主角用现代知识碾压古人时的群体反应"},
    {"template": "XXX没有说话，只是静静地看着XX，眼神里有什么东西在变化。", "type": "伯乐静默认可式", "context": "有眼力者的无声认可，分量最重"},
    {"template": "这小子……有点意思。XXX心里暗暗记下了这个名字。", "type": "对手初步警觉式", "context": "对手感知到主角潜力后的第一反应"},
    {"template": "XXX心想，这世界上怎么会有如此厚脸皮的人？但偏偏……还挺管用。", "type": "无奈认可式", "context": "对主角无耻但有效的手段的无奈承认"},
    {"template": "起初XXX以为他只是个混吃等死的废物，但现在看来，事情没那么简单。", "type": "认知修正式", "context": "对主角的判断从轻视转向重视"}
  ]',
  '[
    "XXX真是个天才，我从心底里佩服他。（过于直白的正面赞美，历史爽文的认可都是含蓄的）",
    "大家都觉得XX很厉害，纷纷称赞。（集体正向反应，不符合古代社会的等级逻辑）"
  ]',
  '{}',
  '{}',
  '历史爽文他人评价分三个阶段：初始轻视（铺垫打脸）→ 困惑/警觉（转折信号）→ 震惊/认可（爽点放大）。古人对穿越者现代行为的困惑是喜剧效果的重要来源，评价始终含蓄。',
  'seed',
  1700000004
);

-- ============================================================
-- 11. 对话收尾句（历史爽文）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_dialogue_close_001',
  'lishishuangwen',
  'dialogue',
  '对话收尾句',
  'High',
  '[
    {"if": "protagonist_won_exchange_with_comedy_effect","then": "end_with_internal_monologue_that_contrasts_with_surface_compliance","because": "历史爽文的收场喜剧感来自内外反差——表面认怂或顺从，内心记仇或得意，这个反差要在收场时明确展示给读者"},
    {"if": "protagonist_needs_strategic_retreat","then": "end_with_surface_compliance_plus_internal_vow_of_revenge","because": "好汉不吃眼前亏，表面退让但内心记仇，收场时要让读者看到主角的真实想法，为后续翻盘埋线"},
    {"if": "protagonist_successfully_used_modern_knowledge","then": "end_with_self_congratulatory_internal_monologue","because": "用现代知识碾压古人后，主角的内心自得是历史爽文的核心爽感来源，收场时要给读者这个满足感"},
    {"if": "dialogue_involves_negotiation_or_deal","then": "end_by_locking_in_terms_with_casual_confidence","because": "谈成了一笔买卖或协议，主角用一种漫不经心的方式确认条件，这种不在乎本身就是对对方的碾压"}
  ]',
  '[
    {"template": "【写法】主角表面上说了一句顺从或认怂的话，然后立刻切入主角的内心独白，内心想的和说的完全相反。这个反差要具体，不能是通用的"心里不服气"。", "type": "内外反差收场式", "context": "表面退让内心记仇的收场"},
    {"template": "【写法】主角说完最后一句话（通常是一句轻描淡写的总结），然后用一个漫不经心的动作（拍拍手、整整衣服、转身就走）宣告对话结束，这个动作要传达出主角的不在乎。", "type": "漫不经心离场式", "context": "主角占优势时的收场"},
    {"template": "【写法】对话结束时，主角在内心用现代视角总结这场对话（"这帮古人哪里见过这种操作"），这个总结要和本章发生的具体事件直接相关，不能是通用的感慨。", "type": "现代视角内心总结式", "context": "用现代知识碾压古人后的收场"},
    {"template": "【写法】谈判或交易收场：主角用一句话确认条件，语气要轻松随意，好像这件事对他来说不值一提，然后立刻转移到下一件事。对方的反应要体现出被主角的气场压住了。", "type": "轻松确认交易式", "context": "谈判或交易的收场"},
    {"template": "【写法】主角被迫退让时，说完表面认输的话后，用一个细节动作（眼神、嘴角、手势）暗示主角内心的不服，然后切入内心独白，让读者知道主角在记仇。", "type": "暗示记仇式", "context": "被迫退让时的收场"}
  ]',
  '[
    "主角真诚道歉或认错来结束对话（破坏爽文人设）",
    "收场时主角进行道德反思（不符合历史爽文的喜剧调性）",
    "用和本章剧情无关的感悟来收场（脱离剧情）",
    "引入本章没有出现过的新人物或新信息来打断对话（外挂元素）"
  ]',
  '{}',
  '{}',
  '历史爽文对话收尾的核心是内外反差的喜剧感：表面顺从内心记仇，表面漫不经心内心得意。收尾要从本章已有的事件里生长，用现代视角的内心独白来定性这场对话的结果。',
  'seed',
  1700000004
);

-- ============================================================
-- 12. 冲突升级句（历史爽文）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_conflict_escalation_001',
  'lishishuangwen',
  'conflict',
  '冲突升级句',
  'High',
  '[
    {"if": "user_instruction_implies_confrontation AND protagonist_is_weaker_on_surface","then": "escalate_through_comedy_of_misunderstanding_then_reversal","because": "历史爽文的冲突升级有喜剧节奏：对方以为自己赢了→主角内心吐槽→主角用现代知识或市井智慧反击，这个三步结构是核心"},
    {"if": "conflict_involves_ancient_customs_or_rules","then": "escalate_by_protagonist_finding_loophole_in_ancient_system","because": "穿越者用现代思维找到古代规则的漏洞，这是历史爽文冲突升级最有爽感的方式"},
    {"if": "conflict_is_escalating_and_protagonist_is_being_cornered","then": "use_unexpected_modern_knowledge_to_flip_the_situation","because": "被逼到墙角时，主角突然拿出一个古人完全没见过的现代知识或方法，局势立刻逆转"},
    {"if": "conflict_is_about_to_peak","then": "use_a_specific_ancient_custom_or_event_from_this_chapter","because": "历史爽文冲突爆发的触发点必须是本章已经建立的古代背景元素，不能是凭空出现的新设定"}
  ]',
  '[
    {"template": "【写法】冲突升级的喜剧三步：第一步，对方用古代规则或权威压制主角（主角表面认怂）；第二步，主角内心吐槽（让读者看到主角的真实想法）；第三步，主角找到对方没想到的反击方式（用现代知识或市井智慧）。每一步都要有具体的对话或动作。", "type": "喜剧三步升级结构", "context": "历史爽文标准冲突升级"},
    {"template": "【写法】冲突升级时，主角发现古代规则或习俗里有一个漏洞，这个漏洞要是本章已经建立的背景信息，不能是凭空出现的新设定。主角利用这个漏洞反击，对方无话可说。", "type": "规则漏洞反击式", "context": "利用古代规则漏洞的升级"},
    {"template": "【写法】被逼到墙角时，主角突然说出或做出一件古人完全没见过的事（现代知识、现代方法、现代思维），这件事要和本章的具体情境直接相关，不能是随机的现代知识展示。", "type": "现代知识逆转式", "context": "被逼到墙角时的逆转"},
    {"template": "【写法】冲突升级时，用主角的内心独白来标记每一个升级节点——不是描述冲突本身，而是主角对古人行为的现代视角吐槽，让读者跟着主角的思路感受喜剧感。", "type": "内心吐槽标记升级式", "context": "让读者感受主角的现代视角"}
  ]',
  '[
    "冲突升级靠提高音量或加感叹号（没有实质内容的情绪堆砌）",
    "引入和本章剧情无关的新矛盾来升级冲突（外挂冲突）",
    "主角在冲突升级过程中进行道德反思（不符合爽文调性）",
    "冲突爆发的触发点是本章从未出现过的新古代设定（外挂触发）"
  ]',
  '{}',
  '{}',
  '历史爽文冲突升级遵循喜剧三步结构：表面认怂→内心吐槽→现代知识反击。升级的关键是穿越者视角的喜剧感，爆发点必须来自本章已有的古代背景元素。禁止外挂新设定。',
  'seed',
  1700000004
);

-- ============================================================
-- 13. 开章与转场钩子（历史爽文）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_chapter_transition_001',
  'lishishuangwen',
  'structure',
  '开章与转场钩子',
  'High',
  '[
    {"if": "user_instruction_implies_new_chapter AND previous_chapter_ended_on_comedy_cliffhanger","then": "open_with_protagonists_immediate_reaction_in_modern_voice","because": "历史爽文的喜剧节奏要求新章节立刻承接上章的喜剧状态，主角的第一反应要用现代口语，不要用时间标记拉开距离"},
    {"if": "user_instruction_implies_scene_switch_to_new_location_in_ancient_setting","then": "use_protagonists_purposeful_action_with_internal_commentary","because": "历史爽文的转场要同时包含主角的行动和内心吐槽，行动驱动转场，吐槽维持喜剧调性"},
    {"if": "user_instruction_implies_time_skip","then": "mark_time_with_specific_change_plus_protagonists_modern_reaction","because": "历史爽文的时间跳跃要用具体的变化来标记，同时加入主角对这个变化的现代视角反应，维持喜剧感"},
    {"if": "user_instruction_implies_protagonist_has_just_achieved_something","then": "open_new_chapter_with_self_congratulatory_moment_then_new_problem","because": "历史爽文的节奏是：小胜利→自我得意→立刻出现新麻烦，新章节开头要承接这个节奏"}
  ]',
  '[
    {"template": "【写法】新章节第一句话是主角对上章事件的即时反应，用现代口语（"我靠""这也行？""老子真是天才"），然后立刻进入新场景的第一个具体细节。不要用时间标记开头。", "type": "现代口语即时反应式开章", "context": "喜剧性事件后的新章节"},
    {"template": "【写法】转场时，用主角的一个目的性动作加上内心吐槽来驱动切换——动作说明主角要去哪，吐槽维持喜剧调性。这个动作要和用户指令的意图直接对应。", "type": "动作加吐槽驱动转场", "context": "用户指令明确指向新场景"},
    {"template": "【写法】时间跳跃时，用一句话说明时间和变化，然后加一句主角对这个变化的现代视角反应（"这帮古人效率还挺高""没想到这招真管用"）。不要只说时间。", "type": "变化加现代反应时间跳跃", "context": "需要时间跳跃时"},
    {"template": "【写法】小胜利后的新章节：先用一句话让主角得意一下（内心独白），然后立刻引入新麻烦或新挑战，不要让得意持续超过两句话。", "type": "得意即转折式开章", "context": "小胜利后的新章节"}
  ]',
  '[
    "用"翌日清晨""话说"等套话直接开章，不承接上章的喜剧状态（硬切）",
    "开章用大段古代环境描写来建立氛围（破坏喜剧节奏）",
    "转场时引入本章没有出现过的新古代设定（外挂转场）",
    "时间跳跃只说时间不说变化（信息量为零的套话）",
    "转场方式和用户指令的意图脱节（自行决定跳跃方式）"
  ]',
  '{}',
  '{}',
  '历史爽文开章和转场遵循喜剧节奏：新章节用现代口语承接上章状态，转场用动作加吐槽驱动，时间跳跃用变化加现代反应标记。禁止硬套古代套话，禁止破坏喜剧调性的硬切。',
  'seed',
  1700000004
);

-- ============================================================
-- 14. 连锁震惊写法（历史爽文）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_chain_shock_001',
  'lishishuangwen',
  'psychology',
  '连锁震惊写法',
  'Medium',
  '[
    {"if": "protagonist_uses_modern_knowledge_to_achieve_something_impossible_in_ancient_context","then": "write_layered_shock_from_bystanders_to_acquaintances_to_powerful_figures","because": "历史爽文的爽感在于穿越者的现代知识碾压古人，路人→熟人→权贵的层级震惊是这个题材特有的爽感结构"},
    {"if": "protagonist_reverses_situation_using_modern_thinking","then": "show_each_level_being_forced_to_acknowledge_what_they_cannot_explain","because": "古人无法解释穿越者的操作，层级越高的人被迫承认说明影响越大"}
  ]',
  '[
    {"template": "【写法】按层级从低到高依次写反应：路人/旁观者（这小子哪来的，怎么会这个）→熟人/同阶层（他怎么变成这样了，我认识他啊）→有头有脸的人/权贵（此人不可小觑，要重新看待）。每层反应要有具体的行为或语言，带喜剧感。", "type": "三层递进式", "context": "主角用现代知识碾压古人时"},
    {"template": "【写法】对手/反派的反应要单独处理，带喜剧色彩：先是轻蔑（这傻小子），然后是困惑（他怎么知道这个），然后是不可置信（这怎么可能），最后是哑口无言（无话可说）。四步走，喜剧感和爽感并存。", "type": "对手哑口无言过程式", "context": "主角在对手面前展示现代知识时"},
    {"template": "【写法】旁观者的反应要带古代语境的喜剧感：目瞪口呆、交头接耳、指指点点——用这些具体行为传达震惊，同时保持历史爽文特有的喜剧调性。", "type": "旁观者喜剧反应式", "context": "公开场合的爽点时刻"}
  ]',
  '[
    "只写众人震惊、全场哗然等空洞描述",
    "所有层级同时震惊，失去层次感",
    "每章都强行安排震惊反应（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '连锁震惊写法：路人→熟人→权贵的层级震惊，带喜剧感，每层反应具体化。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000004
);

-- ============================================================
-- 15. 信息差释放写法（历史爽文）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_info_gap_release_001',
  'lishishuangwen',
  'structure',
  '信息差释放写法',
  'Medium',
  '[
    {"if": "protagonist_has_modern_knowledge_or_skill_as_advantage","then": "control_who_discovers_it_and_when_with_comedic_timing","because": "历史爽文的现代知识价值在于分层揭露，先让对方以为是运气或傻气，再让对方意识到是真本事，最后让对方彻底无法解释"},
    {"if": "protagonists_modern_advantage_is_about_to_be_demonstrated","then": "write_the_process_of_ancients_going_from_dismissal_to_shock","because": "古人从以为是傻子到发现是天才的认知升级过程，是历史爽文最核心的喜剧爽感来源"}
  ]',
  '[
    {"template": "【写法】现代知识的揭露要分阶段，带喜剧节奏：先让对方以为是傻气或运气（这小子在胡说什么），再让对方意识到好像有点道理（等等，他说的好像没错），最后让对方彻底无法解释（这他娘的是怎么做到的）。每个阶段都是独立的爽点。", "type": "三阶段喜剧揭露式", "context": "主角有现代知识或技能优势时"},
    {"template": "【写法】古人从以为是傻子到发现是天才的过程要写出来，带喜剧感：先是嘲笑（这傻小子），然后是疑惑（他怎么知道这个），然后是震惊（这不可能），最后是服气（老子服了）。这个过程本身就是爽感。", "type": "古人认知升级喜剧式", "context": "古人开始意识到主角的现代知识时"},
    {"template": "【写法】旧的现代知识即将被完全认可时，提前埋下新的更高层次的现代技能或知识。让读者在享受当前爽点的同时，已经对下一个碾压时刻产生期待。", "type": "知识叠加式", "context": "一个现代知识即将完全被认可时"}
  ]',
  '[
    "一次性把所有现代知识都展示出来",
    "跳过古人从嘲笑到服气的过程",
    "每章都强行安排知识揭露（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '信息差释放写法：现代知识分阶段揭露，带喜剧节奏，写出古人从嘲笑到服气的过程。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000004
);

-- ============================================================
-- 16. 情绪递进铺垫写法（历史爽文）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_emotion_escalation_001',
  'lishishuangwen',
  'structure',
  '情绪递进铺垫写法',
  'Medium',
  '[
    {"if": "building_up_to_a_comedic_reversal_or_face_slap","then": "escalate_pressure_with_comedic_rhythm","because": "历史爽文的爽感来自憋屈积累到极限然后喜剧性逆转，铺垫要有喜剧节奏，每一步主角表面认怂内心记仇"},
    {"if": "protagonist_is_being_pressured_or_humiliated_in_ancient_context","then": "make_each_step_more_specific_while_maintaining_comedic_tone","because": "压力越具体喜剧感越强，后续逆转的爽感越大"}
  ]',
  '[
    {"template": "【写法】铺垫要分步走，带喜剧节奏：被当傻子（对方根本不把主角当回事）→被占便宜（对方开始主动占主角便宜）→被当众耍弄（在众人面前被耍弄）→被拿来对比（和古代成功者对比衬托主角的落魄）→被逼认输（被逼到必须表态的地步）。每一步主角表面认怂内心记仇。", "type": "五步喜剧递进式", "context": "喜剧性逆转场景的铺垫阶段"},
    {"template": "【写法】每一步压力都要有主角的内心吐槽：表面认怂（好好好，你说得对），内心记仇（等老子发达了，有你好看的）。这种内外反差是历史爽文铺垫阶段的核心喜剧来源。", "type": "内外反差喜剧式", "context": "主角被迫退让时"},
    {"template": "【写法】铺垫阶段要保持喜剧调性：主角不是在受苦，而是在憋笑。通过主角的内心吐槽和表面顺从的反差，让读者跟着主角一起憋屈又好笑。", "type": "喜剧憋屈积累式", "context": "主角承受古代压力的过程中"}
  ]',
  '[
    "铺垫只有一步就直接逆转",
    "铺垫太沉重，失去历史爽文的喜剧调性",
    "主角提前爆发，破坏好汉不吃眼前亏的人设",
    "每章都强行安排递进铺垫（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '情绪递进铺垫写法：压力分步递进，保持喜剧调性，主角表面认怂内心记仇。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000004
);

-- ============================================================
-- 17. 配角反应具体化写法（历史爽文）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'lishishuangwen_npc_reaction_detail_001',
  'lishishuangwen',
  'psychology',
  '配角反应具体化写法',
  'Medium',
  '[
    {"if": "protagonist_uses_modern_knowledge_to_achieve_something_that_shocks_ancients","then": "write_specific_comedic_shock_reactions_from_ancient_characters","because": "历史爽文配角的反应要带古代语境的喜剧感，古人对现代行为的困惑和震惊是这个题材特有的爽感来源"},
    {"if": "antagonist_or_rival_is_forced_to_acknowledge_protagonists_superiority","then": "show_the_comedic_process_of_going_from_contempt_to_speechless","because": "对手从轻视到哑口无言的喜剧过程是历史爽文最有爽感的配角反应"}
  ]',
  '[
    {"template": "【写法】古人的反应要带困惑和喜剧感：行为变化（从随意到目瞪口呆到交头接耳）、语言变化（从嘲讽到疑惑到哑口无言）、内心判断（从这傻小子到等等不对到这他娘的是怎么回事）。三个层面都写到，带喜剧感。", "type": "三层面喜剧具体化式", "context": "主角用现代知识碾压古人时"},
    {"template": "【写法】对手哑口无言的过程要写出来，带喜剧色彩：先是嘲讽（这傻小子），然后是困惑（他怎么知道这个），然后是不可置信（这不可能），最后是哑口无言（说不出话来）。不能直接跳到最后。", "type": "对手哑口无言喜剧过程式", "context": "对手被主角的现代知识击败时"},
    {"template": "【写法】旁观者的反应要带古代语境的喜剧感：目瞪口呆、交头接耳、指指点点、啧啧称奇——用这些具体行为传达震惊，同时保持历史爽文特有的喜剧调性。", "type": "旁观者古代喜剧反应式", "context": "公开场合的爽点时刻"}
  ]',
  '[
    "只写众人震惊、全场哗然等空洞描述",
    "配角反应太严肃，失去历史爽文的喜剧调性",
    "每章都强行安排配角震惊（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '配角反应具体化写法：古人的困惑和震惊要带喜剧感，对手哑口无言的过程要写出来。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000004
);
