-- ============================================================
-- 玄幻题材 写作技法种子数据 v1（三层分析整合版）
-- 来源：三层分析，章节1-10
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
  'xuanhuan_dialogue_001',
  'xuanhuan',
  'dialogue',
  '对话开场句',
  'High',
  '[
    {
      "if": "protagonist_in_inferior_position AND facing_peer_bully",
      "then": "silence_or_minimal_response OR deflect_with_dignity",
      "because": "当前无力还击，隐忍本身即为角色城府的体现，为日后逆袭蓄力",
      "example": "XXX没有说话，只是将视线从那人身上缓缓移开。"
    },
    {
      "if": "protagonist_challenging_peer_OR_lower_after_power_up",
      "then": "identity_authority_opener OR power_comparison_opener OR humiliation_label_reversal",
      "because": "逆袭时必须主动点破实力差距，让受辱记忆与当前碾压形成鲜明对比",
      "example": ""就凭你这三段斗之力，也配在我面前放肆？""
    },
    {
      "if": "need_establish_bet_or_oath_structure",
      "then": "public_challenge_opener OR oath_invitation_opener",
      "because": "赌约和誓言是玄幻题材核心驱动结构，公开立约增加后续爽感筹码",
      "example": ""XXX，今日测验，可敢与我赌上一把？""
    },
    {
      "if": "facing_authority_or_sect_elder",
      "then": "respectful_short_response OR deflect_redirect",
      "because": "实力碾压下的谦逊是生存策略，非性格软弱，为未来借势铺垫",
      "example": ""长老所言极是，XXX谨记。""
    }
  ]',
  '[
    {"template": ""你就是那个XXX家的废物XXX？"", "type": "身份质问式", "context": "反派首次登场，以废物标签开场确立鄙视链"},
    {"template": ""一个连斗气之旋都无法凝聚的废物，也敢在我面前放肆？"", "type": "实力碾压式", "context": "实力差距对话，反派降维打击"},
    {"template": ""就凭你这三段斗之力，也想染指XXX？"", "type": "实力比较式", "context": "争夺资源或人物时的挑衅开场"},
    {"template": ""XXX，今日测验，可敢与我赌上一把？"", "type": "赌约邀请式", "context": "建立赌约结构，公开立约"},
    {"template": ""我XXX家族的事，还轮不到你一个废物来插嘴！"", "type": "宗门/家族权威式", "context": "家族内部冲突，以身份压制"},
    {"template": ""哼，我道是谁，原来是褪去了天才光环的XXX。"", "type": "讽刺坠落式", "context": "昔日地位反转，嘲讽曾经的光环"},
    {"template": ""你既然不愿让XXX颜面受损，那么便接下这约定！"", "type": "道义绑架式", "context": "以第三方情感逼迫主角接受不利条件"},
    {"template": ""怎么？昔日的天才，如今也只敢躲在女人身后了么？"", "type": "尊严挑衅式", "context": "攻击主角男性尊严，激化对抗情绪"},
    {"template": ""我XXX家的脸，都被你这废物给丢尽了！"", "type": "家族羞辱式", "context": "长辈或族人的公开斥责"},
    {"template": ""今日之辱，XXX你可记住了？"", "type": "羞辱确认式", "context": "反派主动确认羞辱已达成，激化主角誓言}"}
  ]',
  '[
    "你好，请问现在有时间吗？（礼貌寒暄，完全不符合玄幻题材对话调性）",
    "我感觉心里很难受，能和你说说话吗？（主动暴露脆弱，主角人设禁止）",
    "大家冷静一下，我们有话好好说。（温和调解，主角不扮演和事佬）",
    "今天的修炼感觉还不错呢！（无冲突的轻松寒暄，节奏断裂）"
  ]',
  '{
    "undercurrent": ["自嘲", "嘴角的苦涩", "呼吸微微急促", "紧握的手掌", "落寞的转身", "有些格格不入", "斜睨一眼", "话里有话"],
    "open_conflict": ["脸色一变", "心头猛的涌出一阵怒气", "冷笑", "眉头轻皱", "冷喝道", "废物", "你敢", "当面嘲讽", "挑衅"],
    "explosion": ["火山般的爆发", "狰狞得有些可怖", "杀意凛然", "豁然转身", "大吼一声", "你他妈", "彻底决裂", "啪的一声"]
  }',
  '{
    "typical": [
      "你就是那个XXX家的废物XXX？",
      "一个连斗气之旋都无法凝聚的废物，也敢在我面前放肆？",
      "就凭你这三段斗之力，也想染指XXX？",
      "XXX，今日测验，可敢与我赌上一把？",
      "我XXX家族的事，还轮不到你一个废物来插嘴！"
    ],
    "boundary": [
      "长老所言极是，XXX谨记。（面对权威时的极简回应）",
      "XXX没有说话，只是将视线从那人身上缓缓移开。（沉默即回应）",
      "既然如此，那便随你。（表面妥协，内心记仇）"
    ],
    "counter": [
      "你好，我们能聊聊吗？（通用寒暄，零题材辨识度）",
      "今天天气不错。（无目的闲聊，不符合题材节奏）"
    ]
  }',
  '对话即实力宣言。玄幻题材对话开场以身份/宗门/实力差距为核心，废物标签、赌约结构、羞辱挑衅是三大必须元素，绝无通用礼貌开场。',
  'seed',
  1700000001
);

-- ============================================================
-- 2. 对话技法 —— 冲突降温句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_dialogue_002',
  'xuanhuan',
  'dialogue',
  '冲突降温句',
  'High',
  '[
    {
      "if": "protagonist_currently_weaker AND cannot_win_now",
      "then": "delayed_revenge_oath OR strategic_retreat_with_vow",
      "because": "立誓是玄幻题材特有的情绪储存机制，将当下愤怒转化为未来爆发的燃料"
    },
    {
      "if": "conflict_peak_reached AND protagonist_already_winning",
      "then": "dismissive_closure OR power_contempt_exit",
      "because": "赢家不需要解释，俯视终止比激烈收场更能凸显碾压感"
    },
    {
      "if": "elder_or_authority_intervenes",
      "then": "authority_forced_closure OR face_saving_retreat",
      "because": "接受长辈介入是维持家族/宗门体面的策略，非软弱，为后续情节保留张力"
    },
    {
      "if": "protagonist_needs_buy_time_for_power_up",
      "then": "set_time_limit_challenge OR one_year_bet_structure",
      "because": "约定时间期限创造主角成长的合理窗口，同时保持悬念"
    }
  ]',
  '[
    {"template": ""三十年河东，三十年河西，莫欺少年穷！"", "type": "立誓型", "context": "主角处于绝对劣势，公开立誓对抗羞辱"},
    {"template": ""一年后…我等着你把我打成残疾。"", "type": "延迟复仇型", "context": "接受约定，将复仇时间定格，制造成长悬念"},
    {"template": ""一条疯狗而已，它咬了你，你难道还想咬回来？"", "type": "实力碾压型", "context": "己方实力已碾压，以轻蔑比喻终止冲突"},
    {"template": ""今日之辱，来日我必百倍奉还！"", "type": "百倍奉还型", "context": "经典玄幻立誓句式，公开宣誓增加后续爽感"},
    {"template": ""跟你这种连斗者都不是的家伙计较，只会拉低我的段位。"", "type": "实力鄙视型", "context": "突破后对昔日欺压者的回击收场"},
    {"template": ""三年之后，我会找你！"", "type": "时限约定型", "context": "为成长弧线设定明确时间节点"},
    {"template": ""XXX，还不住手！你可不要忘记，你是XXX家的族长！"", "type": "长辈介入型", "context": "族长/长老强行介入，体面收场"},
    {"template": ""今日这笔账我记下了，希望你以后不要后悔。"", "type": "记仇立威型", "context": "表面平息，实则宣告复仇意图"},
    {"template": ""我没兴趣和一个废物多费口舌。"", "type": "懒得理废物型", "context": "高位者对低位者的懒得回应式降温"},
    {"template": ""够了！此事到此为止，谁再敢放肆，族规处置！"", "type": "权威强制收场型", "context": "场面失控时宗门/家族权威的强制介入"}
  ]',
  '[
    "对不起，我真的错了，请你一定要原谅我。（真诚无条件道歉，玄幻主角极少使用）",
    "我们各退一步好吗？我理解你的感受……（温和共情收场，与题材强弱逻辑冲突）",
    "算了，这都是误会，大家开心就好。（化解为和解，抹除冲突价值）",
    "唉，我刚才话说得太重了，心里也不好受。（表露悔意内疚，主角人设禁止）"
  ]',
  '{}',
  '{
    "typical": [
      "三十年河东，三十年河西，莫欺少年穷！",
      "一年后…我等着你把我打成残疾。",
      "今日之辱，来日我必百倍奉还！",
      "跟你这种废物计较，只会拉低我的段位。",
      "三年之后，我会找你！"
    ],
    "boundary": [
      "XXX没有再开口，只是默默地转过了身去。（沉默即终止，内心记仇）",
      "既然如此，那便随你。（表面接受，内心翻涌）"
    ],
    "counter": [
      "对不起，是我的错。（无条件道歉）",
      "我们各退一步吧。（和稀泥型收场）"
    ]
  }',
  '玄幻冲突降温遵循实力逻辑而非情感逻辑：弱者立誓延迟复仇，强者俯视懒得理会，长辈介入强制收场。绝无真诚道歉或无原则妥协。',
  'seed',
  1700000001
);

-- ============================================================
-- 3. 场景转场句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_structure_001',
  'xuanhuan',
  'structure',
  '场景转场句',
  'High',
  '[
    {
      "if": "scene_needs_time_jump AND emotion_needs_reset",
      "then": "natural_environment_marker + new_scene_action",
      "because": "玄幻题材用自然景象（月、星、山崖）作为情绪清零的过渡，比直接时间标注更具诗意质感"
    },
    {
      "if": "scene_needs_space_switch AND previous_scene_concluded",
      "then": "character_exit_action + new_location_status_description",
      "because": "角色离开动作是最自然的切镜信号，新地点首句即建立场景感"
    },
    {
      "if": "time_skip_needed AND plot_needs_quick_advance",
      "then": "direct_time_marker + condensed_summary_action",
      "because": "直接点明时间跳跃，省略无剧情意义的中间过程，保持叙事效率"
    },
    {
      "if": "emotion_switch_needed AND tense_to_relaxed",
      "then": "transitional_conjunctive + physical_state_change",
      "because": "以'然而''片刻之后'等转折词配合角色生理状态变化，软化情绪切换，避免突兀"
    }
  ]',
  '[
    {"template": "在咆哮了几嗓子之后，XXX的情绪也是缓缓的平息了下来……", "type": "情绪消退+隐式切换", "context": "从爆发情绪过渡到新场景"},
    {"template": "对着广场之外缓缓行去。/ 月如银盘，漫天繁星。山崖之颠……", "type": "离场+自然环境开场", "context": "经典玄幻转场：离开公共场合→独处自然场景"},
    {"template": "与XXX在家族中分开了手，XXX心急火燎的窜回了自己的屋子……", "type": "分别动作驱动转场", "context": "以告别动作自然衔接下一场景"},
    {"template": "床榻之上，少年闭目盘腿而坐，双手在身前摆出奇异的手印……", "type": "新场景状态直入", "context": "直接呈现新场景中的角色状态，无过渡说明"},
    {"template": "喧闹的人群中，测试员的声音，再次响了起来。", "type": "环境音触发新段落", "context": "以声音信号标志新一轮事件开始"},
    {"template": "行出斗技堂，XXX先是陪着……，随后……", "type": "行动链式转场", "context": "以连续行动串联多个空间"},
    {"template": "在XXX沉睡期间，青色水液微微晃荡……", "type": "睡眠+异常现象转场", "context": "以睡眠状态为时间跳跃的天然节点"},
    {"template": "三年之前……（回忆触发）", "type": "时间标注式闪回", "context": "直接以时间点开启回忆段落"},
    {"template": "然而片刻之后，又轻轻地抬了起来，只不过……", "type": "转折词+动作续接", "context": "同一场景内情绪软切换"},
    {"template": "深吸了一口气，XXX忽然回转过头……", "type": "生理动作触发新行动", "context": "以深呼吸等生理动作标志心理转变完成，切入新方向"}
  ]',
  '[
    "与此同时，在另一边……（生硬平行转场词，破坏沉浸感）",
    "让我们把视线转向……（打破第四面墙）",
    "不知不觉中，时间流逝……（banned_words触发）",
    "岁月如梭，转眼已是……（banned_words触发）"
  ]',
  '{
    "time_signals": ["三年之前", "三年后", "翌日", "片刻之后", "在XXX沉睡期间", "那一夜"],
    "space_signals": ["对着广场之外缓缓行去", "行出斗技堂", "窜回了自己的屋子", "月如银盘，漫天繁星"],
    "emotion_reset_signals": ["咆哮了几嗓子之后，情绪缓缓平息", "深吸了一口气", "轻叹了一口气", "然而片刻之后"]
  }',
  '{
    "typical": [
      "对着广场之外缓缓行去。/ 月如银盘，漫天繁星。",
      "在咆哮了几嗓子之后，XXX的情绪也是缓缓的平息了下来……",
      "床榻之上，少年闭目盘腿而坐……",
      "喧闹的人群中，测试员的声音，再次响了起来。",
      "与XXX在家族中分开了手，XXX心急火燎的窜回了自己的屋子……"
    ],
    "counter": [
      "与此同时，在另一边……",
      "不知不觉中，时间流逝……"
    ]
  }',
  '玄幻转场以自然景象（月/山崖/星空）为情绪清零的过渡媒介，以角色行动为空间切换信号，绝不使用生硬的平行转场词。',
  'seed',
  1700000001
);

-- ============================================================
-- 4. 章节收尾钩子句
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_structure_002',
  'xuanhuan',
  'structure',
  '章节收尾钩子句',
  'High',
  '[
    {
      "if": "chapter_ending AND mysterious_object_or_power_activated",
      "then": "supernatural_phenomenon_hook",
      "because": "神秘力量/奇遇是玄幻核心驱动，以超自然现象结尾最大化主线悬念"
    },
    {
      "if": "chapter_ending AND new_powerful_character_incoming",
      "then": "silhouette_or_partial_reveal_hook",
      "because": "强者登场的局部暗示比直接亮相更具悬念张力，引发读者对实力的猜测"
    },
    {
      "if": "chapter_ending AND protagonist_receives_key_offer_or_challenge",
      "then": "unanswered_question_or_pending_decision_hook",
      "because": "未决事项迫使读者进入下一章寻求答案"
    },
    {
      "if": "chapter_ending AND emotional_arc_needs_warmth",
      "then": "parallel_figure_action_hook",
      "because": "在压抑主线中插入一个温情动作结尾，为主角提供情感出口，增强读者对人物关系的投入"
    }
  ]',
  '[
    {"template": "手指中的黑色古戒，却是忽然亮起了一抹极其微弱的诡异毫光，毫光眨眼便逝，没有引起任何人的察觉……", "type": "神秘物件激活钩子", "context": "开启奇遇线的核心悬念抛出"},
    {"template": "那怪笑声，再次毫无边际的传出。眼瞳一缩，XXX的目光，陡然停在了右手之上……的黑色古朴戒指。", "type": "伏笔回收+新悬念叠加钩子", "context": "旧伏笔回收与新疑问同步产生"},
    {"template": "迟疑了一会，似乎方才极其不情愿的开口道："你想成为炼药师吗？"", "type": "关键邀请悬念钩子", "context": "重要机遇的开端，答案留到下章"},
    {"template": "在说完这些条件之后，XXX微扬着雪白的下巴，宛如公主般骄傲的等待着XXX的回答……", "type": "未决赌约钩子", "context": "赌约/条件提出，结果留悬"},
    {"template": "三位长老好奇的伸过头，望着玉匣子内，身体猛的一震，惊声道："聚气散？"", "type": "他人震惊反应钩子", "context": "通过他人强烈反应暗示重大信息"},
    {"template": "那里，一道紫色的倩影，正宛如精灵一般，轻灵跃来。", "type": "强者/关键人物登场钩子", "context": "重要角色的悬念式现身"},
    {"template": "……心头猛的一跳，XXX讪笑了两声，旋即有些心虚的将目光转向大厅内。", "type": "主角心虚反应钩子", "context": "主角异常反应暗示隐藏秘密"},
    {"template": "……在身后一干嫉妒的狼嚎声中，快步追了上去，与少年并肩而行……", "type": "温情并肩情感钩子", "context": "压抑章节后的情感出口，暗示关系变化"},
    {"template": "……那位老者，终于是站起来了…"呵呵，借助着XXX向父亲施威么？这XXX，真是好手段呐……"XXX的心头，响起了愤怒的冷笑。", "type": "隐藏强者揭露钩子", "context": "新强者登场+主角内心判断双层悬念"},
    {"template": "伸出的手掌有些僵硬，XXX嘴角狠狠的抽搐了半晌，方才漏风般的从牙齿缝中逼出两字："你狠！"", "type": "主角被迫认输情绪钩子", "context": "主角罕见的被压制，制造情绪低点与后续爆发预期"}
  ]',
  '[
    "忙碌的一天终于结束了，他安心地睡了过去。（完全闭合，零追读动力）",
    "对这件事，XXX算是彻底放下了。（完全闭合且情绪归零）",
    "经过这件事，他明白了一个深刻的道理：XXX。（总结陈词，失去悬念）",
    "夕阳西下，断肠人在天涯。（纯抒情，信息量为零）"
  ]',
  '{}',
  '{
    "typical": [
      "手指中的黑色古戒，却是忽然亮起了一抹极其微弱的诡异毫光……",
      "迟疑了一会，似乎方才极其不情愿的开口道："你想成为炼药师吗？"",
      "那里，一道紫色的倩影，正宛如精灵一般，轻灵跃来。",
      "三位长老……身体猛的一震，惊声道："聚气散？"",
      "伸出的手掌有些僵硬……方才漏风般的从牙齿缝中逼出两字："你狠！""
    ],
    "counter": [
      "忙碌的一天终于结束了，他安心地睡了过去。",
      "经过这件事，他明白了一个道理……"
    ]
  }',
  '玄幻章节结尾必须指向奇遇/突破/强者/赌约四大悬念类型之一，禁止完全闭合。70%以悬念收，20%以情绪收（温情），10%以动作收。',
  'seed',
  1700000001
);

-- ============================================================
-- 5. 心理独白句（主角自身）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_psychology_001',
  'xuanhuan',
  'psychology',
  '心理独白句（主角自身）',
  'High',
  '[
    {
      "if": "protagonist_just_suffered_public_humiliation AND now_alone",
      "then": "anger_accumulation_monologue OR power_craving_vow",
      "because": "独处是玄幻主角消化愤怒、产生修炼动力的核心场景，愤怒必须被记录以驱动后续成长弧线"
    },
    {
      "if": "protagonist_assessing_new_character_or_power",
      "then": "sharp_quick_judgment_monologue",
      "because": "快速判断模拟主角观察力，既传递信息又展示其对实力的敏锐感知"
    },
    {
      "if": "protagonist_discovers_own_abnormality_or_secret",
      "then": "confused_but_alert_monologue",
      "because": "主角对自身异变的感知是奇遇线的核心推进，困惑中带着对机遇的本能嗅觉"
    },
    {
      "if": "protagonist_confronting_betrayal_or_abandonment",
      "then": "cold_observation_of_human_nature_monologue",
      "because": "以洞悉人性的冷静独白取代情感崩溃，展现主角穿越者的成熟心智"
    }
  ]',
  '[
    {"template": ""实力呐…这个世界，没有实力，连一坨屎都不如，至少，屎还没人敢去踩！"", "type": "愤怒觉醒式", "context": "公开羞辱后独处，对实力的极端渴望"},
    {"template": ""这些人，都如此刻薄势利吗？或许是因为三年前他们曾经在自己面前露出过最谦卑的笑容……"", "type": "人性洞察式", "context": "观察周围人态度的转变，冷静分析"},
    {"template": ""七星大斗师！这老人竟然是一位七星大斗师？真是人不可貌相！"", "type": "实力判断式", "context": "发现隐藏强者，快速定级"},
    {"template": ""唉，自己在这家族中的地位，看来还真是越来越低啊……"", "type": "处境自知式", "context": "对自身处境的清醒认知，带苦涩"},
    {"template": ""如果自己现在是一名斗师，谁又敢如此践踏于我？"", "type": "力量渴望式", "context": "羞辱后对力量的直接渴望表达"},
    {"template": ""这妮子，究竟是什么身份？怎么让得三位长老如此忌惮……"", "type": "人物评估式", "context": "对关键角色的好奇与警惕"},
    {"template": ""我…真的很想把你宰了！"", "type": "愤怒压制式", "context": "极度愤怒下的内心独白，外表仍克制"},
    {"template": ""一年，四段？呵呵，如果是以前，或许还有可能吧，不过现在…基本没半点机会……"", "type": "冷静自评式", "context": "对自身修炼现状的理性判断，承认困境"},
    {"template": ""我草你奶奶的，把劳资穿过来当废物玩吗？草！"", "type": "穿越者爆发式", "context": "穿越者身份激活时的情绪总爆发，极端愤怒"},
    {"template": ""妈的，炼药师配置出来的东西，果然只有有钱人才用得起。"", "type": "穿越者吐槽式", "context": "以现代视角吐槽玄幻世界规则，轻松时刻"}
  ]',
  '[
    "我这样做是不是有点不道德？内心真过意不去。（道德自省，玄幻主角不做此类反思）",
    "万一失败了怎么办？我好害怕。（暴露恐惧，破坏掌控感人设）",
    "为什么没有人能真正理解我？我好孤独。（寻求共鸣型自怜，不符合强者心态）",
    "也许他们嘲讽我是有原因的，我确实……（为对手辩解，完全违背题材逻辑）"
  ]',
  '{}',
  '{
    "stats": {
      "surface_level_thought_ratio": "30%（动作反应/即时判断）",
      "direct_inner_monologue_ratio": "70%（直接想法/愤怒/渴望/分析）",
      "deep_subconscious_ratio": "0%（无潜意识分析）"
    },
    "trigger_scenes": {
      "most_dense": "主角独处（山崖/房间）或遭受外界刺激（嘲讽/挑衅）后",
      "secondary": "主角观察新角色或新事物时的快速判断"
    }
  }',
  '玄幻主角心理独白以中层直接想法为主，核心情绪是愤怒、渴望力量、不甘。绝不暴露软弱与恐惧。誓言和判断是最高频的独白类型。',
  'seed',
  1700000001
);

-- ============================================================
-- 6. 心理独白句（他人对主角的评价）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_psychology_002',
  'xuanhuan',
  'psychology',
  '心理独白句（他人对主角评价）',
  'Medium',
  '[
    {
      "if": "supporting_character_observing_protagonist_in_inferior_state",
      "then": "pity_or_regret_evaluation",
      "because": "旁观者的惋惜评价侧面强化主角的现状落差，为读者情感共鸣提供外部视角"
    },
    {
      "if": "antagonist_reassessing_protagonist_after_signs_of_potential",
      "then": "dangerous_variable_recognition_thought",
      "because": "反派的重新评估是主角开始崛起的信号，增加威胁感和后续对抗的合理性"
    },
    {
      "if": "crowd_reacting_to_protagonist_public_humiliation",
      "then": "collective_mockery_or_pity_commentary",
      "because": "群体嘲讽是玄幻题材的标准氛围工具，强化受辱场景的情绪烈度"
    }
  ]',
  '[
    {"template": ""三段？嘿嘿，果然不出我所料，这个'天才'这一年又是在原地踏步！"", "type": "旁观者嘲讽式", "context": "公开场合群众对主角现状的嘲讽评价"},
    {"template": ""哎，这废物真是把家族的脸都给丢光了。"", "type": "族人鄙视式", "context": "家族成员对主角的公开贬低"},
    {"template": ""唉，昔年那名闻乌坦城的天才少年，如今怎么落魄成这般模样了啊？"", "type": "惋惜式", "context": "旁观者对主角昔日天才与现实落差的惋惜"},
    {"template": ""这小子，日后若一直是废物，倒也罢了，如果真让他拥有了力量，绝对是个危险人物……"", "type": "反派警惕式", "context": "反派感知到主角潜力后的内心警觉"},
    {"template": ""唉，以三少爷以前的天赋，恐怕早该成为一名出色的斗者了吧，可惜……"", "type": "支持者遗憾式", "context": "善意角色对主角现状的遗憾评价"},
    {"template": ""一头咬人的狮子，并不可怕，可怕的是，这头狮子，懂得隐忍……"", "type": "对手深层评估式", "context": "有眼力的对手发现主角城府后的心理"},
    {"template": ""他真的回来了…不过，他似乎还是把我当成小时候的跟屁虫，真是根木头……"", "type": "情感线配角心理式", "context": "女性配角对主角的情感复杂心理"},
    {"template": ""你一个废物，没事给我装个狗屁的高深莫测啊……"", "type": "反派轻蔑式", "context": "反派对主角表现出的克制的误读式嘲讽"},
    {"template": ""这么好的少年，可惜，唉……"", "type": "长辈遗憾式", "context": "德高望重者对主角现状的惋惜"},
    {"template": ""嘿嘿，被人上门强行解除婚约，看你这族长，以后还有什么威望管理家族！"", "type": "看热闹者幸灾乐祸式", "context": "冲突事件中旁观者的幸灾乐祸"}
  ]',
  '[
    "XXX真是个好人，我打心底里佩服他。（正面赞美，与玄幻题材废物起点人设冲突）",
    "看来XXX已经准备好了，我们应该支持他。（集体正向期待，不符合主角被孤立的初期设定）"
  ]',
  '{}',
  '{}',
  '他人对主角的评价分两类：嘲讽/惋惜（强化受辱低谷）和警惕/重新评估（标志崛起开始）。两类评价都服务于主角情绪弧线，不提供真正意义的赞美。',
  'seed',
  1700000001
);

-- ============================================================
-- 7. 节奏控制规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_rhythm_001',
  'xuanhuan',
  'rhythm',
  '节奏控制规则',
  'High',
  '[
    {
      "if": "scene_type == tense OR public_humiliation_scene OR power_test_scene",
      "then": "short_sentences_max_13_chars + single_line_paragraphs",
      "because": "视觉高频切换模拟紧张节奏，单行段强制读者停顿于关键信息"
    },
    {
      "if": "scene_type == setting_explanation OR protagonist_alone_reflecting",
      "then": "long_sentences_20_to_40_chars + multi_line_paragraphs",
      "because": "平稳长句创造听故事模式，有利于传递大量背景信息或内心独白"
    },
    {
      "if": "key_information_announced OR critical_emotion_turning_point",
      "then": "isolated_single_line_paragraph",
      "because": "视觉孤立强制停顿，如舞台追光，极大强调该信息或转折的重要性"
    },
    {
      "if": "dialogue_rounds >= 3_to_5",
      "then": "insert_narration_max_42_chars",
      "because": "防止对话悬浮，保持场景感，叙述插入不干扰对话节奏"
    },
    {
      "if": "protagonist_emotion_about_to_explode",
      "then": "accumulative_short_clauses_with_comma + physiological_reaction_description",
      "because": "模仿急促呼吸和纷乱思绪，营造憋着一口气的紧张感，为爆发蓄力"
    }
  ]',
  '[
    {"template": ""斗之力，三段！"", "type": "单行段-关键信息", "context": "测试结果公布，强制停顿"},
    {"template": ""唉……"", "type": "单行段-情绪转折", "context": "核心情绪转折点的极简表达"},
    {"template": ""你…你敢休我？"", "type": "短句-紧张对话", "context": "冲突爆发时的短促应答"},
    {"template": "紧握的手掌，因为大力，而导致略微尖锐的指甲深深的刺进了掌心之中，带来一阵阵钻心的疼痛……", "type": "长句-生理反应积累", "context": "愤怒压制时的身体感知积累"},
    {"template": "在这片大陆上，斗气的修炼，几乎已经在无数代人的努力之下，发展到了巅峰地步……", "type": "长句-背景说明", "context": "世界观介绍，平稳语调"},
    {"template": ""呸。"吐出嘴中的草根，XXX忽然跳起身来，脸庞狰狞，对着夜空失态的咆哮道……", "type": "短句群-爆发前积累", "context": "以短促动作群描述爆发前的肢体状态"},
    {"template": ""我草你奶奶的，把劳资穿过来当废物玩吗？草！"", "type": "单行段-情绪总爆发", "context": "长期压抑后的极端爆发，最短最有力"},
    {"template": "月如银盘，漫天繁星。山崖之颠，XXX斜躺在草地之上……", "type": "短句组合-新场景开场", "context": "以意象短句组合快速建立新场景氛围"}
  ]',
  '[
    "超过200字的连续世界观旁白段落（除专用设定章节外禁止）",
    "意识流或蒙太奇手法（所有场景切换清晰直白）",
    "在紧张冲突场景中使用超过30字的长句（破坏紧张感）"
  ]',
  '{}',
  '{
    "stats": {
      "tense_scene_avg_sentence_length": "13字",
      "relaxed_scene_avg_sentence_length": "28字",
      "dialogue_paragraph_avg_lines": "1.2行",
      "narration_paragraph_avg_lines": "4.5行",
      "description_paragraph_avg_lines": "3.8行",
      "single_line_paragraph_triggers": "关键信息公布、情绪转折、场景核心动作"
    },
    "contrast": {
      "explosive_emotion": "单行咆哮短句（最短最有力，情绪总爆发）",
      "suppressed_emotion": "逗号连接的长句配生理反应词（积累感，压抑中的挣扎）"
    }
  }',
  '玄幻节奏由压抑-爆发循环驱动。单行段是关键信息的聚光灯，短句群是爆发前的蓄力器，长句段是世界观和内心的容纳器，三者交替形成强烈的张弛感。',
  'seed',
  1700000001
);

-- ============================================================
-- 8. 描写技法规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_description_001',
  'xuanhuan',
  'description',
  '描写技法规则',
  'High',
  '[
    {
      "if": "important_character_first_appearance",
      "then": "overall_impression THEN core_detail_face_eyes THEN clothing_symbol",
      "because": "整体→细节的顺序符合自然视觉焦点移动，核心细节聚焦脸/眼，服饰/配饰暗示修为或身份"
    },
    {
      "if": "need_show_character_temperament",
      "then": "behavioral_hint_preferred OVER direct_label",
      "because": "行为暗示比直接定义更具说服力，让读者自行感受角色气质而非被告知"
    },
    {
      "if": "chapter_opening OR before_emotional_turning_point",
      "then": "brief_natural_environment_description_visual_primary",
      "because": "自然景象（月/星/山）既奠定基调又是情绪转折的情景交融媒介"
    },
    {
      "if": "need_show_protagonist_isolation_or_pain",
      "then": "dense_atmosphere_keywords_plus_physical_metaphor",
      "because": "高频负面氛围词加比喻将抽象情绪具象化，最大化读者同情，为逆袭积蓄情感势能"
    }
  ]',
  '[
    {"template": "少年缓缓抬起头来，露出一张有些清秀的稚嫩脸庞，漆黑的眸子木然的在周围那些嘲讽的同龄人身上扫过……", "type": "外貌-整体到核心细节", "context": "主角特写，整体印象→眼神"},
    {"template": "少女清冷淡然的气质，犹如清莲初绽，小小年纪，却已初具脱俗气质……", "type": "气质-直接定义+比喻", "context": "重要女性角色登场，气质先行"},
    {"template": "平静的稚嫩俏脸，并未因为众人的注目而改变分毫。", "type": "气质-行为暗示", "context": "通过不变的表情暗示角色的淡然"},
    {"template": "月如银盘，漫天繁星。山崖之颠，XXX斜躺在草地之上……", "type": "环境-视觉意象开场", "context": "独处场景开篇，奠定孤独基调"},
    {"template": "周围传来的不屑嘲笑以及惋惜轻叹，落在那如木桩待在原地的少年耳中，恍如一根根利刺狠狠的扎在心脏一般……", "type": "氛围-听觉+比喻强化", "context": "受辱场景氛围营造，利刺比喻具象化痛苦"},
    {"template": "在众人视线汇聚之处，一位身着紫色衣裙的少女，正淡雅的站立……", "type": "外貌-动态站姿开场", "context": "重要角色以动态姿态登场"},
    {"template": "在老者的衣袍胸口处，赫然绘有一弯银色浅月，在浅月周围，还有点缀着七颗金光闪闪的星辰。", "type": "服饰符号-身份暗示", "context": "通过徽章/图案暗示门派实力等级"},
    {"template": "紧握的手掌，因为大力，而导致略微尖锐的指甲深深的刺进了掌心之中，带来一阵阵钻心的疼痛……", "type": "触觉-生理反应氛围", "context": "愤怒压制场景，通过身体感知外化情绪"}
  ]',
  '[
    "她长得很美，像仙女一样。（空洞形容词，无具体信息）",
    "天空很蓝，白云很白。（纯景物无叙事功能，且属于banned_words相关描写）",
    "他感到一种宇宙般的孤独。（抽象意识流，不符合玄幻题材的直接风格）",
    "超过80字的连续外貌描写段落（作者首次出场描写均在50字以内）"
  ]',
  '{}',
  '{
    "stats": {
      "sensory_channels": {"visual": "80%", "auditory": "15%", "tactile": "5%", "olfactory": "0%"},
      "first_appearance_avg_chars": "35字（不超过50字）",
      "description_order": "整体印象 → 核心细节（脸/眼）→ 服饰/配饰",
      "direct_vs_others_view_ratio": "5%直接描写 vs 95%他人视角",
      "direct_label_vs_behavioral_hint": "40%直接定义 vs 60%行为暗示"
    },
    "atmosphere_keywords_top10": ["自嘲", "嘲讽", "不屑", "惋惜", "落寞", "孤单", "废物", "苦涩", "急促", "狰狞"],
    "contrast_cases": {
      "heroine_A": "清纯与妩媚的矛盾感（暗示性格复杂，功能：后续关系摇摆）",
      "heroine_B": "清冷淡然如清莲初绽（稳定高贵符号，功能：坚定支持型女神）",
      "reason": "描写风格直接预设角色的功能定位"
    }
  }',
  '玄幻描写高度功能化：外貌简练聚焦脸/眼，气质行为暗示为主，环境服务情绪转折，氛围词汇围绕羞辱/孤立密集使用。描写即角色定位的预设信号。',
  'seed',
  1700000001
);

-- ============================================================
-- 9. 叙事结构规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_structure_003',
  'xuanhuan',
  'structure',
  '叙事结构规则',
  'High',
  '[
    {
      "if": "chapter_opening AND need_hook_reader",
      "then": "conflict_or_suspense_start PREFERRED OVER environment_start",
      "because": "迅速拉入冲突制造期待感，适应碎片化阅读，悬念开场占60%"
    },
    {
      "if": "chapter_main_conflict_reaching_climax",
      "then": "place_climax_at_chapter_70_to_90_percent",
      "because": "通过前段铺垫情绪积累，让高潮爆发更具冲击力，并在情绪顶点结章促进追读"
    },
    {
      "if": "protagonist_enters_new_phase_OR_recovers_from_setback",
      "then": "open_dedicated_setting_explanation_chapter",
      "because": "集中设定章节是玄幻特有手法，在情绪低谷后抛出宏大世界观，为主角提供新目标"
    },
    {
      "if": "need_maintain_story_continuity_across_chapters",
      "then": "embed_foreshadowing_4_to_8_chapters_before_payoff",
      "because": "中长跨度伏笔创造宿命感和恍然大悟感，是玄幻题材维持读者粘性的核心技法"
    }
  ]',
  '[
    {"template": ""斗之力，三段！"（直接以测试结果作为冲突钩子开章）", "type": "冲突/悬念开篇", "context": "将最高张力信息置于章节首句"},
    {"template": "（以环境+独处状态开篇）月如银盘，漫天繁星。山崖之颠，XXX斜躺在草地之上……", "type": "环境+状态开篇", "context": "舒缓段落开篇，通常接反思性内容"},
    {"template": "（中期弧线铺垫）"明天，家族中有贵客，你可别失了礼。"", "type": "预告式铺垫", "context": "提前3章埋下关键事件预告"},
    {"template": "（高潮末尾）"不要以为我XXX多在乎你这什么天才老婆，这张契约……是本少爷把你逐出XXX家的休证！"", "type": "冲突爆发高潮", "context": "章节末尾的最强冲突爆发点"},
    {"template": "（伏笔埋设）黯然的叹了口气，XXX抬起手掌，手指上有一颗黑色戒指……这是母亲临死前送给他的唯一礼物……", "type": "伏笔埋设", "context": "以情感物件轻描淡写地埋下奇遇线伏笔"}
  ]',
  '[
    "主角高潮置于章节前1/3（高潮前移导致后段拖沓）",
    "完全闭合式结尾（无悬念信息的平静收场）",
    "非线性叙事结构（玄幻主线保持单向线性，闪回需有明确情感触发）",
    "超过3章的纯日常无冲突段落"
  ]',
  '{
    "undercurrent": ["开始布局", "话里有话", "眼神交汇", "安静的回到队伍最后", "格格不入"],
    "open_conflict": ["皱眉", "冷喝", "当面嘲讽", "挑衅", "废物"],
    "explosion": ["休书", "动手", "杀意凛然", "彻底决裂", "大吼一声"]
  }',
  '{
    "stats": {
      "chapter_opening_types": {"conflict_suspense": "60%", "action_status": "20%", "dialogue": "10%", "environment": "10%"},
      "chapter_ending_types": {"suspense_hook": "70%", "emotional_resonance": "20%", "action_cliffhanger": "10%"},
      "climax_position": "章节后半段70-90%处",
      "event_cycle_chapters": "3-5章完成一个事件闭环",
      "foreshadowing_recovery_span": "4-8章内回收",
      "emotional_peak_frequency": "平均每3章一次波峰"
    },
    "core_emotional_loop": "公开羞辱（低谷）→ 独处隐忍酝酿 → 奇遇/突破（转折）→ 冲突爆发（高潮）→ 新悬念（循环触发）"
  }',
  '玄幻结构遵循"羞辱-成长-爆发"的短弧线循环。强钩子开头、高潮末尾、悬念收章是三大铁律，世界观设定章集中投放是玄幻特有手法。',
  'seed',
  1700000001
);

-- ============================================================
-- 10. 信息密度规则
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_info_density_001',
  'xuanhuan',
  'info_density',
  '信息密度规则',
  'High',
  '[
    {
      "if": "protagonist_enters_new_arc_phase AFTER major_setback",
      "then": "open_dedicated_setting_chapter_for_worldbuilding",
      "because": "在情绪低谷后集中抛出世界观，为主角提供宏大目标，同时系统性普及设定基础"
    },
    {
      "if": "need_deliver_specific_power_or_faction_info",
      "then": "embed_in_character_dialogue_question_answer_format",
      "because": "对话释出比旁白更生动，信息量可控，且推进角色关系"
    },
    {
      "if": "ordinary_object_will_become_key_turning_point_later",
      "then": "plant_brief_mention_with_emotional_anchor",
      "because": "情感锚点（如母亲遗物）让伏笔在潜意识中被记住，回收时产生宿命感"
    },
    {
      "if": "chapter_approaching_end AND need_setup_for_next",
      "then": "introduce_new_name_location_or_mystery_without_explanation",
      "because": "制造信息缺口，读者带疑问进入下章，核心追读驱动技法"
    }
  ]',
  '[
    {"template": "大陆名为斗气大陆……斗气，才是大陆的唯一主调！", "type": "世界观核心信息投放", "context": "设定章集中轰炸，建立基础认知框架"},
    {"template": "斗气大陆将斗气功法的等级，由高到低分为四阶十二级：天.地.玄.黄！", "type": "等级体系设定", "context": "为后续实力对比提供数值坐标"},
    {"template": "黯然的叹了口气，XXX抬起手掌，手指上有一颗黑色戒指……这是母亲临死前送给他的唯一礼物……", "type": "情感锚点伏笔埋设", "context": "以情感价值为伏笔附加记忆权重"},
    {"template": ""他们是云岚宗的人？"XXX惊讶的低声道。", "type": "对话式信息点", "context": "通过角色反应自然揭示新势力信息"},
    {"template": "在老者的衣袍胸口处，赫然绘有一弯银色浅月……七颗金光闪闪的星辰。（七星大斗师）", "type": "描写融入信息点", "context": "通过外观描写传递实力等级信息"},
    {"template": "（第2章用近三分之二篇幅集中介绍斗气大陆世界观）", "type": "设定章结构标注", "context": "专用设定章节存在，集中轰炸型"}
  ]',
  '[
    "大段说明文式旁白（超过200字的连续设定解释，仅设定章节允许）",
    "伏笔跨度超过10章且无中间线索（读者记忆断裂）",
    "在剧情推进章节中插入与当前情节无关的世界观介绍"
  ]',
  '{}',
  '{
    "stats": {
      "avg_new_info_points_per_chapter": "4个",
      "delivery_method_ratio": {"dedicated_setting_chapter": "集中轰炸", "dialogue_based": "随文释出", "description_embedded": "描写融合"},
      "foreshadowing_to_payoff_span": "平均6章（范围4-8章）",
      "info_position": "章节结尾信息密集，推进追读"
    },
    "contrast_cases": {
      "case_A": "第2章大段旁白解释整个世界观体系（普适性基础设定，难以通过单一事件展示）",
      "case_B": "第4章通过对话揭示云岚宗和关键角色信息（时效性具体信息，对话释出更自然）",
      "reason": "普适性/基础性设定用集中旁白，时效性/具体信息用对话随文释出"
    }
  }',
  '玄幻信息投放采用"集中轰炸+随文释出"双轨制。专属设定章集中建立世界观框架，日常章通过对话和描写随文释出，伏笔以情感锚点加权，跨度4-8章回收。',
  'seed',
  1700000001
);

-- ============================================================
-- 11. 对话收尾句（玄幻）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_dialogue_close_001',
  'xuanhuan',
  'dialogue',
  '对话收尾句',
  'High',
  '[
    {"if": "protagonist_is_weaker AND cannot_retaliate_now","then": "end_with_silence_or_minimal_response_that_signals_internal_vow","because": "玄幻主角处于劣势时，沉默本身就是隐忍的表达，一个细节动作（握拳、低头、转身）比任何言语都更有力，内心的誓言留给读者感受"},
    {"if": "protagonist_has_just_crushed_opponent","then": "end_with_contemptuous_dismissal_and_immediate_departure","because": "碾压之后不需要解释，轻蔑地终止对话并立刻离开，赢家的姿态就是不屑于多说"},
    {"if": "dialogue_involves_bet_or_oath_structure","then": "end_by_locking_in_the_terms_publicly","because": "赌约和誓言需要公开确认，收尾时把条件说清楚，让在场所有人都听到，这是玄幻题材特有的仪式感"},
    {"if": "protagonist_needs_to_exit_from_authority_figure","then": "end_with_respectful_but_firm_single_line_then_leave","because": "面对长辈或权威时，一句简短的回应后立刻离开，既保持了礼节又不失主角的独立性"}
  ]',
  '[
    {"template": "【写法】主角不说话，用一个具体的身体动作（握紧拳头、指甲刺入掌心、缓缓转身）来结束对话。这个动作要能传达出主角压抑的愤怒或决心，不要用旁白解释这个动作的含义。", "type": "隐忍动作收尾", "context": "主角处于劣势时的收场"},
    {"template": "【写法】主角说完最后一句话（通常是一句誓言或判断），然后直接离开，不等对方回应。这句话要和本章发生的具体事件直接相关，不能是通用的豪言壮语。", "type": "誓言离场式", "context": "主角立誓后的收场"},
    {"template": "【写法】主角用一句话把对方的实力或地位彻底贬低，然后表示懒得继续，这句话要基于本章已经展示的实力差距，不能是凭空的自大。", "type": "碾压轻蔑式", "context": "主角占绝对优势时的收场"},
    {"template": "【写法】赌约或挑战的收尾：主角把条件重复一遍，确认双方都听清楚了，然后用一个简短的动作（点头、转身、拿起某件东西）宣告协议成立。", "type": "赌约确认式", "context": "涉及赌约或挑战的对话收场"},
    {"template": "【写法】对话结束时，不写主角的反应，而是写在场其他人的反应——他们的沉默、退让或震惊，用这些反应来定性这场对话的结果。", "type": "旁观者定性式", "context": "公开场合的对话收场"}
  ]',
  '[
    "主角主动道歉或寻求和解来结束对话（破坏隐忍人设）",
    "用和本章剧情无关的感悟或哲理来收场（脱离剧情）",
    "引入本章没有出现过的新人物或新信息来打断对话（外挂元素）",
    "主角在收场时暴露恐惧或软弱（破坏强者形象）"
  ]',
  '{}',
  '{}',
  '玄幻对话收尾从本次交锋的实力对比出发：弱势时用隐忍动作和内心誓言，强势时用轻蔑离场，涉及赌约时用公开确认。收尾要从本章已发生的事里生长，禁止外挂元素和通用豪言。',
  'seed',
  1700000001
);

-- ============================================================
-- 12. 冲突升级句（玄幻）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_conflict_escalation_001',
  'xuanhuan',
  'conflict',
  '冲突升级句',
  'High',
  '[
    {"if": "user_instruction_implies_confrontation AND protagonist_is_currently_weaker","then": "escalate_through_public_humiliation_that_crosses_personal_line","because": "玄幻冲突升级的核心是羞辱的烈度——从言语轻视到公开羞辱到触碰底线，每一步都要比上一步更具体、更个人化"},
    {"if": "conflict_is_escalating AND protagonist_has_hidden_power","then": "show_protagonist_suppressing_power_surge_as_tension_signal","because": "主角压制力量爆发的身体反应（颤抖、气息紊乱、眼神变化）是玄幻冲突升级的独特张力来源，比直接爆发更有蓄力感"},
    {"if": "conflict_involves_multiple_parties AND needs_to_escalate","then": "have_bystanders_shift_from_neutral_to_taking_sides","because": "旁观者从中立到站队的过程是玄幻冲突升级的放大器，他们的反应定义了冲突的社会意义"},
    {"if": "conflict_is_about_to_reach_breaking_point","then": "use_one_final_trigger_that_is_specific_to_this_chapters_events","because": "冲突爆发的最后一根稻草必须是本章已经发生的事情的延伸，不能是凭空出现的新刺激"}
  ]',
  '[
    {"template": "【写法】冲突升级分三个层次：第一层是言语轻视（废物、没用）；第二层是公开羞辱（当着众人的面）；第三层是触碰主角的底线（涉及家人、师门、或主角最在意的东西）。每一层都要有具体的对话，不能跳层。", "type": "三层羞辱升级", "context": "玄幻标准冲突升级结构"},
    {"template": "【写法】在冲突升级过程中，用主角的身体反应来标记压力的积累——不是直接写愤怒，而是写具体的生理细节（手掌、呼吸、眼神），这些细节要随着冲突升级而逐渐加剧。", "type": "生理压力积累式", "context": "主角压制爆发时的张力"},
    {"template": "【写法】冲突升级时，让在场的旁观者从沉默到窃窃私语到公开表态，他们的反应要和冲突的走向一致，不能是随机的背景音。", "type": "旁观者反应升级式", "context": "公开场合的冲突升级"},
    {"template": "【写法】冲突的最后一个升级点，必须是本章已经出现过的某个元素（一件物品、一句话、一个人物关系）被对方用来攻击主角，这样爆发才有必然性而不是偶然性。", "type": "本章元素触发爆发式", "context": "冲突爆发的最后触发点"}
  ]',
  '[
    "冲突升级靠加感叹号或重复强调（没有实质内容的情绪堆砌）",
    "引入和本章剧情无关的新矛盾来升级冲突（外挂冲突）",
    "主角在冲突升级过程中暴露软弱或恐惧（破坏隐忍人设）",
    "冲突爆发的触发点是本章从未出现过的新信息（外挂触发）"
  ]',
  '{}',
  '{}',
  '玄幻冲突升级遵循三层羞辱结构，用主角的生理反应标记压力积累，用旁观者反应放大冲突烈度。爆发的触发点必须来自本章已有的元素，禁止外挂新矛盾。',
  'seed',
  1700000001
);

-- ============================================================
-- 13. 开章与转场钩子（玄幻）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_chapter_transition_001',
  'xuanhuan',
  'structure',
  '开章与转场钩子',
  'High',
  '[
    {"if": "user_instruction_implies_new_chapter AND previous_chapter_ended_on_humiliation","then": "open_with_protagonist_alone_processing_the_humiliation","because": "玄幻的情绪节奏是：公开羞辱→独处酝酿→奇遇突破。新章节开头应该承接羞辱后的独处状态，不要跳过这个酝酿阶段"},
    {"if": "user_instruction_implies_power_breakthrough_or_encounter","then": "open_in_medias_res_at_the_moment_of_discovery","because": "奇遇和突破是玄幻的核心爽点，新章节应该直接从发现的那一刻开始，不要用时间标记或环境描写拉开距离"},
    {"if": "user_instruction_implies_scene_switch_to_antagonist_or_other_faction","then": "use_contrast_with_protagonists_current_state_as_transition","because": "切换到反派或其他势力时，用与主角当前处境的对比来连接，这个对比本身就是叙事张力"},
    {"if": "user_instruction_implies_time_skip_for_training_or_preparation","then": "compress_time_with_a_single_result_sentence_then_show_change","because": "修炼和准备阶段不需要详细描写，用一句话说明时间和结果，然后直接展示变化后的状态"}
  ]',
  '[
    {"template": "【写法】新章节开头，主角独处，用一个具体的环境细节（月光、山崖、夜风）来锚定场景，然后立刻进入主角对上章事件的内心反应。这个环境细节要和主角的情绪状态形成呼应，不是随机的背景。", "type": "独处情绪承接式开章", "context": "羞辱或挫折后的新章节"},
    {"template": "【写法】奇遇或突破的新章节，第一句话就是主角感知到异常的那一刻（某种感觉、某个声音、某件东西的变化），直接进入发现，不要用时间标记或环境描写作为缓冲。", "type": "奇遇直入式开章", "context": "奇遇或突破场景的新章节"},
    {"template": "【写法】转场到其他势力或反派时，用一句话建立与主角当前处境的对比（主角在受苦，反派在庆祝；主角在修炼，敌人在布局），这个对比要基于本章已有的信息。", "type": "对比转场式", "context": "切换到其他势力的视角"},
    {"template": "【写法】时间跳跃时，用一句话同时说明时间长度和发生的变化，然后直接展示变化后的状态。不要用"不知不觉""岁月如梭"等套话，要用具体的变化来标记时间。", "type": "变化标记时间跳跃", "context": "修炼或准备阶段的时间压缩"},
    {"template": "【写法】如果用户指令暗示需要从一个场景切换到另一个，用主角的一个目的性动作（离开、前往、寻找）来驱动切换，这个动作要和用户指令的意图直接对应。", "type": "目的动作驱动转场", "context": "主角主动切换场景"}
  ]',
  '[
    "用"翌日清晨""不知不觉"等套话开章（硬切，打断情绪连续性）",
    "奇遇或突破场景用大段环境描写开头（拖慢节奏，错过最佳切入点）",
    "转场时引入本章没有出现过的新元素（外挂转场）",
    "时间跳跃只说时间不说变化（信息量为零的套话）",
    "转场方式和用户指令的意图脱节（自行决定跳跃方式）"
  ]',
  '{}',
  '{}',
  '玄幻开章和转场遵循情绪节奏：羞辱后承接独处酝酿，奇遇时直入发现现场，时间跳跃用变化而非套话标记。转场必须从用户指令的意图出发，禁止硬套时间标记和外挂元素。',
  'seed',
  1700000001
);

-- ============================================================
-- 14. 连锁震惊写法（玄幻）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_chain_shock_001',
  'xuanhuan',
  'psychology',
  '连锁震惊写法',
  'Medium',
  '[
    {"if": "protagonist_achieves_breakthrough_or_demonstrates_power","then": "write_layered_shock_from_peers_to_elders_to_sect_leaders","because": "玄幻的爽感在于实力被逐层认可，同门→长老→宗主的层级震惊是这个题材特有的爽感结构"},
    {"if": "protagonist_reverses_situation_in_public","then": "show_each_level_reassessing_protagonist_from_waste_to_threat","because": "从废物到威胁的重新评估，层级越高说明主角的崛起越彻底"}
  ]',
  '[
    {"template": "【写法】按层级从低到高依次写反应：同门弟子（废物怎么可能）→执事/长老（此子根骨非凡）→宗主/强者（不能让他离开/必须拉拢）。每层反应要有具体的行为或语言，不能只写震惊。", "type": "三层递进式", "context": "主角展示出超出废物标签的实力时"},
    {"template": "【写法】反派/对手的反应要单独处理：先是轻蔑（不过如此），然后是不可置信（这怎么可能），然后是警惕（此人是变数），最后是忌惮（必须除掉）。四步走，体现威胁感的递进。", "type": "对手威胁感递进式", "context": "主角在对手面前展示实力时"},
    {"template": "【写法】旁观者的反应要通过具体行为传达：退后半步、屏住呼吸、互相对视、不敢出声——用这些行为暗示震惊，比直接写震惊更有压迫感。", "type": "旁观者行为暗示式", "context": "公开场合的实力展示时"}
  ]',
  '[
    "只写众人震惊、全场哗然等空洞描述",
    "所有层级同时震惊，失去层次感",
    "每章都强行安排震惊反应（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '连锁震惊写法：同门→长老→宗主的层级震惊，每层反应具体化。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000001
);

-- ============================================================
-- 15. 信息差释放写法（玄幻）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_info_gap_release_001',
  'xuanhuan',
  'structure',
  '信息差释放写法',
  'Medium',
  '[
    {"if": "protagonist_has_hidden_power_system_or_secret","then": "control_revelation_timing_and_audience","because": "玄幻的金手指价值在于分层揭露，先让小范围的人知道，再逐步扩大，每次揭露都是独立的爽点"},
    {"if": "protagonist_secret_is_about_to_be_partially_revealed","then": "write_the_process_of_others_realizing_protagonist_is_different","because": "从以为是废物到发现不对劲到彻底震惊，这个认知升级的过程本身就是爽感"}
  ]',
  '[
    {"template": "【写法】金手指/秘密的揭露要分阶段：先在私下小范围展示一角（让亲近的人半信半疑），再在小规模冲突中露出更多（让对手开始警惕），最后在公开场合完全爆发（让所有人震惊）。每个阶段都是独立的爽点。", "type": "三阶段揭露式", "context": "主角有隐藏实力或秘密时"},
    {"template": "【写法】对方从以为是废物到发现不对劲的过程要写出来：先是觉得奇怪（这废物怎么没死），然后开始怀疑（他是不是在藏实力），最后确认（原来他一直都在隐藏）。这个过程本身就是爽感。", "type": "对方认知升级式", "context": "对手开始察觉主角不简单时"},
    {"template": "【写法】旧的秘密即将完全揭晓时，提前埋下新的更高层次的秘密。让读者在享受当前爽点的同时，已经对下一个秘密产生期待。", "type": "秘密叠加式", "context": "一个隐藏实力即将完全暴露时"}
  ]',
  '[
    "一次性把所有实力都展示出来（浪费金手指价值）",
    "跳过对方从不知道到知道的过程",
    "每章都强行安排秘密揭露（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '信息差释放写法：金手指分阶段揭露，写出对方认知升级的过程。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000001
);

-- ============================================================
-- 16. 情绪递进铺垫写法（玄幻）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_emotion_escalation_001',
  'xuanhuan',
  'structure',
  '情绪递进铺垫写法',
  'Medium',
  '[
    {"if": "building_up_to_reversal_or_breakthrough_moment","then": "escalate_humiliation_step_by_step_before_explosion","because": "玄幻的爽感公式是羞辱积累到极限然后爆发，铺垫越充分爆发越有力"},
    {"if": "protagonist_is_being_publicly_humiliated","then": "make_each_step_more_public_and_more_personal","because": "羞辱越公开越个人化，后续逆转的爽感越强"}
  ]',
  '[
    {"template": "【写法】羞辱铺垫要分步走：废物标签（被贴上废物的标签）→公开嘲讽（在众人面前被嘲讽）→赌约羞辱（被逼接受不平等的赌约）→被拿来对比（和天才对比衬托废物）→被逼出宗/解除婚约（被逼到最低点）。每一步都要比上一步更公开更具体。", "type": "五步羞辱递进式", "context": "打脸/逆转场景的铺垫阶段"},
    {"template": "【写法】每一步羞辱都要触碰主角更深的底线：从针对实力，到针对家族，到针对最在意的人或事。越到后面越个人化，爆发才有必然性。", "type": "底线递进式", "context": "对手持续施压时"},
    {"template": "【写法】铺垫阶段主角的内心要有积累：不是麻木，而是在压抑。通过握紧的拳头、咬紧的牙关、眼神的变化传达积累，不要提前爆发。", "type": "主角压抑积累式", "context": "主角承受羞辱的过程中"}
  ]',
  '[
    "铺垫只有一步就直接爆发",
    "每一步羞辱都一样，没有递进",
    "主角提前爆发，破坏铺垫节奏",
    "每章都强行安排递进铺垫（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '情绪递进铺垫写法：羞辱要分步递进，越来越公开越来越个人化，主角内心压抑积累。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000001
);

-- ============================================================
-- 17. 配角反应具体化写法（玄幻）
-- ============================================================
INSERT OR REPLACE INTO craft_patterns VALUES (
  'xuanhuan_npc_reaction_detail_001',
  'xuanhuan',
  'psychology',
  '配角反应具体化写法',
  'Medium',
  '[
    {"if": "protagonist_demonstrates_power_that_contradicts_waste_label","then": "write_specific_shock_reactions_not_just_shock_as_a_word","because": "废物逆袭的爽感需要配角的具体反应来放大，只写震惊等于没写"},
    {"if": "antagonist_is_forced_to_face_protagonists_true_strength","then": "show_antagonist_going_from_contempt_to_disbelief_to_fear","because": "对手从轻蔑到恐惧的过程是玄幻题材最有爽感的配角反应"}
  ]',
  '[
    {"template": "【写法】配角的震惊要写三个层面：身体反应（后退/手抖/变色）、语言变化（从嘲讽到沉默到颤抖）、内心判断（从废物到不可思议到威胁）。三个层面都写到，反应才立体。", "type": "三层面具体化式", "context": "主角展示出超出废物标签的实力时"},
    {"template": "【写法】对手的不可置信要写出过程：先是否认（这不可能，他是废物），然后是动摇（难道我看错了），然后是沉默（无话可说），最后是重新打量（此人不可小觑）。不能直接跳到最后。", "type": "对手不可置信过程式", "context": "对手被主角超越时"},
    {"template": "【写法】长辈/强者的重新评估要写出具体变化：从随意到认真，从站着到坐直，从漫不经心到全神贯注——用这些姿态变化传达重视，比直接写他们重视更有说服力。", "type": "强者姿态变化式", "context": "有地位的人开始重新评估主角时"}
  ]',
  '[
    "只写众人震惊、全场哗然等空洞描述",
    "配角反应一步到位，没有过程",
    "每章都强行安排配角震惊（剧情不合适时不需要）"
  ]',
  '{}',
  '{}',
  '配角反应具体化写法：身体反应+语言变化+心理变化三层面，对手从轻蔑到恐惧的过程要写出来。注意：只在剧情合适的时候使用，不需要每章都有。',
  'seed',
  1700000001
);
