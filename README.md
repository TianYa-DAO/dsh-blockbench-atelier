# Blockbench Atelier

Blockbench Atelier 是一个 DSH 插件，为 Blockbench Minecraft 建模与像素纹理工作流提供两半能力：**离线文件工具**（直接读写磁盘上的 `.bbmodel` 与 PNG，不需要 Blockbench 在运行）与**直连通道**（连到正在运行的 Blockbench，看当前画面、改当前工程）。两者装在同一个插件里。

## 能力

### 离线工具（不需要 Blockbench 运行）

1. `mc_bbmodel_inspect`：汇总几何、层级、旋转、UV 覆盖、纹理尺寸与统计信息。
2. `mc_bbmodel_validate`：检查 UUID、outliner 引用、几何范围、纹理引用、PNG 解码、逐面 UV 图集边界，并报告 `UV_SPACE`（贴图逻辑尺寸与项目分辨率不一致）与 `UV_BLANK`（面采样区域全透明）。
3. `mc_texture_analyze`：统计 PNG 的透明度、可见色、亮度、邻色对比和逻辑 UV 缩放。
4. `mc_bbmodel_create`：按 JSON cuboid 规格创建新的 `.bbmodel`，使用独占创建，不覆盖现有文件。
5. 两项 DSH 技能：`mc-blockbench-modeling` 与 `mc-pixel-textures`。
6. CLI 支持 `inspect`、`validate`、`texture`、`create` 和本地 `catalog`。

### 直连工具（Blockbench 必须开着）

1. `mc_live_see`：把当前模型渲染成 PNG 并返回文件路径，配合 `read_image` 形成看-改闭环。
2. `mc_live_do`：一次往返批量执行操作，只回摘要；`txn=rollback` 可把整批撤销，方便试完就退。
3. `mc_live_state`：读当前工程摘要、cube、group、纹理与动画。
4. `mc_live_ops`：列出通道支持的全部操作及其参数形状，动手前先查，不要猜操作名。
5. `mc_live_txn`：`undo`、`redo`、`mark`、`rollback_to`。
6. `mc_live_export`：导出 `bedrock_geo`、`bedrock_anim`、`gltf` 或 `png`。
7. `mc_live_preset`：本地 JSON 配方库，`list`、`save`、`apply`。
8. `mc_live_doctor`：`doctor`、`status`、`probe`；只有返回 `kind=ok` 才算通道真的通了。

## 直连通道：Blockbench 侧插件安装

直连需要在 Blockbench 里装配套插件 `addon/bb-bridge.js`。它把 Blockbench 变成一个本地 TCP 服务（`127.0.0.1:9878`），DSH 侧的工具通过它看画面、改模型。

1. 把 `addon/bb-bridge.js` 复制到 Blockbench 插件目录，**文件名必须保持 `bb_bridge.js`**（Blockbench 要求文件名等于 `Plugin.register()` 的 id，改名会被拒绝加载）：
   - Windows：`%APPDATA%\Blockbench\plugins\`
   - macOS：`~/Library/Application Support/Blockbench/plugins/`
   - Linux：`~/.config/Blockbench/plugins/`
2. 重启 Blockbench。它**不会**自动加载目录里新放的 `.js`。
3. 首次使用会弹权限框，选 **Always allow for this plugin** 授予 `net` 权限。Blockbench 的 `require` 有白名单，**`http` 不可用**，本地服务只能用 `net`。
4. 用 `mc_live_doctor` 的 `op=doctor` 验收，返回 `kind=ok` 即接通。

端口默认 9878，可用环境变量 `BB_RT_PORT` 覆盖。无人值守环境可在 Blockbench 用户数据目录预置 `plugin_permissions.json`：`{"bb_bridge":{"allowed":{"net":true}}}`（该文件只在启动时读取）。

协议、操作清单与实测记录见 [`references/live-channel-contract.md`](references/live-channel-contract.md)、[`references/live-channel-integration-test.md`](references/live-channel-integration-test.md)、[`references/live-channel-design-notes.md`](references/live-channel-design-notes.md)。

生成器创建的是可在 Blockbench 中继续编辑的 Bedrock 风格 `.bbmodel` 起点，不是完整游戏资源包，也不会代替目标版本的导出和游戏内检查。

## 安装

在插件目录运行：

```text
dsh plugin --profile web add .
```

将 `web` 换成要安装到的 DSH profile。启动该 profile 后，技能和工具由插件注册。

## CLI 示例

```text
node bin/bb-atelier.js inspect path/to/model.bbmodel
node bin/bb-atelier.js validate path/to/model.bbmodel
node bin/bb-atelier.js texture path/to/atlas.png --logical 16 16
node bin/bb-atelier.js create examples/creature.json C:/output/new-creature.bbmodel
node bin/bb-atelier.js catalog path/to/local-models C:/output/local-catalog.json
```

输入模型和输出模型由调用者明确指定。`catalog` 会在本机结果中包含模型文件名、模型元数据和文件 SHA-256；不要将私人样本或其目录扫描结果提交到公开仓库。工具不会上传文件或抽取并发布嵌入纹理。

## 本地开发与测试

需要 Node.js 22.19 或更新版本：

```text
npm install --omit=peer
npm test
npm run check
```

`--omit=peer` 用于本地运行与 DSH 无关的模型/纹理单元测试；加载插件时由 DSH profile 提供 Cordis 与 DSH tools peer。

## 样本研究

已逐份静态检查工作区中找到的 7 个 `.bbmodel` 及其内嵌纹理。匿名编号、测量值、纹理视觉概述和推论边界记录于 [`references/sample-derived-guidelines.md`](references/sample-derived-guidelines.md)。参考文档只保留聚合与结构事实，不包含样本文件、文件名、纹理字节或提取图片。

所有样本为 Bedrock Blockbench 格式 5.0；静态文件中没有动画记录。样本只代表这 7 份文件，不能用来推断普遍最佳实践。纹理透明像素、颜色或命名都不能单独证明发光、渲染效果、许可状态或游戏兼容性。

## 安全边界

分析器只读取用户指定的本地路径。生成器要求绝对输出路径，并以独占方式创建 `.bbmodel` 与可选 `.png`；目标已存在时拒绝覆盖。验证器是结构预检，不证明渲染质量、接缝效果、动画、游戏兼容性或许可。

## 参考文档

1. [`references/modeling-playbook.md`](references/modeling-playbook.md) —— 真机实测的建模工艺手册：管线选择、格式与贴图绑定顺序、UV 逻辑空间、多段台阶参数表、通道批量限制与验收清单。
2. [`references/live-channel-contract.md`](references/live-channel-contract.md) —— 直连通道的协议、操作清单与实测限制。
3. [`references/sample-derived-guidelines.md`](references/sample-derived-guidelines.md) —— 样本静态分析得出的结构线索。
## 效率特性（v0.4.0）

1. `mc_live_eval` —— 在 Blockbench 内跑任意 JS，**持久内核 `K`** 跨调用保留，兜住固定 op 覆盖不到的一切。
2. `mc_live_ops` —— **本地目录**回答（零往返），每条带 `op / args / use / avoid`；`live=true` 才问 Blockbench。
3. `mc_live_see` —— `max_size` 控制尺寸，**字节级去重**：与上一帧相同返回 `reused:true` 复用旧图，`force=true` 强制重写。省 token、省磁盘。
## 模型家族清单（v0.8.0）

| 家族 id | 说明 | 参数 |
| --- | --- | --- |
| `weapon-sword` | 剑：长剑 / 巨剑 / 匕首 | variant, length, width, segments, guardSpan, grip, gems, runes |
| `weapon-axe` | 战斧（单刃 / 双刃） | haftLen, headSize, bladeReach, beard, gripLen, doubleBit, topSpike, langets |
| `weapon-spear` | 长矛 / 带翼戟 | shaftLen, headLen, headWidth, gripLen, barbs, wings, tassel, buttSpike |
| `weapon-hammer` | 战锤（可带尖喙） | haftLen, headWidth, headHeight, headDepth, gripLen, crossPeen, faceSpikes, sidePlates |
| `prop-lantern` | 提灯 / 路灯 / 桌灯 | height, width, style, panels, glow, roof, ring |
| `prop-chest` | 箱 / 宝箱 | width, depth, height, bands, lid, lock, feet |
| `prop-sign` | 告示牌 / 牌坊 | height, width, arms, plaque, roof, ornaments |
| `creature-wing` | 翅膀（左右成对） | span, height, ribs, membrane, claw |
| `creature-horn` | 角 / 头饰 | height, curve, segments, bands, spikes |
| `armor-crown` | 王冠 | radius, height, points, gems, plume |

一句话就能出成品（`mc_model_wish`），也可以直接指定家族与参数（`mc_model_forge`）。

```text
「一把华丽的大剑」→ greatsword, gems+runes, 71 部件, 17×38.1
「一盏提灯」      → prop-lantern, 48 部件, 8.2×18×8.2
「一顶王冠」      → armor-crown, 47 部件, 16×13×16
「一杆长矛」      → weapon-spear, 42 部件, 4.9×38.3
```

原点约定：武器类原点在握把中部（便于手持摆位），道具/生物件最低点落在 y=0（便于直接摆在地上）。
## 侧边栏实时画面（v0.14.0）

插件带一个 DSH 侧边栏面板，显示 Blockbench 当前视口的实时画面。边聊天边看模型，不用切窗口。

### 组成

1. `lib/frame-server.js` —— HTTP 桥，监听 `127.0.0.1:9879`（环境变量 `BB_ATELIER_PANEL_PORT` 可改）。`GET /frame.png` 抓当前视口，`GET /status.json` 返回连接状态、工程名、格式、元素数、帧计数。800ms 内的重复请求复用缓存。
2. `lib/client.js` —— 浏览器半边，挂 `sidebar.panellist`（侧边栏入口）+ `main`（页面）。面板可见时每 1.5 秒自动刷新，切走停刷，另有手动刷新按钮。
3. 面板依赖 `package.json` 的 `dsh.client = { platform: "web" }` 与 `exports["./client"]` 生效。

### 验收步骤（重启 DSH 后）

```text
1. 确认 Blockbench 开着且 bb-bridge 插件已加载
2. curl http://127.0.0.1:9879/status.json
   期望: {"ok":true,... "channel":{"connected":true,"project":"...","elements":N}}
3. curl -o frame.png http://127.0.0.1:9879/frame.png
   期望: 得到一张 PNG，尺寸 480x480
4. 重启 DSH
5. 侧边栏标签列表里应出现 "Blockbench"（与 任务管理 / 浏览器 / 记忆系统 同一列），点开看到实时画面
6. 在 Blockbench 里转动视角，面板 1.5 秒内跟着变
```

### 失败分支

1. `curl` 连不上 9879：插件没启动桥，或端口被占 —— 设置 `BB_ATELIER_PANEL_PORT` 换个端口，并同步改前端 `localStorage["dsh-blockbench-atelier:bridge"]`。
2. `status.json` 里 `channel.connected=false`：Blockbench 没开或 addon 没加载，先跑 `mc_live_doctor(op="doctor")`。
3. 侧边栏没有入口：DSH 没重启，或 `dsh.client` 字段没被宿主读到（检查 `package.json`）。
### 交互（v0.17.0）

1. **按住拖动** = 绕模型转视角。面板驱动的是 Blockbench 的相机（`main_preview.camera` + `controls.target`），所以**那边看到的视角会跟着变** —— 这是方案 A 的取舍（方案 B 要内嵌 three.js 才能独立相机）。
2. **滚轮** = 拉近 / 推远（上滚拉近）。
3. **Live / Paused** = 自动刷新开关；**Refresh** = 手动抓一帧。
4. 拖动时按 90ms 合帧发送，滚轮按 140ms 合并，避免每像素一次请求。

### 相机接口（桥）

1. `GET /orbit?dx=<px>&dy=<px>` —— 绕目标点旋转，`dx/dy` 是像素位移，内部按 0.006 rad/px 换算。
2. `GET /zoom?d=<deltaY>` —— 半径乘 `exp(d/420)`，夹在 0.5-2.0；也可直接 `?zoom=1.2`。
3. `GET /status.json` 多了 `orbits` 计数与 `camera{radius,theta,phi,position,target}`。
4. 每次相机移动会**主动清掉帧缓存**，下一次 `/frame.png` 一定拿到新帧。
## 方案 B 评估（内嵌 three.js 独立相机，未实施）

**结论：可行，但约 2-3 个版本的工程量，建议在方案 A 手感确认后再做。**

### 为什么值得做

1. 独立相机，60fps 自由旋转，**不影响 Blockbench 那边看到的视角**。
2. Blockbench 关掉也能看模型（从桥拿几何即可）。

### 需要解决的四个问题

1. **打包**：当前 `lib/client.js` 是手写单文件、零打包器，只保证能 `require("react")`。内嵌 three.js（约 600KB）需要引入打包或懒加载分包，仓库里还没有构建链。
2. **几何转换**：要把 `.bbmodel` 的 cube 转成 three 的 mesh —— 每个 cube 6 个面，按 `face.uv` 采样 128px 内嵌图集，还要处理 `rotation`/`origin`（我们 v0.11.0 起大量使用旋转骨骼）。
3. **贴图**：图集是 base64 内嵌在 bbmodel 里的，前端要转成 `THREE.Texture`，注意 `nearest` 过滤否则像素会糊。
4. **宿主兼容**：客户端 bundle 的重依赖加载要走宿主的懒加载链路（本机有 `plugin-heavy-dep` 技能专讲这件事），失败要有降级（退回方案 A 的静态帧）。

### 建议的推进顺序

1. 先让桥多暴露一个 `GET /model.json`（返回 bbmodel JSON + 图集 base64）—— 这一步无论如何都有用，方案 A 加「当前工程信息」也要用它。
2. 再做 three.js 查看器，作为独立 tab 或方案 A 面板里的「独立视角」开关。
3. 保留方案 A 作为降级路径（重依赖加载失败时退回远程帧）。

5. **Fit** = 一键复位视角：按模型包围盒算距离，摆到等轴测并框满（实测 target `[0,13.65,0]`、distance 46）。

### 相机接口（桥）补充

5. `GET /fit` —— 复位视角。半径取包围盒外接球，距离 = `radius / sin(fov/2) * margin`，`margin` 默认 1.25。
