# Changelog

## v0.17.1

**面板补上 Fit 复位视角**，方案 A 补齐。

### 新增

1. `GET /fit` —— 按模型包围盒算外接球，距离 = `radius / sin(fov/2) * margin`，摆到等轴测并框满。
2. 面板加 **Fit** 按钮。
3. 生成的相机代码里**不含任何字符串字面量**（用 try/catch 取全局，避免转义与注入问题）。

### 真机验证

1. `/fit` → `target=[0,13.65,0]`、`distance=46`、`radius=14`，相机移到 `[23,33,35]`。
2. 帧哈希 `c10f9a1f…` → `b68a82aa…`，画面确实是等轴测框满。
3. 相机移动后帧缓存同步清掉。

### 测试

`npm test` **58/58**（新增 2 条：fit 代码内容与不含字符串字面量、桥的 fit 路由与缓存失效）。

## v0.17.0
## v0.17.0

**侧边栏面板可以自由转视角了**（方案 A：远程视口）。

### 能力

1. **拖动**绕模型旋转，**滚轮**拉近推远，走 HTTP 桥 → 通道 `eval` → Blockbench 相机，**不需要更新 Blockbench 侧 addon**。
2. 桥新增 `GET /orbit?dx=&dy=` 与 `GET /zoom?d=`，`/status.json` 多了 `orbits` 与 `camera` 状态。
3. 相机一动手动**清帧缓存**，下一次抓帧必然是新的。

### 关键技术发现

Blockbench 5.2.2 的相机**不在 `Canvas` 上**（`Canvas.scene` 里也没有相机子节点，addon 的 `has_camera` 一直是 false）。真正入口是全局 `main_preview`：`camera` / `controls`（`controls.target` 就是模型中心）/ `render()`。

`render()` 必须显式调用 —— 窗口被遮挡时只抓 canvas 会拿到旧帧。另：**不要**调 `controls.update()`，它会用内部旧球坐标覆盖手写的相机位置。

### 手感修正（真机验证时发现）

1. 滚轮方向反了（上滚反而推远）→ 改为半径乘 `exp(deltaY/420)`，上滚半径变小。
2. 拖动过敏（160px 转了 110°）→ 步长从 0.012 降到 0.006 rad/px。

### 验证

1. 真机：`/orbit?dx=160&dy=-30` → 相机移到 `[-23.8,-11.7,-45.0]`，帧哈希 `a53fc44…` → `bb85ad7…`（画面确实变了）。
2. `/zoom?d=-260` → 半径 56.2 → 30.3（拉近），帧哈希再变。
3. `status.orbits=2`、`frames=3`，缓存失效逻辑生效。
4. `npm test` **56/56**（新增 5 条：参数夹取、轨道代码内容、滚轮换算、桥的 orbit 路由与缓存失效、空请求拒绝）。

### 已知取舍

方案 A 会**同步改变 Blockbench 那边的视角**（共用一个相机）。若要不影响 Blockbench，需要方案 B（内嵌 three.js 独立相机），评估结论见交付说明。

## v0.16.0
## v0.16.0

**面板入口改挂 `betterSidebar.registerTab`** —— 之前用错了座位，面板没出现在用户要的那个标签列表里。

### 问题

v0.14.0 把面板注册到 `sidebar.panellist` + `main` 两个 slot。那是侧边栏的图标条座位，用户要的是 `dsh-better-sidebar` 的**标签页列表**（文件 / Git / 任务管理 / 浏览器 / 记忆系统 那一列）。

### 修正

1. 客户端改为 `inject: ["betterSidebar"]`，在 `ctx.effect` 里调 **`ctx.betterSidebar.registerTab({ id, title, icon, order: 65, single: true, component })`**。
2. 组件按契约接收 `{ scope, visible }`：**`visible` 为假时停止轮询**，不再靠 `document.visibilityState` 猜。
3. 去掉了 `sidebar.panellist` 与 `main` 两处注册。
4. 手册第 12 节把这条 API 纠回正确写法，并标注 `sidebar.panellist` 是图标条座位、页面不要挂它。

### 契约来源（实测抄自本机已装插件）

1. `dsh-better-sidebar` 的 `README.md`：`ctx.betterSidebar.registerTab` / `registerFileViewer` 是其对外两个扩展点。
2. `dsh-mnemon` 的客户端 tab 用法：`id` / `title: () => t(...)` / `icon: (size) => <Icon size={size} />` / `order` / `single` / `component: ({ scope, visible })`。
3. 侧边对话 tab 的用法：额外支持 `available` 与 `createTab`。

## v0.15.1
## v0.15.1

**把剑形三轮修正的经验写进技能与手册**（纯文档版，不改代码）。

### 技能新增（skills/mc-blockbench-modeling）

1. **解剖学数值门**：剑身长宽比 6-10、深度/宽度 0.10-0.30、锥度只能发生在最后 30%、护手 = 剑身宽 2.3 倍、整剑比例约 4.5。
2. **参数系统两个陷阱**：`PARAMS` 是 schema 不是值（布尔开关会恒真）、`resolve()` 之后再取预设会让三种剑型生成得一模一样。
3. **工作法「量 → 修 → 加门」**：用户说「不像」时先量数字，再按真实参照物改，最后写成断言。

### 手册新增（references/modeling-playbook.md）

1. 第 11 节「剑的解剖学参数表」：五个指标的目标值 + 踩过的错 + 对应门禁文件，三个预设的六个关键数值，可复制的锥度公式，以及「厚度语义」这条最容易翻车的坑。
2. 第 12 节「侧边栏实时画面」：HTTP 桥 + 依赖注入 + 客户端 bundle 契约 + 两段式验收。

## v0.15.0
## v0.15.0

**剑身厚度修正** —— 之前把 `thickness` 当半厚度用，实际深度是设计值的两倍，截面接近方形，看着像棍子。

### 问题

longsword 剑身宽度 2.6，但深度是 1.8（`-thick` 到 `thick`，thick=0.9），**深度/宽度 = 0.69**。真实剑身大约 0.13。

### 修正

1. `thickness` 改为**全厚度**语义，内部用 `thick / 2` 作为半深度。
2. 默认值：longsword 0.55、greatsword 0.65、dagger 0.45。
3. 修完深度/宽度 = **0.09-0.13**，与真实剑一致。
4. 护手厚度跟着收（`max(0.85, thickness + 0.35)`），不再比剑身还厚。

### 新增门禁

`tests/blade.test.js` 加第三条：**剑身深度/宽度必须落在 0.10-0.30**，且深度不得大于剑身长度的 1/12 —— 直接从数据上钉死「剑必须是扁的，不是棍子」。

### 验证

1. `npm test` **51/51**
2. 真机渲染 longsword / greatsword / dagger 三张图

## v0.14.0
## v0.14.0

**DSH 侧边栏实时画面面板** —— 边聊天边看 Blockbench 正在做的模型。

### 新增

1. **HTTP 桥** `lib/frame-server.js`：监听 `127.0.0.1:9879`，`GET /frame.png` 抓当前视口，`GET /status.json` 返回连接状态 / 工程名 / 格式 / 元素数 / 帧计数。带 800ms 缓存与并发合流，避免压 Blockbench。
2. **客户端面板** `lib/client.js`：按 `window.__ModuleLoader__.load` 契约手写，挂 `sidebar.panellist`（入口图标）+ `main`（页面）。可见时 1.5 秒自动刷新、切走停刷、另有手动刷新。
3. **打包接线**：`dsh.client = { platform: "web" }` 与 `exports["./client"]`。

### 真机验证

1. 桥起来后 `GET /status.json` → `200`，`channel.connected=true`，`project=wish_dagger`，`elements=51`。
2. `GET /frame.png` → `200 image/png`，**53,788 字节真 PNG**，480x480，内容就是当时的 Blockbench 视口。
3. 连抓两次字节完全相同 → 缓存生效，没有重复压 Blockbench。
4. 单测 5 条：状态字段、PNG 字节、缓存只打一次通道、通道坏掉返回 503、未知路径 404。

### 注意

客户端面板要**重启 DSH** 才会加载。验收步骤写在 README「侧边栏实时画面」一节。

## v0.13.0
## v0.13.0

**剑的解剖学修正** —— 按真实长剑的比例重做，不再是从底收到尖的圆锥。

### 问题（用户实测指出）

旧版剑身长 26、底部全宽 6.8，**长宽比只有 1:3.8**，而且锥度公式 `(1-t)^0.55` 从底部一路收到尖 —— 两件事叠加就是一把三角形巨剑。

### 修正

1. **剑身收窄**：长宽比改到 1:7.7。longsword 长 20 / 全宽 2.6；greatsword 长 26 / 全宽 3.2；dagger 长 10 / 全宽 1.5。
2. **锥度改两段式**：前 75% 只做远端收细 11%（近似等宽），最后 25% 才按曲线收到尖。
3. **护手按比例**：全宽 = 剑身全宽的 2.3 倍（longsword 6.0，原 7.6）。
4. **柄与柄头缩**：握柄 4.2（原 4.8）、柄头球 1.5（原 1.9）、柄头不再压过护手。
5. **整剑比例** 4.47 - 4.66（真实长剑约 4.4）。

### 新增门禁（tests/blade.test.js）

1. **剑身长宽比必须落在 6-10**：直接钉死「不像剑」这件事。
2. **收细只能发生在最后 30%**：t < 0.68 的截面半宽不得低于底部的 84%。
3. **剑尖必须真的收成尖**：末段半宽 < 底部的一半。
4. **护手不得喧宾夺主**：整剑宽 < 总长的 1/3.5。

这三条门当场抓出匕首长宽比 5.0 不达标，已把匕首剑身收窄到 1.5（10 / 1.5 = 6.67）。

### 验证

1. `npm test` **45/45**（新增 2 条剑形门）
2. 真机渲染 longsword / greatsword / dagger 三张图留证

## v0.12.0
## v0.12.0undefined
