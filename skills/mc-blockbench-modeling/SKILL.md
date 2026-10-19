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
