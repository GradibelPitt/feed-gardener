/** Synthetic demo content. No item represents a fetched or published post. */
import { defaultBehaviorWeights, type BehaviorWeights, type StrategyMode } from './strategy.ts';

export type Source = 'YouTube' | 'Bluesky' | 'RSS';

export type CustomTag = {
  id: string;
  label: string;
  labelZh: string;
  labelEn: string;
  translationStatus: 'translated' | 'source_label';
  source: 'github_live' | 'manual';
  evidenceUrl: string;
};

export type ReadingLanguage = 'zh' | 'en' | 'bilingual';

/** Keep translated aliases within the existing Jev tag input limit. */
export function bilingualInterestLabel(english: string, chinese?: string): string {
  const base = english.trim();
  const localized = chinese?.trim();
  const combined =
    localized && localized.toLocaleLowerCase() !== base.toLocaleLowerCase()
      ? `${base} (${localized})`
      : base;
  return combined.length <= 80 ? combined : base.slice(0, 80);
}

/** All discovery surfaces use these same saved interests. Specific tags take priority. */
export function searchInterests(preferences: Preferences): { labelEn: string; labelZh: string }[] {
  const selectedTags = domains.flatMap((domain) =>
    domain.tags.filter((tag) => preferences.tags.includes(tag.id)),
  );
  const specific = [
    ...selectedTags.map((tag) => ({ labelEn: tag.labelEn, labelZh: tag.label })),
    ...preferences.customTags.map((tag) => ({ labelEn: tag.labelEn, labelZh: tag.labelZh })),
  ];
  return specific.length
    ? specific
    : domains
        .filter((domain) => preferences.domains.includes(domain.id))
        .map((domain) => ({ labelEn: domain.labelEn, labelZh: domain.label }));
}

export type Content = {
  id: string;
  title: string;
  titleEn: string;
  creator: string;
  source: Source;
  domain: string;
  tags: string[];
  duration: number;
  ageHours: number;
  format: 'demo' | 'tutorial' | 'news' | 'discussion';
  depth: 'intermediate' | 'advanced';
  language: 'zh' | 'en';
  summary: string;
  summaryEn: string;
  accent: string;
  art: 'terminal' | 'network' | 'abstract' | 'code' | 'layers' | 'waves';
  coverLabel: string;
};

export type Preferences = {
  domains: string[];
  tags: string[];
  /** Feeder's editable per-user tag interest weights; unrelated to Jev title scoring. */
  tagJev?: Record<string, number>;
  /** Minimum Jev title relevance per displayed item, from 1 to 10 (legacy storage key). */
  targetJevAverage?: number;
  shortsNearbyTopics?: boolean;
  shortsDurationFilterEnabled?: boolean;
  shortsMaxDurationSeconds?: number;
  customTags: CustomTag[];
  relatedDomains: string[];
  exploration: number;
  onlySelectedTags?: boolean;
  requireAllSelectedTags?: boolean;
  excludeUnselectedTags?: boolean;
  behaviorWeights: BehaviorWeights;
  strategyMode: StrategyMode;
  readingLanguage: ReadingLanguage;
  blockedSources: string[];
  blockedTags: string[];
  version: number;
};

const technologyDomains = [
  {
    id: 'ai-infrastructure',
    label: 'AI 基础设施',
    labelEn: 'AI infrastructure',
    icon: 'cpu',
    tags: [
      { id: 'local-inference', label: '本地推理', labelEn: 'Local inference' },
      { id: 'agents', label: '智能体', labelEn: 'Agents' },
      { id: 'rag', label: '检索增强', labelEn: 'RAG' },
      { id: 'model-serving', label: '模型部署', labelEn: 'Model serving' },
      { id: 'evaluation', label: '模型评测', labelEn: 'Evaluation' },
      { id: 'quantization', label: '模型量化', labelEn: 'Quantization' },
    ],
  },
  {
    id: 'backend-systems',
    label: '后端与分布式系统',
    labelEn: 'Backend & distributed systems',
    icon: 'network',
    tags: [
      { id: 'databases', label: '数据库', labelEn: 'Databases' },
      { id: 'distributed-systems', label: '分布式系统', labelEn: 'Distributed systems' },
      { id: 'observability', label: '可观测性', labelEn: 'Observability' },
      { id: 'event-streaming', label: '事件流', labelEn: 'Event streaming' },
      { id: 'api-design', label: 'API 设计', labelEn: 'API design' },
    ],
  },
  {
    id: 'developer-tools',
    label: '开发者工具',
    labelEn: 'Developer tools',
    icon: 'terminal',
    tags: [
      { id: 'cli', label: '命令行工具', labelEn: 'CLI tools' },
      { id: 'dev-environments', label: '开发环境', labelEn: 'Dev environments' },
      { id: 'git', label: 'Git 工作流', labelEn: 'Git workflows' },
      { id: 'testing', label: '自动化测试', labelEn: 'Testing' },
      { id: 'code-search', label: '代码搜索', labelEn: 'Code search' },
    ],
  },
  {
    id: 'open-source',
    label: '开源应用',
    labelEn: 'Open-source applications',
    icon: 'box',
    tags: [
      { id: 'open-source', label: '开源项目', labelEn: 'Open source' },
      { id: 'self-hosting', label: '自托管', labelEn: 'Self-hosting' },
      { id: 'local-first', label: '本地优先', labelEn: 'Local-first' },
      { id: 'privacy', label: '隐私工具', labelEn: 'Privacy tools' },
    ],
  },
  {
    id: 'web-interaction',
    label: 'Web 与交互技术',
    labelEn: 'Web & interaction',
    icon: 'globe',
    tags: [
      { id: 'webgpu', label: 'WebGPU', labelEn: 'WebGPU' },
      { id: 'accessibility', label: '无障碍', labelEn: 'Accessibility' },
      { id: 'design-systems', label: '设计系统', labelEn: 'Design systems' },
      { id: 'web-performance', label: 'Web 性能', labelEn: 'Web performance' },
    ],
  },
  {
    id: 'robotics-edge',
    label: '机器人与边缘计算',
    labelEn: 'Robotics & edge computing',
    icon: 'bot',
    tags: [
      { id: 'robotics', label: '机器人', labelEn: 'Robotics' },
      { id: 'edge-ai', label: '边缘 AI', labelEn: 'Edge AI' },
      { id: 'embedded', label: '嵌入式系统', labelEn: 'Embedded systems' },
      { id: 'computer-vision', label: '计算机视觉', labelEn: 'Computer vision' },
    ],
  },
];

// A navigation layer over the same domain/tag catalog used by Preferences and the editor.
// IDs are persisted: keep existing IDs when changing display copy.
function category(
  id: string,
  label: string,
  labelEn: string,
  hue: number,
  description: string,
  groups: [string, string, string, string][],
) {
  return {
    id,
    label,
    labelEn,
    hue,
    description,
    domains: groups.map(([domainId, domainZh, domainEn, topics]) => ({
      id: domainId,
      label: domainZh,
      labelEn: domainEn,
      icon: 'globe',
      tags: topics.split('|').map((topic) => {
        const [labelEn, label] = topic.split('=');
        return {
          id: `${domainId}:${labelEn
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')}`,
          label,
          labelEn,
        };
      }),
    })),
  };
}

export const interestCategories = [
  category('sports', '体育', 'Sports', 22, 'The game. The people. The moments.', [
    [
      'team-sports',
      '球类运动',
      'Team sports',
      'Basketball=篮球|Football=足球|Baseball=棒球|Volleyball=排球|Ice hockey=冰球|American football=美式橄榄球',
    ],
    [
      'individual-sports',
      '个人竞技',
      'Individual sports',
      'Tennis=网球|Badminton=羽毛球|Table tennis=乒乓球|Golf=高尔夫|Swimming=游泳|Track and field=田径',
    ],
    [
      'racing-combat',
      '赛车与格斗',
      'Racing & combat',
      'Formula 1=一级方程式|MotoGP=世界摩托车锦标赛|Boxing=拳击|MMA=综合格斗|Martial arts=武术',
    ],
  ]),
  category('music', '音乐', 'Music', 285, 'Find your next favorite sound.', [
    [
      'music-genres',
      '音乐风格',
      'Genres & scenes',
      'Pop=流行乐|Hip-hop=嘻哈|Jazz=爵士|Classical=古典音乐|Electronic=电子音乐|Rock=摇滚|R&B=节奏布鲁斯|Folk=民谣',
    ],
    [
      'making-music',
      '音乐创作',
      'Making music',
      'Guitar=吉他|Piano=钢琴|Singing=声乐|Music production=音乐制作|Songwriting=歌曲创作|DJing=打碟',
    ],
    [
      'music-culture',
      '音乐文化',
      'Music culture',
      'Live concerts=现场演出|Festivals=音乐节|Vinyl records=黑胶唱片|Music discovery=音乐发现|K-pop=韩国流行乐',
    ],
  ]),
  category('gaming', '游戏', 'Gaming', 245, 'New worlds. One more round.', [
    [
      'video-games',
      '电子游戏',
      'Video games',
      'RPGs=角色扮演游戏|Strategy games=策略游戏|Indie games=独立游戏|Cozy games=休闲治愈游戏|Action adventures=动作冒险|Simulation games=模拟游戏',
    ],
    [
      'gaming-community',
      '游戏社群',
      'Players & communities',
      'Esports=电竞|Speedrunning=速通|Game reviews=游戏评测|Game development=游戏开发|Retro gaming=复古游戏',
    ],
    [
      'tabletop',
      '桌面游戏',
      'Around the table',
      'Board games=桌游|Tabletop RPGs=桌面角色扮演|Trading card games=集换式卡牌|Chess=国际象棋|Puzzles=解谜',
    ],
  ]),
  category(
    'entertainment',
    '影视娱乐',
    'Entertainment',
    338,
    'Stories you cannot stop talking about.',
    [
      [
        'screen',
        '影视',
        'Film & television',
        'Cinema=电影|TV series=电视剧|Documentaries=纪录片|Animation=动画电影|Film criticism=影评',
      ],
      [
        'pop-culture',
        '流行文化',
        'Pop culture',
        'Celebrity news=明星动态|Comedy=喜剧|Reality TV=真人秀|Internet culture=网络文化|Podcasts=播客',
      ],
      [
        'anime-comics',
        '动漫',
        'Anime & comics',
        'Anime=日本动画|Manga=漫画|Webtoons=网络漫画|Cosplay=角色扮演|Graphic novels=图像小说',
      ],
    ],
  ),
  category('food', '美食烹饪', 'Food & cooking', 38, 'A whole world of flavor.', [
    [
      'home-cooking',
      '日常烹饪',
      'In the kitchen',
      'Everyday recipes=家常菜|Baking=烘焙|Fermentation=发酵|Plant-based cooking=植物性烹饪|Meal prep=备餐',
    ],
    [
      'food-cultures',
      '饮食文化',
      'Food cultures',
      'Chinese cuisine=中国菜|Japanese cuisine=日本料理|Mediterranean food=地中海菜|Indian cuisine=印度菜|Street food=街头美食',
    ],
    [
      'food-discovery',
      '美食探索',
      'Out for a bite',
      'Restaurants=餐厅|Pastry=甜点|Food history=饮食史|Local markets=地方市集|Food photography=美食摄影',
    ],
  ]),
  category('tea-coffee', '茶与咖啡', 'Tea & coffee', 145, 'Small rituals, better mornings.', [
    [
      'tea',
      '茶',
      'The world of tea',
      'Green tea=绿茶|Oolong=乌龙茶|Black tea=红茶|Pu-erh=普洱茶|Matcha=抹茶|Gongfu brewing=工夫茶',
    ],
    [
      'coffee',
      '咖啡',
      'Coffee craft',
      'Espresso=意式浓缩|Pour-over=手冲|Coffee roasting=咖啡烘焙|Latte art=拉花|Coffee origins=咖啡产地',
    ],
    [
      'drink-culture',
      '饮品文化',
      'Rituals & discoveries',
      'Teaware=茶具|Tea history=茶文化史|Cafe culture=咖啡馆文化|Cacao=可可|Alcohol-free drinks=无酒精饮品',
    ],
  ]),
  category('travel', '旅行', 'Travel', 195, 'Somewhere you have never been.', [
    [
      'travel-styles',
      '旅行方式',
      'Your kind of trip',
      'Solo travel=独自旅行|Slow travel=慢旅行|Backpacking=背包旅行|Road trips=公路旅行|Family travel=家庭旅行',
    ],
    [
      'destinations',
      '目的地',
      'Places & cultures',
      'Asia travel=亚洲旅行|Europe travel=欧洲旅行|Africa travel=非洲旅行|Americas travel=美洲旅行|Oceania travel=大洋洲旅行',
    ],
    [
      'travel-experiences',
      '旅行体验',
      'Along the way',
      'City guides=城市指南|Local experiences=在地体验|Travel photography=旅行摄影|Train journeys=铁路旅行|Travel planning=旅行规划',
    ],
  ]),
  category('art-design', '艺术设计', 'Art & design', 315, 'A different way of seeing.', [
    [
      'visual-arts',
      '视觉艺术',
      'Visual arts',
      'Painting=绘画|Illustration=插画|Sculpture=雕塑|Digital art=数字艺术|Art history=艺术史',
    ],
    [
      'creative-design',
      '创意设计',
      'Design practice',
      'Graphic design=平面设计|Typography=字体设计|Product design=产品设计|Branding=品牌设计|Motion design=动态设计',
    ],
    [
      'photography-film',
      '摄影影像',
      'Through the lens',
      'Portrait photography=人像摄影|Street photography=街头摄影|Film photography=胶片摄影|Filmmaking=电影制作|Video editing=视频剪辑',
    ],
  ]),
  {
    id: 'technology',
    label: '科技',
    labelEn: 'Technology',
    hue: 210,
    description: 'Ideas that shape what comes next.',
    domains: technologyDomains,
  },
  category('science', '科学', 'Science', 180, 'Stay curious about everything.', [
    [
      'physical-science',
      '物质科学',
      'How the universe works',
      'Physics=物理|Astronomy=天文学|Chemistry=化学|Mathematics=数学|Space exploration=太空探索',
    ],
    [
      'life-science',
      '生命科学',
      'The living world',
      'Biology=生物学|Neuroscience=神经科学|Genetics=遗传学|Ecology=生态学|Marine biology=海洋生物学',
    ],
    [
      'science-society',
      '科学与社会',
      'Discovery & debate',
      'Science communication=科学传播|Research methods=研究方法|Citizen science=公民科学|Science history=科学史|Bioethics=生命伦理',
    ],
  ]),
  category('health', '健康与医学', 'Health & medicine', 165, 'Understand the body and mind.', [
    [
      'medical-science',
      '医学',
      'Medical science',
      'Medical research=医学研究|Public health=公共卫生|Anatomy=解剖学|Medical technology=医疗科技|Health education=健康教育',
    ],
    [
      'wellbeing',
      '身心健康',
      'Everyday wellbeing',
      'Sleep science=睡眠科学|Nutrition=营养学|Mental health=心理健康|Healthy aging=健康老龄化|Preventive health=预防保健',
    ],
    [
      'care-community',
      '照护与社群',
      'Care & community',
      'Nursing=护理|Caregiving=照护|Disability advocacy=残障权益|Patient stories=患者故事|Healthcare systems=医疗体系',
    ],
  ]),
  category('fitness', '健身与运动', 'Fitness & movement', 76, 'Find the way you like to move.', [
    [
      'training',
      '训练',
      'Training & strength',
      'Strength training=力量训练|Running=跑步|Cycling=骑行|Calisthenics=徒手健身|Mobility=灵活性训练',
    ],
    [
      'mindful-movement',
      '身心运动',
      'Mindful movement',
      'Yoga=瑜伽|Pilates=普拉提|Dance fitness=舞蹈健身|Tai chi=太极|Stretching=拉伸',
    ],
    [
      'active-life',
      '活力生活',
      'An active life',
      'Walking=散步|Fitness habits=健身习惯|Endurance training=耐力训练|Sports science=运动科学|Adaptive fitness=适应性健身',
    ],
  ]),
  category(
    'nature',
    '自然与户外',
    'Nature & outdoors',
    120,
    'A little further from the everyday.',
    [
      [
        'outdoor-adventures',
        '户外探险',
        'Out in the open',
        'Hiking=徒步|Camping=露营|Climbing=攀岩|Kayaking=皮划艇|Surfing=冲浪|Skiing=滑雪',
      ],
      [
        'wildlife',
        '野生自然',
        'Wild things',
        'Birdwatching=观鸟|Wildlife photography=野生动物摄影|Botany=植物学|Ocean life=海洋生命|Conservation=自然保护',
      ],
      [
        'earth-environment',
        '地球环境',
        'Our planet',
        'Climate science=气候科学|Sustainable living=可持续生活|Geology=地质学|Weather=天气|Renewable energy=可再生能源',
      ],
    ],
  ),
  category('books', '阅读与写作', 'Books & writing', 40, 'Get lost in a good idea.', [
    [
      'reading',
      '阅读',
      'Your next read',
      'Literary fiction=文学小说|Science fiction=科幻|Fantasy=奇幻|Mystery=推理|Nonfiction=非虚构|Poetry=诗歌',
    ],
    [
      'writing',
      '写作',
      'Put it into words',
      'Creative writing=创意写作|Essays=随笔|Screenwriting=剧本写作|Journaling=日记|Publishing=出版',
    ],
    [
      'book-culture',
      '书籍文化',
      'Between the pages',
      'Book clubs=读书会|Libraries=图书馆|Literary criticism=文学评论|Author interviews=作家访谈|Book collecting=藏书',
    ],
  ]),
  category('fashion', '时尚与美妆', 'Style & beauty', 330, 'Make it feel like you.', [
    [
      'personal-style',
      '个人风格',
      'Personal style',
      'Streetwear=街头服饰|Vintage fashion=复古时尚|Minimal style=极简穿搭|Sustainable fashion=可持续时尚|Accessories=配饰',
    ],
    [
      'beauty',
      '美妆',
      'Beauty & care',
      'Skincare=护肤|Makeup=彩妆|Haircare=护发|Fragrance=香水|Nail art=美甲',
    ],
    [
      'fashion-culture',
      '时尚文化',
      'Behind the style',
      'Fashion history=时尚史|Textiles=纺织面料|Fashion design=服装设计|Runway=时装秀|Personal styling=个人造型',
    ],
  ]),
  category('home', '家居与园艺', 'Home & garden', 96, 'Make room for a life you love.', [
    [
      'home-design',
      '家居设计',
      'Your space',
      'Interior design=室内设计|Small spaces=小空间设计|Architecture=建筑|Home organization=家居收纳|Furniture=家具',
    ],
    [
      'gardening',
      '园艺',
      'Things that grow',
      'Houseplants=室内植物|Vegetable gardening=蔬菜种植|Flowers=花卉|Bonsai=盆景|Urban gardening=城市园艺',
    ],
    [
      'diy-crafts',
      '手工制作',
      'Made by hand',
      'Woodworking=木工|Ceramics=陶艺|Knitting=编织|Sewing=缝纫|Home renovation=房屋改造',
    ],
  ]),
  category('animals', '宠物与动物', 'Pets & animals', 26, 'Life with a little more company.', [
    [
      'companion-animals',
      '陪伴动物',
      'Our companions',
      'Dogs=狗|Cats=猫|Birds as pets=宠物鸟|Small pets=小宠物|Aquariums=水族',
    ],
    [
      'animal-care',
      '动物照护',
      'Care & connection',
      'Pet training=宠物训练|Animal behavior=动物行为|Pet enrichment=宠物丰容|Animal rescue=动物救助|Veterinary science=兽医学',
    ],
    [
      'animal-world',
      '动物世界',
      'Beyond the backyard',
      'Horses=马|Farm animals=农场动物|Reptiles=爬行动物|Insects=昆虫|Animal welfare=动物福利',
    ],
  ]),
  category('business', '商业与创业', 'Business', 225, 'From a small idea to something real.', [
    [
      'entrepreneurship',
      '创业',
      'Build something',
      'Startups=初创企业|Small business=小企业|Product strategy=产品策略|Bootstrapping=自力创业|Social enterprise=社会企业',
    ],
    [
      'business-practice',
      '商业实践',
      'How business works',
      'Marketing=市场营销|Leadership=领导力|Operations=运营|E-commerce=电子商务|Brand strategy=品牌策略',
    ],
    [
      'work-careers',
      '职业发展',
      'Work & careers',
      'Career growth=职业成长|Freelancing=自由职业|Remote work=远程工作|Workplace culture=职场文化|Job searching=求职',
    ],
  ]),
  category('finance', '财经', 'Money & economics', 152, 'Understand the numbers around you.', [
    [
      'personal-finance',
      '个人财务',
      'Everyday money',
      'Budgeting=预算管理|Saving=储蓄|Financial literacy=财务知识|Retirement planning=退休规划|Consumer finance=消费金融',
    ],
    [
      'markets',
      '金融市场',
      'Markets & investing',
      'Stocks=股票|Bonds=债券|Index funds=指数基金|Real estate=房地产|Fintech=金融科技',
    ],
    [
      'economics',
      '经济学',
      'The bigger picture',
      'Macroeconomics=宏观经济|Behavioral economics=行为经济学|Economic history=经济史|Global trade=全球贸易|Development economics=发展经济学',
    ],
  ]),
  category('learning', '教育与学习', 'Learning', 48, 'There is always a next question.', [
    [
      'education',
      '教育',
      'Ways to learn',
      'Learning science=学习科学|Teaching=教学|Higher education=高等教育|Online learning=在线学习|Study skills=学习方法',
    ],
    [
      'languages',
      '语言',
      'Say it another way',
      'Language learning=语言学习|Linguistics=语言学|Translation=翻译|Sign languages=手语|Language exchange=语言交换',
    ],
    [
      'practical-skills',
      '实用技能',
      'Skills for life',
      'Public speaking=公众演讲|Critical thinking=批判性思维|Time management=时间管理|Memory techniques=记忆方法|Digital literacy=数字素养',
    ],
  ]),
  category('history-culture', '历史与文化', 'History & culture', 18, 'See how we got here.', [
    [
      'history',
      '历史',
      'Across time',
      'Ancient history=古代史|Modern history=近现代史|Archaeology=考古学|Local history=地方史|World history=世界史',
    ],
    [
      'cultures',
      '文化',
      'Ways of living',
      'Anthropology=人类学|Cultural heritage=文化遗产|Folklore=民间传说|Festivals and traditions=节日传统|Museums=博物馆',
    ],
    [
      'philosophy',
      '哲学与信仰',
      'Ideas & beliefs',
      'Philosophy=哲学|Ethics=伦理学|World religions=世界宗教|Spirituality=精神生活|Mythology=神话',
    ],
  ]),
  category('society', '社会与时事', 'Society & news', 202, 'Stay connected to the wider world.', [
    [
      'current-affairs',
      '时事',
      'Current affairs',
      'World news=国际新闻|Local news=本地新闻|Politics=政治|Geopolitics=地缘政治|Journalism=新闻传播',
    ],
    [
      'civic-life',
      '公共生活',
      'Life together',
      'Public policy=公共政策|Urban planning=城市规划|Law=法律|Human rights=人权|Civic engagement=公民参与',
    ],
    [
      'social-change',
      '社会变迁',
      'People & change',
      'Sociology=社会学|Community organizing=社区组织|Volunteering=志愿服务|Social movements=社会运动|Media literacy=媒介素养',
    ],
  ]),
  category('relationships', '关系与家庭', 'People & family', 352, 'The connections that matter.', [
    [
      'relationships',
      '人际关系',
      'Relationships',
      'Friendship=友谊|Dating=约会|Communication=沟通|Partnerships=伴侣关系|Social connection=社会连接',
    ],
    [
      'family-life',
      '家庭生活',
      'Family life',
      'Parenting=育儿|Child development=儿童发展|Family activities=家庭活动|Intergenerational living=代际共居|Work-life balance=工作生活平衡',
    ],
    [
      'personal-growth',
      '个人成长',
      'Knowing yourself',
      'Psychology=心理学|Mindfulness=正念|Habit building=习惯养成|Self-reflection=自我反思|Life transitions=人生转折',
    ],
  ]),
  category('transport', '汽车与出行', 'On the move', 218, 'For the joy of the journey.', [
    [
      'vehicles',
      '交通工具',
      'Wheels & wings',
      'Cars=汽车|Motorcycles=摩托车|Electric vehicles=电动汽车|Aviation=航空|Trains=火车',
    ],
    [
      'vehicle-culture',
      '交通文化',
      'Enthusiast culture',
      'Classic cars=经典车|Car design=汽车设计|Vehicle restoration=车辆修复|Motorcycle touring=摩托旅行|Transport history=交通史',
    ],
    [
      'mobility',
      '出行方式',
      'Getting around',
      'Public transit=公共交通|Urban cycling=城市骑行|Walkable cities=步行城市|Transport technology=交通科技|Boating=船舶航行',
    ],
  ]),
];

// Existing consumers keep using this flat, backwards-compatible catalog.
export const domains = [
  ...technologyDomains,
  ...interestCategories.filter((item) => item.id !== 'technology').flatMap((item) => item.domains),
];

export const defaultPreferences: Preferences = {
  domains: ['ai-infrastructure', 'developer-tools'],
  tags: ['local-inference', 'agents', 'rag', 'cli'],
  customTags: [],
  relatedDomains: ['backend-systems', 'open-source'],
  exploration: 20,
  onlySelectedTags: false,
  requireAllSelectedTags: false,
  excludeUnselectedTags: false,
  targetJevAverage: 8,
  shortsNearbyTopics: true,
  shortsDurationFilterEnabled: true,
  shortsMaxDurationSeconds: 120,
  behaviorWeights: { ...defaultBehaviorWeights },
  strategyMode: 'simple',
  readingLanguage: 'bilingual',
  blockedSources: [],
  blockedTags: [],
  version: 1,
};

export const contents: Content[] = [
  {
    id: 'fg-001',
    title: '把大模型留在你的电脑里',
    titleEn: 'A small model. A whole lot of possibility.',
    creator: 'Kernel Lab',
    source: 'YouTube',
    domain: 'ai-infrastructure',
    tags: ['local-inference', 'quantization'],
    duration: 18,
    ageHours: 3,
    format: 'demo',
    depth: 'intermediate',
    language: 'en',
    accent: '#b5c7ad',
    art: 'terminal',
    coverLabel: 'LOCAL / FIRST',
    summary: '演示素材：在本地运行一个量化模型，观察内存占用与首字延迟，并比较两种推理配置。',
    summaryEn:
      'Demo fixture: run a quantized model locally, inspect memory and first-token latency, and compare two inference configurations.',
  },
  {
    id: 'fg-002',
    title: '智能体也需要一条清晰的边界',
    titleEn: 'Your agent needs boundaries, too.',
    creator: 'Small Systems',
    source: 'YouTube',
    domain: 'ai-infrastructure',
    tags: ['agents', 'evaluation'],
    duration: 24,
    ageHours: 7,
    format: 'tutorial',
    depth: 'advanced',
    language: 'en',
    accent: '#d7cbb5',
    art: 'network',
    coverLabel: 'AGENTS, WITH LIMITS',
    summary: '演示素材：用权限、预算和停止条件约束工具调用，沿一次失败的执行轨迹排查问题。',
    summaryEn:
      'Demo fixture: constrain tool calls with permissions, budgets, and stop conditions, then inspect a failed execution trace.',
  },
  {
    id: 'fg-003',
    title: 'RAG 的难点，往往在检索之前',
    titleEn: 'Better retrieval starts before the search.',
    creator: 'Index Notes',
    source: 'RSS',
    domain: 'ai-infrastructure',
    tags: ['rag', 'evaluation'],
    duration: 9,
    ageHours: 12,
    format: 'tutorial',
    depth: 'intermediate',
    language: 'en',
    accent: '#bbcbd0',
    art: 'layers',
    coverLabel: 'RETRIEVE / RETHINK',
    summary: '演示素材：比较切块边界、元数据和去重策略，解释为什么相似度高并不等于回答有依据。',
    summaryEn:
      'Demo fixture: compare chunk boundaries, metadata, and deduplication to see why similarity alone cannot ground an answer.',
  },
  {
    id: 'fg-004',
    title: '一个终端，刚好够用的开发环境',
    titleEn: 'A terminal that gets out of your way.',
    creator: 'Prompt & Pipe',
    source: 'YouTube',
    domain: 'developer-tools',
    tags: ['cli', 'dev-environments'],
    duration: 14,
    ageHours: 5,
    format: 'demo',
    depth: 'intermediate',
    language: 'en',
    accent: '#c6ba9f',
    art: 'terminal',
    coverLabel: 'LESS, BUT BETTER',
    summary: '演示素材：组合模糊搜索、目录跳转和命令历史，在一个可读的配置文件里完成日常工作流。',
    summaryEn:
      'Demo fixture: combine fuzzy search, directory navigation, and command history in one readable workflow configuration.',
  },
  {
    id: 'fg-005',
    title: '我给代码库做了一个小型搜索引擎',
    titleEn: 'Build a tiny search engine for your codebase.',
    creator: 'Build Journal',
    source: 'Bluesky',
    domain: 'developer-tools',
    tags: ['code-search', 'cli'],
    duration: 6,
    ageHours: 2,
    format: 'demo',
    depth: 'intermediate',
    language: 'en',
    accent: '#c7b8cc',
    art: 'code',
    coverLabel: 'FIND THE THREAD',
    summary: '演示素材：从快速文本搜索起步，加入符号索引，并展示两者各自擅长的问题。',
    summaryEn:
      'Demo fixture: start with fast text search, add a symbol index, and inspect where each approach is most useful.',
  },
  {
    id: 'fg-006',
    title: '数据库事务，是一份什么样的承诺？',
    titleEn: 'What does a transaction actually promise?',
    creator: 'Stateful',
    source: 'YouTube',
    domain: 'backend-systems',
    tags: ['databases', 'distributed-systems'],
    duration: 22,
    ageHours: 19,
    format: 'tutorial',
    depth: 'advanced',
    language: 'en',
    accent: '#c3c9b0',
    art: 'network',
    coverLabel: 'STATE / OF THINGS',
    summary: '演示素材：用两个并发客户端重现隔离级别差异，讨论重试与幂等的边界。',
    summaryEn:
      'Demo fixture: reproduce isolation-level differences with two concurrent clients and inspect retry and idempotency boundaries.',
  },
  {
    id: 'fg-007',
    title: '本地笔记也能好好同步',
    titleEn: 'Local notes. Thoughtful sync.',
    creator: 'Open Practice',
    source: 'RSS',
    domain: 'open-source',
    tags: ['open-source', 'local-first', 'self-hosting'],
    duration: 11,
    ageHours: 21,
    format: 'demo',
    depth: 'intermediate',
    language: 'en',
    accent: '#d5c4b8',
    art: 'layers',
    coverLabel: 'YOUR DATA, NEARBY',
    summary: '演示素材：检查离线编辑、冲突合并和数据导出，展示一个本地优先笔记应用的设计取舍。',
    summaryEn:
      'Demo fixture: explore offline editing, conflict resolution, and export in a local-first notes application.',
  },
  {
    id: 'fg-008',
    title: '从慢请求里，找到真正的瓶颈',
    titleEn: 'Follow the trace, find the bottleneck.',
    creator: 'Trace Garden',
    source: 'RSS',
    domain: 'backend-systems',
    tags: ['observability', 'api-design'],
    duration: 8,
    ageHours: 9,
    format: 'tutorial',
    depth: 'intermediate',
    language: 'en',
    accent: '#adbfc4',
    art: 'waves',
    coverLabel: 'FOLLOW THE TRACE',
    summary: '演示素材：把一条慢请求拆成多个 span，区分排队时间、数据库等待和真正的 CPU 工作。',
    summaryEn:
      'Demo fixture: split a slow request into spans to distinguish queues, database waits, and actual CPU work.',
  },
  {
    id: 'fg-009',
    title: '别急着增加上下文窗口',
    titleEn: 'Before you add more context.',
    creator: 'Kernel Lab',
    source: 'Bluesky',
    domain: 'ai-infrastructure',
    tags: ['local-inference', 'rag'],
    duration: 5,
    ageHours: 15,
    format: 'discussion',
    depth: 'advanced',
    language: 'en',
    accent: '#c7c9aa',
    art: 'abstract',
    coverLabel: 'CONTEXT ≠ CLARITY',
    summary: '演示素材：对比长上下文与小规模检索方案，并记录噪声、延迟和引用覆盖的差异。',
    summaryEn:
      'Demo fixture: compare long context with targeted retrieval and inspect noise, latency, and citation coverage.',
  },
  {
    id: 'fg-010',
    title: '让推理服务优雅地排队',
    titleEn: 'A better queue for model inference.',
    creator: 'Kernel Lab',
    source: 'YouTube',
    domain: 'ai-infrastructure',
    tags: ['model-serving', 'local-inference'],
    duration: 27,
    ageHours: 29,
    format: 'tutorial',
    depth: 'advanced',
    language: 'en',
    accent: '#b6c5d0',
    art: 'network',
    coverLabel: 'ONE TOKEN AT A TIME',
    summary: '演示素材：观察动态批处理、背压和取消请求如何影响多用户推理服务的响应。',
    summaryEn:
      'Demo fixture: inspect how dynamic batching, backpressure, and cancellation shape an inference service.',
  },
  {
    id: 'fg-011',
    title: '给智能体写测试，从一个失败案例开始',
    titleEn: 'One failure is the beginning of an eval.',
    creator: 'Eval Notebook',
    source: 'RSS',
    domain: 'ai-infrastructure',
    tags: ['agents', 'evaluation'],
    duration: 10,
    ageHours: 6,
    format: 'tutorial',
    depth: 'advanced',
    language: 'en',
    accent: '#d4c4a8',
    art: 'code',
    coverLabel: 'MAKE FAILURE USEFUL',
    summary: '演示素材：将一个真实感的工具调用故障转成固定测试，记录成功标准和已知盲区。',
    summaryEn:
      'Demo fixture: turn a realistic tool-call failure into a repeatable test with explicit success criteria and known blind spots.',
  },
  {
    id: 'fg-012',
    title: '可以随时丢掉的开发环境',
    titleEn: 'A development environment you can throw away.',
    creator: 'Clean Slate',
    source: 'YouTube',
    domain: 'developer-tools',
    tags: ['dev-environments', 'git'],
    duration: 16,
    ageHours: 32,
    format: 'demo',
    depth: 'intermediate',
    language: 'en',
    accent: '#c1c7b7',
    art: 'layers',
    coverLabel: 'START CLEAN',
    summary: '演示素材：为每个分支建立可重建的环境，演练从零启动与清理，减少状态残留。',
    summaryEn:
      'Demo fixture: create reproducible environments per branch and rehearse clean setup and teardown.',
  },
  {
    id: 'fg-013',
    title: '测试应该保护行为，而不只是覆盖代码',
    titleEn: 'Tests that protect the way things work.',
    creator: 'Practical Types',
    source: 'Bluesky',
    domain: 'developer-tools',
    tags: ['testing', 'cli'],
    duration: 7,
    ageHours: 10,
    format: 'discussion',
    depth: 'intermediate',
    language: 'en',
    accent: '#c9becb',
    art: 'code',
    coverLabel: 'BEHAVIOR, VERIFIED',
    summary: '演示素材：从一个命令行应用的输入输出契约出发，挑选能发现回归的关键测试。',
    summaryEn:
      'Demo fixture: use a CLI input/output contract to select the tests that actually catch regressions.',
  },
  {
    id: 'fg-014',
    title: '一条消息，为什么被处理了两次？',
    titleEn: 'Why did that message run twice?',
    creator: 'Queue Theory',
    source: 'Bluesky',
    domain: 'backend-systems',
    tags: ['event-streaming', 'distributed-systems'],
    duration: 8,
    ageHours: 14,
    format: 'discussion',
    depth: 'advanced',
    language: 'en',
    accent: '#c0c9ca',
    art: 'waves',
    coverLabel: 'AT LEAST ONCE',
    summary: '演示素材：重放一次投递失败，观察消息确认、去重键和业务状态之间的关系。',
    summaryEn:
      'Demo fixture: replay a failed delivery and inspect acknowledgements, deduplication keys, and business state.',
  },
  {
    id: 'fg-015',
    title: '在自己的服务器上，种一个阅读花园',
    titleEn: 'A reading garden on your own server.',
    creator: 'Quiet Software',
    source: 'YouTube',
    domain: 'open-source',
    tags: ['self-hosting', 'privacy', 'open-source'],
    duration: 13,
    ageHours: 17,
    format: 'demo',
    depth: 'intermediate',
    language: 'en',
    accent: '#d1cbb6',
    art: 'abstract',
    coverLabel: 'A QUIETER INTERNET',
    summary: '演示素材：搭建一个轻量阅读器，检查订阅导入、备份与恢复，不依赖平台个性化推荐。',
    summaryEn:
      'Demo fixture: build a lightweight reader and inspect subscription import, backup, and recovery.',
  },
  {
    id: 'fg-016',
    title: '浏览器里的计算，也可以很快',
    titleEn: 'A little more compute, right in your browser.',
    creator: 'Pixel Field',
    source: 'YouTube',
    domain: 'web-interaction',
    tags: ['webgpu', 'web-performance'],
    duration: 19,
    ageHours: 24,
    format: 'demo',
    depth: 'advanced',
    language: 'en',
    accent: '#bac5d4',
    art: 'waves',
    coverLabel: 'COMPUTE / IN COLOR',
    summary: '演示素材：将一个粒子模拟迁移到 WebGPU，对比主线程占用并保留不支持设备的回退。',
    summaryEn:
      'Demo fixture: move a particle simulation to WebGPU, compare main-thread load, and retain a fallback.',
  },
  {
    id: 'fg-017',
    title: '给键盘用户留一条清楚的路',
    titleEn: 'A clear path for every keyboard.',
    creator: 'Interface Notes',
    source: 'RSS',
    domain: 'web-interaction',
    tags: ['accessibility', 'design-systems'],
    duration: 9,
    ageHours: 36,
    format: 'tutorial',
    depth: 'intermediate',
    language: 'en',
    accent: '#d4c3b8',
    art: 'layers',
    coverLabel: 'FOCUS, INTENTIONALLY',
    summary: '演示素材：检查弹窗焦点、键盘导航和可见状态，用完整任务流程验证组件可访问性。',
    summaryEn:
      'Demo fixture: inspect dialog focus, keyboard navigation, and visible state across an entire user flow.',
  },
  {
    id: 'fg-018',
    title: '让视觉模型走出云端',
    titleEn: 'Computer vision, closer to the world.',
    creator: 'Edge Workshop',
    source: 'YouTube',
    domain: 'robotics-edge',
    tags: ['edge-ai', 'computer-vision', 'embedded'],
    duration: 21,
    ageHours: 28,
    format: 'demo',
    depth: 'advanced',
    language: 'en',
    accent: '#bbcabd',
    art: 'network',
    coverLabel: 'AT THE EDGE',
    summary: '演示素材：在小型设备上运行视觉推理，测量端到端延迟，并记录断网时的行为。',
    summaryEn:
      'Demo fixture: run vision inference on a small device, measure end-to-end latency, and inspect offline behavior.',
  },
];

export type RankedContent = Content & {
  /** Internal deterministic ranking score, not a probability or measured outcome. */
  score: number;
  reasons: string[];
  reasonsEn: string[];
  exploratory: boolean;
};

export type FeedOptions = {
  source?: Source | 'all';
  query?: string;
  savedOnly?: boolean;
  savedIds?: string[];
  hiddenIds?: string[];
  limit?: number;
};

const domainMap = new Map(domains.map((domain) => [domain.id, domain]));
const tagMap = new Map(
  domains.flatMap((domain) => domain.tags.map((tag) => [tag.id, tag] as const)),
);

/** Conservative public-metadata filtering; unlabelled relevance is not inferred. */
export function matchesHarvestPreferences(
  item: { tags: string[]; source: string; author: string },
  preferences: Preferences,
): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .toLowerCase()
      .trim()
      .replace(/[-_\s]+/g, ' ');
  const itemTags = new Set(item.tags.map(normalize));
  // Public crawlers label this topic "Agent"; the preference catalog uses "Agents".
  const sourceAliases: Record<string, string[]> = {
    agents: ['Agent'],
    'ai-infrastructure': ['AI'],
  };
  const matchesTag = (id: string) => {
    const tag = tagMap.get(id);
    return [id, tag?.label, tag?.labelEn, ...(sourceAliases[id] ?? [])].some(
      (label) => label && itemTags.has(normalize(label)),
    );
  };
  if (
    preferences.blockedSources.includes(item.source) ||
    preferences.blockedSources.includes(item.author) ||
    preferences.blockedTags.some(matchesTag)
  )
    return false;
  const selectedMatches = preferences.tags.map(matchesTag);
  const customMatches = preferences.customTags.map((tag) =>
    [tag.label, tag.labelEn, tag.labelZh].some((label) => itemTags.has(normalize(label))),
  );
  const useDomains = selectedMatches.length === 0 && customMatches.length === 0;
  const domainMatches = useDomains
    ? preferences.domains.map((id) => {
        const domain = domainMap.get(id);
        return Boolean(
          domain &&
          ([id, domain.label, domain.labelEn].some((label) => itemTags.has(normalize(label))) ||
            domain.tags.some((tag) => matchesTag(tag.id))),
        );
      })
    : [];
  const hasSelected = [...selectedMatches, ...customMatches, ...domainMatches].some(Boolean);
  if (preferences.onlySelectedTags && !hasSelected) return false;
  if (
    preferences.requireAllSelectedTags &&
    ((!selectedMatches.length && !customMatches.length && !domainMatches.length) ||
      selectedMatches.some((matched) => !matched) ||
      customMatches.some((matched) => !matched) ||
      domainMatches.some((matched) => !matched))
  )
    return false;
  if (
    preferences.excludeUnselectedTags &&
    [...tagMap.keys()].some(
      (id) =>
        !preferences.tags.includes(id) &&
        !(
          useDomains &&
          preferences.domains.some((domainId) =>
            domainMap.get(domainId)?.tags.some((tag) => tag.id === id),
          )
        ) &&
        matchesTag(id),
    )
  )
    return false;
  return true;
}

export function rankFeed(preferences: Preferences, options: FeedOptions = {}): RankedContent[] {
  const selectedDomains = new Set(preferences.domains);
  const selectedTags = new Set(preferences.tags);
  const related = new Set(preferences.relatedDomains);
  const blockedSources = new Set(preferences.blockedSources);
  const blockedTags = new Set(preferences.blockedTags);
  const hidden = new Set(options.hiddenIds ?? []);
  const saved = new Set(options.savedIds ?? []);
  const query = (options.query ?? '').trim().toLocaleLowerCase();
  const exploration = Number.isFinite(preferences.exploration)
    ? Math.min(100, Math.max(0, preferences.exploration)) / 100
    : 0;
  const limit = Math.max(0, Math.min(100, Math.floor(options.limit ?? 20)));
  if (!limit || (!options.savedOnly && !selectedDomains.size && !selectedTags.size)) return [];

  const candidates: RankedContent[] = [];
  for (const content of contents) {
    // Hard exclusions are checked before recall or scoring, including for saved items.
    if (
      blockedSources.has(content.source) ||
      blockedSources.has(content.creator) ||
      content.tags.some((tag) => blockedTags.has(tag)) ||
      hidden.has(content.id)
    )
      continue;
    if (options.source && options.source !== 'all' && content.source !== options.source) continue;
    if (options.savedOnly && !saved.has(content.id)) continue;
    const matchedTags = content.tags.filter((tag) => selectedTags.has(tag));
    if (preferences.onlySelectedTags && !options.savedOnly && !matchedTags.length) continue;
    if (
      !options.savedOnly &&
      preferences.requireAllSelectedTags &&
      (!selectedTags.size || [...selectedTags].some((tag) => !content.tags.includes(tag)))
    )
      continue;
    if (
      !options.savedOnly &&
      preferences.excludeUnselectedTags &&
      content.tags.some((tag) => !selectedTags.has(tag))
    )
      continue;
    const core = selectedDomains.has(content.domain) || matchedTags.length > 0;
    const exploratory = !core && !options.savedOnly;
    if (exploratory && (exploration === 0 || !related.has(content.domain))) continue;
    const domain = domainMap.get(content.domain)!;
    if (query) {
      const search = [
        content.title,
        content.titleEn,
        content.creator,
        content.source,
        content.summary,
        content.summaryEn,
        domain.label,
        domain.labelEn,
        ...content.tags.flatMap((id) => [
          id,
          tagMap.get(id)?.label ?? '',
          tagMap.get(id)?.labelEn ?? '',
        ]),
      ]
        .join(' ')
        .toLocaleLowerCase();
      if (!search.includes(query)) continue;
    }
    const reasons: string[] = [];
    const reasonsEn: string[] = [];
    if (options.savedOnly) {
      reasons.push('你收藏的内容');
      reasonsEn.push('Saved by you');
    }
    if (selectedDomains.has(content.domain)) {
      reasons.push(`你选择了「${domain.label}」`);
      reasonsEn.push(`You selected ${domain.labelEn}`);
    }
    for (const tagId of matchedTags) {
      const tag = tagMap.get(tagId)!;
      reasons.push(`匹配你的标签「${tag.label}」`);
      reasonsEn.push(`Matches your ${tag.labelEn} interest`);
    }
    if (exploratory) {
      reasons.push(`在你允许探索的「${domain.label}」范围内`);
      reasonsEn.push(`Within your allowed ${domain.labelEn} exploration`);
    }
    // Every feature below comes from fixture metadata or explicit selections.
    // There is no invented semantic model, learned preference, or click history.
    const domainMatch = core ? 1 : 0.45;
    const tagMatch = matchedTags.length / Math.max(1, content.tags.length);
    const formatMatch = content.format === 'demo' || content.format === 'tutorial' ? 1 : 0.5;
    const freshness = Math.pow(0.5, content.ageHours / 168);
    const score =
      Math.round(
        (0.4 * domainMatch + 0.35 * tagMatch + 0.15 * formatMatch + 0.1 * freshness) * 1000,
      ) / 10;
    candidates.push({ ...content, score, reasons, reasonsEn, exploratory });
  }

  const compare = (a: RankedContent, b: RankedContent) =>
    b.score - a.score || a.id.localeCompare(b.id);
  // A reading list is a collection, not a new recommendation batch. Keep saved
  // items discoverable after interest changes; hard exclusions above still win.
  if (options.savedOnly) return candidates.sort(compare).slice(0, limit);
  const coreCandidates = candidates.filter((item) => !item.exploratory).sort(compare);
  const explorationCandidates = candidates.filter((item) => item.exploratory).sort(compare);
  const result: RankedContent[] = [];
  const authorCounts = new Map<string, number>();
  const taken = new Set<string>();
  const take = (pool: RankedContent[], count: number) => {
    let added = 0;
    for (const item of pool) {
      if (added >= count || result.length >= limit) break;
      if (taken.has(item.id) || (authorCounts.get(item.creator) ?? 0) >= 2) continue;
      result.push(item);
      taken.add(item.id);
      authorCounts.set(item.creator, (authorCounts.get(item.creator) ?? 0) + 1);
      added++;
    }
  };
  const reservedExploration = Math.floor(limit * exploration);
  take(coreCandidates, limit - reservedExploration);
  // Keep exploration at or below the chosen share even when core supply is low.
  const allowedExploration =
    exploration === 1
      ? limit
      : Math.min(
          reservedExploration,
          Math.floor((result.length * exploration) / (1 - exploration)),
        );
  take(explorationCandidates, allowedExploration);
  take(coreCandidates, limit - result.length);
  return result.sort(compare);
}

export function formatDuration(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return safe < 60
    ? `${safe} min`
    : `${Math.floor(safe / 60)}h${safe % 60 ? ` ${safe % 60}m` : ''}`;
}
