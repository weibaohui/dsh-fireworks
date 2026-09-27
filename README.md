# @weibaohui/dsh-fireworks

[![DSH plugin](https://img.shields.io/badge/dsh-plugin-green)](https://github.com/topics/dsh-plugin)
[![npm version](https://img.shields.io/npm/v/@weibaohui/dsh-fireworks)](https://www.npmjs.com/package/@weibaohui/dsh-fireworks)

**烟花庆祝引擎**：agent 编程时，在对话窗口上空放烟花庆祝——开场迎宾、回合礼花、工具星花、里程碑大礼、收工终场、失败哑炮；每类事件一组属性卡、卡内多变种随机抽放，token 用量决定烟花的大小、爆炸高度与艳丽绚烂程度。

## 效果演示

![demo：开场迎宾 → 回合礼花 → 工具三连 → 里程碑 → 终场齐射（16s 循环）](https://cdn.jsdelivr.net/gh/weibaohui/dsh-fireworks@main/docs/demo.gif)

| | | |
|---|---|---|
| ![双子星迎宾](https://cdn.jsdelivr.net/gh/weibaohui/dsh-fireworks@main/docs/shots/welcome-rainbow.jpg) | ![多弹齐放](https://cdn.jsdelivr.net/gh/weibaohui/dsh-fireworks@main/docs/shots/multi-shells.jpg) | ![绯蕊](https://cdn.jsdelivr.net/gh/weibaohui/dsh-fireworks@main/docs/shots/crimson-pistil.jpg) |
| *开场迎宾：双子星七彩星芒* | *回合与工具星花同场齐放* | *绯蕊：粉红外瓣包白炽蕊心* |
| ![一发多色](https://cdn.jsdelivr.net/gh/weibaohui/dsh-fireworks@main/docs/shots/milestone-bands.jpg) | ![蓝柳与珍珠](https://cdn.jsdelivr.net/gh/weibaohui/dsh-fireworks@main/docs/shots/willow-pearl.jpg) | ![金色终场](https://cdn.jsdelivr.net/gh/weibaohui/dsh-fireworks@main/docs/shots/golden-finale.jpg) |
| *里程碑：一发多色 bands 混色弹* | *蓝柳垂丝与珍珠环拖尾* | *收工终场：金色瀑布齐射* |

## 核心功能

- **六类事件六组烟花**：`session/created` 开场迎宾、`turn/end` 回合礼花、工具成功星花（1.4s 合批连放）、累计 token 里程碑大礼（2k/8k/20k/50k/120k/300k 六档）、todo 全完成收工终场（多弹齐射）、工具失败哑炮（克制的幽默安慰）
- **token 越多越盛大**：每回合 `outputTokens + 0.2×inputTokens` 经 log₂ 曲线映射为 magnitude（0..1），星数、爆速、爆炸高度、亮度、饱和度全部由它插值——几百 token 一朵小礼花，几万 token 漫天大礼
- **属性卡 × 多变种 × 洗牌袋**：30 张详尽参数卡（20 种花型：牡丹/菊/柳/冠毛/频闪/十字裂/蕊心/心形/五角星/土星/旋花/锦冠/瀑布/礼炮/彗星/哑炮……）；同类事件连发 N 次时从卡组**不放回**抽 N 个不同变种；稀有度 1–5 决定入袋概率（传说卡约 44% 的袋才出现）；同 seed 事件多端播放同一组变种
- **一发多色（概率配比）**：`color.bands` 按概率把星群分成若干色组（如金 65% / 绯红 35%，自动归一化），`mixChance` 门控本弹是否混色——一发多色才是真烟花
- **GPGPU 渲染**：WebGL2 三桶累积缓冲渲染器——拖尾由纹理指数衰减「攒」出来（长曝光质感），全部粒子一次 draw call；大画布累积纹理半分辨率（填充省 3/4）、空桶跳过衰减、8bit 量化防残影（衰减亚像素步进保证归零，暗色主题无轮廓残影）、拖尾自然淡出收尾；实测 6400+ 粒子极端齐射锁 60fps、无上限吞吐 ~600fps（M1）；WebGL2 不可用自动回退 Canvas2D
- **透明浮层零侵入**：`position:fixed; pointer-events:none` 画布盖在对话上空，不挡任何点击；放完即收，界面无残留
- **浅色主题自适应**：采样页面底色亮度，白底下自动切换墨色渲染（深饱和墨线、关白炽芯、弱爆闪），对话文字始终可读；深浅切换实时跟随
- **显示范围可选**：全屏 / 左部侧边栏 / 右部侧边栏 / 左下角 / 右下角（默认）——角落小窗像小组件式庆祝，不挡对话内容
- **开箱即管**：设置页总开关、全局强度滑杆、六类独立开关、每类试放按钮、引擎实时状态（粒子数/画质/渲染器/连接状态）
- **性能自律**：粒子硬上限、帧时滑动平均自动降质、页面隐藏暂停、`prefers-reduced-motion` 自动停放（设置页可单独强制忽略）、宿主侧令牌桶限流（10 枚/5s）防子 agent 风暴刷屏

## 安装

```bash
dsh plugin --profile web add @weibaohui/dsh-fireworks -w
```

装完重启 `dsh web` 即生效。入口：**设置 → 烟花庆祝**（管理面板 + 试放按钮）。

## 使用

1. 正常编程即可，烟花自己放：新会话迎宾 → 每轮回复按 token 放礼花 → 工具成功连发小星花 → 累计 token 跨档放里程碑 → todo 清完终场齐射
2. 嫌吵：设置页关掉单类（如哑炮）、调低全局强度（低配机器建议 0.6）、或把显示范围收成角落小窗
3. 想试放：每类旁边的「试放」按钮随手来一发；「全部试放」看全场
4. 控制台彩蛋：`__dshFireworks.fire('finale', 0.9)`
5. 不装插件也能预览引擎：浏览器打开 `demo/demo.html`（`?shot=1` 连放 / `?demo=1` 编排录播模式）

## 事件 → 烟花类别

| 类别 | 触发 | 变种 |
|---|---|---|
| session 开场迎宾 | 新会话（顶层线程） | 银茧迎宾 / 青门初开 / 紫雾晨星 / 春柳拂晓 / 双子星 |
| turn 回合礼花 | 每轮回复完成，规模随 token | 金牡丹 / 七彩菊 / 翡翠频闪 / 绯蕊 / 蓝柳 / 琥珀十字 |
| tool 工具星花 | 工具调用成功（合批连放） | 薄荷脆响 / 天彗 / 珍珠落 / 青柠气泡 / 玫瑰针 |
| milestone 里程碑 | 累计 output 跨 2k/8k/20k/50k/120k/300k | 大锦冠 / 烈焰之心 / 铸星 / 土星冠 / 雷鸣礼炮 |
| finale 收工终场 | todo 全部完成（多弹齐射） | 寰宇终章 / 黄金时代 / 极光之舞 / 龙戏珠 / 千星落幕 |
| fail 哑炮 | 工具失败（克制安慰） | 哑炮 / 冷雨 / 落灰 / 一缕烟 |

## 属性卡 schema（client/cards.js）

每张卡描述一类烟花的一个变种，参数详尽且全部为纯数据；`resolveCard(card, mag, rng)`
把区间按 magnitude 插值（scaling 指定 linear/sqrt/log 曲线）加抖动后产出引擎直接
消费的发射谱。新增变种只需往对应类别的数组加一张 `card({...})`，`npm test` 自动
校验字段完整性。

```js
{
  id: 'peony-gold', name: '金牡丹', nameEn: 'Golden Peony',
  category: 'turn',           // 事件类别
  rarity: 1,                  // 1 常见 … 5 传说；入袋概率 min(1, 2.2/rarity)
  flavor: '最经典的金色牡丹。',

  rocket: {                   // 弹体升空
    kind: 'rocket',           // rocket 尾焰升空 | mine 地面直喷 | none 空中直接出现
    apex: [0.5, 0.82],        // 爆炸高度 = 区域高度比例（mag 插值）
    speed: [640, 900],        // 升空初速 px/s
    wobble: 4,                // 上升摆动幅度
    trailRate: 90,            // 上升火星拖尾速率 颗/s
    trailColor: [42, 90, 62], // 拖尾颜色 [h,s,l]
    trailLife: [0.25, 0.5],   // 拖尾火星寿命 s
    trailGravity: 120,        // 拖尾重力 px/s²
    trailSize: [0.8, 1.6],
  },

  burst: {                    // 爆炸
    shell: 'peony',           // 20 种花型之一
    stars: [100, 230],        // 星数（mag 插值，scaling.stars 曲线）
    speed: [200, 360],        // 爆炸初速 px/s
    ringThickness: 0.14,      // ring 类环厚
    gravity: 42, drag: 0.55,  // 重力 px/s²，速度阻尼 /s
    starLife: [1.4, 2.4],     // 星体寿命 s
    starSize: [1.5, 3],       // 星体半径 px
    trail: { len: [6, 12], fade: 0.82 },  // 拖尾长度与衰减
  },

  color: {
    palette: [[45,100,62], …],// [h,s,l] 调色板（PALETTES 库 18 组）
    mode: 'random',           // uniform 单色 | random 每星随机 |
                              // rainbow 轮转 | gradient 首尾渐变 | split 分相
    bands: [                  // 一发多色：按概率配比混色（可选，优先于 mode）
      { palette: PALETTES.gold, p: 0.65 },     // 65% 的星落金色组
      { palette: PALETTES.crimson, p: 0.35 },  // 35% 落绯红组（p 自动归一化）
    ],
    mixChance: 0.65,          // 本次发射启用多色配比的概率（缺省 0.65）
    hueDrift: 0,              // 生命期内色相漂移 deg/s
    lighten: [4, 18],         // 亮度提升（mag 插值 = 艳丽度）
    saturation: [0, 0],       // 饱和度提升
    whiteCore: true,          // 初生 15% 生命白炽核心
  },

  effects: {                  // 二级效果（null 关闭）
    strobe:    { rate: 9, duty: 0.5 },        // 频闪：方波明灭
    twinkle:   { rate: 3, depth: 0.35 },      // 闪烁：正弦明暗
    crackle:   { at: 0.62, count: [2,4],      // 爆裂：生命 62% 处喷微型火星
                 speed: [40,90], life: [0.25,0.5] },
    glitter:   { rate: 6, depth: 0.5 },       // 微光：亮度快速振荡
    crossette: { at: 0.55, count: 4, angle: 90 },  // 十字分裂
    pistil:    { stars: [24,44], color: PALETTES.silver, // 蕊心：内层第二爆
                 speedRatio: 0.42, lifeRatio: 0.8 },
    flash:     { radius: [180,320], life: [0.22,0.4] },  // 爆闪（礼炮白闪）
    trailBloom: true,                          // 尾端结花（锦冠）
  },

  scaling: { stars: 'sqrt', apex: 'linear', speed: 'sqrt', vivid: 'linear' },

  volley: { count: [3,3], interval: [0.28,0.4], spread: 0.5 },  // 齐射
}
```

### 全局密度/尺寸旋钮

`cards.js` 顶部的 `TUNE = { stars: 0.5, size: 1.65, pistil: 0.6 }` 统一缩放所有卡的
星数与星体尺寸（少而精：颗颗分明、动画流畅、色彩艳丽），不改变 token 缩放曲线。

## 实现说明

```
宿主（src/index.js）                     客户端（client/）
─────────────────                       ─────────────────
session/event 事件流                     全屏/区域透明 canvas 浮层
  ↓ 分类 / 累计 token / 合批               (fixed, pointer-events:none)
celebrate {category,                      EventSource 订阅 SSE
           magnitude, count, seq}  ──→     ↓ pickVariants 洗牌袋抽变种
        SSE /dsh-fireworks/api/stream      ↓ resolveCard 落定参数
                                          GPGPU 引擎渲染
```

- **宿主**：订阅 `session/event` 做事件分类与 token 累计，庆祝事件经 SSE 广播
  （dsh-flow 同款路由与 `connection` 信任栅栏）；工具成功 1.4s 窗口合批——
  「一批 5 次工具调用」→ 客户端「从工具卡组随机抽 5 个不同变种连放」；
  配置存 storageDomain（域 `dsh_fireworks`）持久化
- **渲染**：WebGL2 三条累积纹理（短/中/长尾桶，衰减 0.84/0.905/0.95 帧率无关
  折算）+ 点精灵径向衰减（亮芯+软晕双层盖章）+ 运动补偿子步盖章（高速星体
  拖尾连续无断点）；累积纹理 DPR 封顶 1.5、长边封顶 2400；爆炸中心按预估爆半径
  自动钳制不出顶边；Canvas2D 兜底渲染器（位置历史逐段描边拖尾）
- **构建**：`client/cards.js` + `renderer-*.js` + `engine.js` 由
  `scripts/build-client.mjs` 内联进 bundle 工厂作用域，零 npm 运行时依赖

## HTTP API（宿主）

| 路由 | 说明 |
|---|---|
| `GET /dsh-fireworks/api/stream` | SSE 庆祝事件流 |
| `GET /dsh-fireworks/api/config` | 读配置 |
| `POST /dsh-fireworks/api/config` | 存配置（storageDomain 持久化） |
| `POST /dsh-fireworks/api/test` | 试放 `{ category?, magnitude? }` |

## 开发

```bash
npm run check          # 语法检查
npm test               # 13 项离线测试（卡组完整性/洗牌袋/多色配比/缩放/宿主公式）
npm run build:client   # cards + renderers + engine + index → client/bundle.js
```

link 安装的实例改完源码 `npm run build:client` 后刷新页面即生效。

## 联系我 :飞书群

![link](https://foruda.gitee.com/images/1774880015525784725/4fd67005_77493.png "link")

## 版本兼容性

本插件与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的版本对应关系：

| 插件版本 | 适配 dsh 版本 | 备注 |
|---------|--------------|------|
| 0.1.6 | 0.1.7-rc.2 | 当前版本；修复配置持久化——storageDomain 打开 spec 缺 valueSchema 导致存过一次配置后域打不开，保存只落内存、宿主重启回默认；POST 保存等域就绪防启动竞态；设置页保存失败不再假「已保存 ✓」 |
| 0.1.0 | 0.1.7-rc.2 | 已在 @deepseek-ai/dsh@0.1.7-rc.2 下验证运行 |

> **发版约定**：每次发布新版本时，请在上表追加一行，记录该插件版本实际验证所用的 `@deepseek-ai/dsh` 版本。`package.json` 的 `engines.dsh` 声明最低支持版本；本表记录实际验证版本，二者配合使用。

## License

MIT
