---
name: mc-blockbench-modeling
description: 建立、分析和迭代 Minecraft Blockbench 立方体模型；尤其适用于 Bedrock 风格 .bbmodel、骨骼层级、关节枢轴、旋转、UV 与导出预检。
whenToUse: 用户要创建或修改 Minecraft 模型、分析 .bbmodel、规划 outliner/枢轴，或为目标格式导出前做结构检查时。
---

# Blockbench 建模

## 工作流程

1. 先确认目标：Blockbench 可编辑工程、Bedrock 几何、Java 实体或其他运行时。`mc_bbmodel_create` 只创建可编辑的 `.bbmodel` 起点；不要把它说成已完成游戏导出。
2. 记录尺度、对称性、关键轮廓和可活动关节。若参考只是一张图，明确隐藏面和遮挡部分属于推断。
3. 先搭主体与主要部件，再添加有形状作用的次级细节。为需要独立旋转的部件设置有意义的组名和关节枢轴；非关节细节无需强行拆成多层组。
4. 每个面都检查 UV 与纹理引用。Box UV 适合规则盒体的快速展开；按面 UV 适合独立控制朝向、留白和局部细节。不要把零厚度面、镜像 UV 或重叠 UV 自动判为错误。
5. 运行 `mc_bbmodel_validate`，再在 Blockbench 目标版本中打开、检查视口并导出；只有能够运行目标游戏时才报告游戏内结果。
6. 每轮只改一类主要问题，比较轮廓、层级、UV 和约束，保留可追踪的输出版本。

## 研究证据

本插件的参考只来自工作区内静态检查的 7 个匿名 Bedrock `.bbmodel` 样本；结构测量见 `references/sample-derived-guidelines.md`。它们展示了多种不同做法，而不是统一模板：

- 模型规模从 5 到 356 个 cuboid，插件报告的 `maxGroupDepth` 从 1 到 36（根节点深度为 0）。复杂层级可能承载部件语义或关节，但最大深度本身不是目标。
- 旋转既出现在 cuboid 上，也出现在 group 上；有的模型只使用 group rotation，有的两者皆用。应按枢轴和编辑目的选择，不应照搬单一模式。
- 样本既有 Box UV，也有按面 UV；纹理物理 PNG 尺寸与逻辑 UV 尺寸通常一致，但一个样本为逻辑 16x16、PNG 160x160。
- 有两个样本包含零厚度轴向几何；少量样本面缺少或未绑定纹理引用。保留它们之前要判断这是有意的剪影/空面，还是待修复的数据。
- 七份静态模型都没有动画记录。group/cube rotation 是静态变换，不是动画证据。

样本较少，无法证明任何建模习惯更美观、更高效或更兼容。只把这些事实作为检查线索，并以用户目标、Blockbench 和目标运行时验证为准。

## 真机实测（Blockbench 5.2.2 Desktop，2026-10-19）

这些是操作 Blockbench 本体时踩到的、文档里查不到的事实。

1. **插件文件名必须等于 `Plugin.register()` 的 id。** 文件名不匹配时 Blockbench 弹窗拒绝加载（"Ensure that the base file name of the plugin matches the plugin ID"），插件静默不生效。
2. **Blockbench 不会自动加载 plugins 目录里的 .js。** 已用只做 `console.log` 的探针证伪：放进目录、重启、日志零输出。必须经插件管理器或 `Plugins.installed` + `BBPlugin.prototype.loadFromFile({path})` 装载。
3. **插件 require 有白名单。** `SAFE_APIS`（免权限）= path/crypto/events/zlib/timers/url/string_decoder/querystring/constants/buffer/stream/perf_hooks；`REQUESTABLE_APIS`（需用户授权）= fs/process/child_process/https/net/tls/util/os/v8/dialog/clipboard/shell。**`http` 两个表都不在**，`require("http")` 抛 "not supported"——插件里起本地服务只能用 **`net`**（裸 TCP）。
4. **权限文件只在启动时读。** 权限存在用户数据目录的 `plugin_permissions.json`（格式 `{"<plugin_id>":{"allowed":{"net":true}}}`）。运行期修改无效，且首次 `require` 会弹同步模态框；无人值守环境下模态框会**卡死渲染进程**（表现为 CDP 超时、端口 CLOSED）。启动前预置该文件即可免弹框。
5. **加载插件时可借 `Plugin.loadFromFile({path: ...})`**，它接收的是**对象**不是路径字符串，且会把实例 id 改写成文件名派生值，所以文件名要和权限表里的 id 对上。
6. **窗口被遮挡会节流渲染。** 视口显示 0 FPS 时，CDP 的 `Page.captureScreenshot` 会反复返回同一张旧帧（逐字节相同），看起来像"模型是黑的"。用 `Emulation.setFocusEmulationEnabled` 可把 FPS 拉回，但截到的帧仍可能是旧的——**判定渲染结果优先用视口现场或换一台前台窗口，不要只凭截图**。

## 与本插件的关系

`mc_bbmodel_inspect` / `mc_bbmodel_validate` 只读磁盘上的 `.bbmodel`，**不连接正在运行的 Blockbench**，也无法替代视口观察。要确认渲染、UV 接缝与材质观感，必须在目标版本 Blockbench 里打开看。

## 结构校验边界

校验结果只覆盖插件明确检查的结构问题。它不能识别视觉比例、穿插是否可接受、纹理接缝观感、动画意图、发光材质行为、许可或 Minecraft 版本兼容性。分析前先获得用户对本地文件的明确选择；不要复制、上传或把私人参考素材写入输出。

## 操作要点（Blockbench 5.2.2 实测）

1. **带贴图的立方体模型用 `bedrock` 格式**。`free` 格式下材质绑不上，渲染成默认分件色且不报错。
2. **贴图顺序**：建贴图 → 轮询等图像加载完成 → `texture.updateMaterial()` → 逐 cube `applyTexture()` → 最后写 `face.texture` 与 `face.uv` → `Canvas.updateAllUVs/updateAllFaces/updateAll`。
3. **UV 空间 = 项目分辨率**（通常 16），不是 PNG 尺寸。128px 图集时一个 16px 格只占 2 个逻辑单位。
4. **不要手动赋 `mesh.material`**，`Canvas.updateAllFaces()` 会覆盖。
5. **通道批量控制在 10-15 个 cube**；更大规模改为离线生成 `.bbmodel` 再 `Codecs.project.parse` 载入。
6. 做"好看的"模型靠多段台阶：锥度 14 段、棱面三片叠、护手四段、宝石双面、符文走贴图。

完整工艺、参数表与验收清单见 [`references/modeling-playbook.md`](../references/modeling-playbook.md)。
## 配方（可直接跑）

**R1 · 一把带贴图的剑**

1. `mc_live_doctor(op="doctor")` → 必须 `kind=ok`。
2. `mc_live_eval` → `newProject(Formats.bedrock)`。
3. `mc_live_do` → `cube.add` 每批 10-15 个（剑身分段 / 护手四段 / 柄五段 / 柄头三件）。
4. `mc_live_eval` → 建贴图（128x128，`uv_width=16`）→ 轮询等 `ctx.getImageData` 非空 → `updateMaterial()` → 逐 cube `applyTexture()` → 每面 `uv=[格*2, 0, 格*2+2, 2]`。
5. `mc_live_see(max_size=640)` 看整体，再 `max_size=1024` 看细节。
6. `mc_live_export(format="bedrock_geo", path=...)`，最后 `mc_bbmodel_validate` 离线复验。

**R2 · 贴图绑不上（渲染成默认分件色）**

按这个顺序排查，不要跳步：

1. 项目格式是不是 `bedrock` / `bedrock_block`？`free` 格式永远绑不上。
2. 图像加载完了吗？`fromDataURL` 是异步的，必须轮询到 `getImageData` 非全零。
3. `texture.updateMaterial()` 调了吗？材质可能是图像加载前建的，`map` 为空。
4. UV 是不是在 `applyTexture()` **之后**才写的？顺序反了会被重置。

**R3 · 大批量建模超时**

`mc_live_do` 单批超过约 50 个 `cube.add` 时客户端会超时（服务端其实已写入）。三条路：

1. 拆到 10-15 个一批。
2. 用 `mc_live_eval` 在 Blockbench 里直接循环建，一次往返。
3. 离线生成 `.bbmodel` 再 `Codecs.project.parse` 载入。

## 读图纪律（决定烧多少 token）

1. 先 `max_size=384` 看轮廓方向，确认后再 640/1024 看细节。
2. **同一个视角重复看图没有意义**：`mc_live_see` 会字节级去重，返回 `reused:true` 说明画面没变。
3. 一次只看一个问题（轮廓 / 贴图 / 接缝），不要一张图问五件事。
4. 换角度比放大有用：正面 + 侧面各一张，胜过正面四张。

## 数值门（没到就别交付）

1. 剑身锥度段数 ≥ 12（6 段会明显看到楼梯）。
2. 长宽比 1.8-2.0 : 1（做到 3:1 会像针）。
3. 单批 `cube.add` ≤ 15。
4. `mc_bbmodel_validate`：`errors=0` 且 `outOfBounds=0`。
5. 宝石与装饰必须**双面都有**，转到背面不能露馅。
## 解剖学数值门（剑类，实测）

用户说「不像剑」时不要凭感觉改，先量这四个比例。三个错误各踩过一次，现在都有门禁钉着。

1. **剑身长宽比** = 剑身长 / 剑身全宽 → 必须 **6-10**。1:3.8 会读成三角形巨剑。
2. **深度/宽度** = 剑身厚度 / 剑身全宽 → 必须 **0.10-0.30**。0.69 会读成棍子。
3. **锥度分布** → 前 75% 只做约 11% 的远端收细（近似等宽），**收细只允许发生在最后 30%**。全程收细就是圆锥。
4. **护手全宽** = 剑身全宽的 **2.3 倍**；柄长约剑身长的 1/4.5；整剑比例约 **4.5**。

对应惩罚（都在 `tests/blade.test.js`）：长宽比出 6-10 → 红；t<0.68 时半宽低于底部 0.84 → 红；深度/宽度出 0.10-0.30 或深度大于长度 1/12 → 红。

## 参数系统的两个陷阱（都真踩过）

1. **schema 泄漏**：`PARAMS` 里存的是 `{ type, default, min, ... }` 描述对象。`build()` 若直接 `Object.assign({}, PARAMS, input)`，`params.gems` 拿到的是对象（恒真），**所有布尔开关失效**。必须走 `resolve(PARAMS, input)` 取 `default`。
2. **预设被默认值覆盖**：先 `resolve()` 拿到默认 `length`，再 `PRESETS[params.variant]` 就永远用不上 —— 三种剑型会生成得一模一样。正确顺序是「**预设打底 → 用户参数覆盖**」。

判据：每个家族的每个布尔参数开/关、每个数値参数取 min/max，**几何签名必须变化**。`tests/toggles.test.js` 就是在跑这件事。

## 工作法：量 → 修 → 加门

用户说「怪 / 不像 / 有问题」时，固定三步：

1. **量**：从模型里读出具体数字（长宽比、厚度比、锥度位置、部件数），不要靠肉眼形容。
2. **修**：按真实参照物定目标值（剑 = 真实长剑比例；道具 = 现实尺寸），改参数与生成公式。
3. **加门**：把这条比例写成断言，红了下一次就改不坏。

这套流程跑过三轮（护手过宽 → 护手比例门；圆锥 → 长宽比门 + 收细位置门；棍子 → 深度门），每轮都留了一条门。