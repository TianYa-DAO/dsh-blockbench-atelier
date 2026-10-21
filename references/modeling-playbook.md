# Blockbench 建模手册（真机实测沉淀）

> 来源：2026-10-19 ~ 10-20 在 Blockbench 5.2.2 Desktop 上反复实做的记录。每条都在真机复现过，不是推断。
> 目的：下次要"做一把好看的剑"时，不用再踩一遍同样的坑。

## 1. 管线：先离线生成，再交给 Blockbench 看

1. 用脚本生成 `.bbmodel`（几何 + 内嵌贴图 + 逐面 UV 一次写全），比走通道一条条加 cube 快一两个数量级。
2. 在 Blockbench 里用 `Codecs.project.parse(JSON.parse(text))` 载入，它走的是官方打开文件的同一条路径，材质会正确建立。
3. 用 `mc_bbmodel_validate` 验收（离线，不需要 Blockbench 开着），再截图确认观感。

这条管线的关键好处：**几何与 UV 的正确性可以离线验证**，把"看起来不对"和"数据不对"两件事分开。

## 2. 格式决定贴图能不能绑上

实测结论：同一个模型、同样的贴图代码，`free`（通用模型）格式下面永远渲染成 Blockbench 的默认分件色；换成 **`bedrock`（实体几何）** 立刻正常。

- 要做带贴图的立方体模型，**直接建 `bedrock` 格式**，不要用 `free`。
- `bedrock_block` 用于方块模型（16x16x16 一格），`bedrock` 用于物品/实体几何（可以超出 16 单位）。

## 3. 贴图绑定的正确顺序

顺序错了会静默失败（不报错，只是渲染成默认色）：

1. 新建贴图并设置逻辑尺寸（见第 4 节）。
2. **等图像真正加载完**：`fromDataURL` 是异步的，读 `texture.ctx.getImageData()` 轮询到非全零为止。
3. 调 `texture.updateMaterial()`，让材质拿到 map。
4. 对每个 cube 调 `cube.applyTexture(texture)`。
5. **最后**才写 `face.texture = 0` 与 `face.uv = [...]`。
6. `Canvas.updateAllUVs()` → `Canvas.updateAllFaces()` → `Canvas.updateAll()`。

两个反例（都实测过）：

- 先铺 UV 再绑材质：UV 会被 `applyTexture` 重置掉。
- 手动 `cube.mesh.material = [texture.material]`：`Canvas.updateAllFaces()` 会重建 mesh 把它覆盖掉，不要手动赋值。

## 4. UV 坐标空间 = 项目分辨率，不是 PNG 尺寸

这是最容易错的一条。项目 `resolution` 是 16 时，UV 坐标必须写在 **0..16**，哪怕 PNG 是 128x128。

- 128x128 的图集、逻辑分辨率 16 → **每个逻辑单位 = 8 像素**，一个 16 像素的材质格只占 **2 个逻辑单位**。
- 64x64 的图集 → 每个逻辑单位 = 4 像素，16 像素格占 **4 个逻辑单位**。
- 单个面占整块材质格时，UV 直接写 `[tileX, tileY, tileX + 格宽, tileY + 格高]`，不要按面尺寸去算，否则细节会被拉扁。
- V 轴从图集**顶边**量，不要翻转。

判定方法：把所有面 UV 设成 `[0, 0, 分辨率, 分辨率]`，如果显示出**整张图集**，说明当前空间就是项目分辨率。

## 5. 让模型"看起来贵"的结构语言

粗糙模型和好看模型的差别几乎都在**轮廓台阶数**和**材质分工**上：

1. **锥度要用多段逼近**。剑身 28 单位高、底半宽 2.35 时，用 14 段、每段宽度按 `2.35 * (1 - t)^0.62` 收敛，轮廓才顺；6 段会明显看到楼梯。
2. **棱面用三片叠**。每个截面 = 中央脊（窄、暗）+ 左右两片刃（宽、亮），光照下自然出现高光线。
3. **护手做四段台阶**：中心块 → 内侧段 → 翼段 → 翘角，每段厚度与高度递减，才有"翼"的感觉。
4. **宝石要两面都有**：只做正面的话，转到背面就露馅。宝石用独立材质格，中心高亮、边缘压暗。
5. **符文靠贴图不靠几何**：剑脊材质格上画 2-3 段亮青色短条，比拿几何挖槽省 20 个 cube，效果还更干净。
6. **握柄分段交错**：5 段交替两种皮革材质，视觉上就有缠绕感，不需要真的做螺旋。
7. **比例参考**：剑全长 28.5、护手宽 14.8，长宽比约 1.9:1 时最像"手能握住的重剑"；做到 3:1 会变成针。

参考方向（搜索关键词）：Arabian rune sword、dragon flame sword、MMOItems RPG weapon pack —— 这类商业武器包的共性就是"多段台阶 + 双层护手 + 发光细节 + 宝石"。

## 6. 通道性能：大批量要分批

实测：一次 `batch` 提交 50+ 个 `cube.add` 时，客户端 60-90 秒都收不到响应（服务端不报错，元素其实已经加进去了）。12 个一批是安全的。

- 单批控制在 **10-15 个 cube** 以内。
- 更稳的做法是第 1 节的离线生成：几何不进通道，只把成品文件交给 Blockbench。
- 客户端超时后通道本身还能用（`health` 正常），但**别再发大包**，先 `health` 确认 `elements` 数量对不对。

## 7. 一个可复制的参数表（史诗剑）

| 部件 | from → to | 材质格 |
| --- | --- | --- |
| 剑身 14 段 | y 11.2→28.5，半宽 2.35→0.2 | 脊=暗钢+符文，刃=亮钢 |
| 剑格收口 | x -1.3..1.3，y 10.5..11.3 | 暗黄铜 |
| 护手中心 | x -1.75..1.75，y 8.1..10.7 | 黄铜 |
| 护手内侧 | x ±1.75..3.5，y 8.6..10.3 | 暗黄铜 |
| 护手翼 | x ±3.5..6.0，y 9.2..10.6 | 黄铜 |
| 护手翘角 | x ±6.0..7.4，y 10.0..11.2 | 黄铜 |
| 护手宝石 | 前后各一，z ±1.75..±1.92 | 宝石 |
| 握柄 5 段 | y 3.2..8.2，x ±1.05 | 皮革 / 暗皮革交替 |
| 柄头球 | x ±2.0，y 0.6..2.7 | 黄铜 |
| 柄头宝石 | 前后各一 | 宝石 |

贴图：128x128，8 个 16x16 材质格（亮钢 / 暗钢+符文 / 黄铜 / 暗黄铜 / 皮革 / 暗皮革 / 宝石），项目分辨率 16。

## 8. 验收清单

1. `mc_bbmodel_validate` → `ok=true`、`errors=0`、`outOfBounds=0`。
2. 打开后**转一圈**看背面，宝石/护手是否只做了一面。
3. 正面与侧面各截一张图；只看一个角度很容易漏掉踏台阶错位。
4. 如果面板里贴图缩略图是黑的，说明材质没绑上，回到第 3 节。
## 9. 真机普查结论（2026-10-21，10 个家族）

把每个家族按默认参数生成后在 Blockbench 5.2.2 里逐个载入截图，结论：

1. 可用：剑（58）、提灯（48）、箱子（37）、告示牌（50）、斧（31）、矛（42）、锤（32）、角（38）、王冠（41）。
2. 不合格：**翅膀**。轴对齐方块拼不出翼形轮廓，MC 里需要旋转骨骼；当前 forge 只写 `rotation: [0,0,0]`。已把该家族标为 `draft`，路由会提示"仍是草稿"。

## 10. 抓帧两个坑（真机复现）

1. **`Codecs.project.parse` 之后不调 `Canvas.updateAll()`，视口仍挂着旧场景**，此时抓帧拿到的是上一张画面（表现为 10 个家族抓到同一张图、`variance` 完全一致）。
2. 窗口被遮挡时渲染被节流，`canvas.toDataURL` 会返回过期帧；调试端口可用时先 `Emulation.setFocusEmulationEnabled`，或改用 `Page.captureScreenshot`（会强制出帧）。

判定方法：连续抓两帧比对 sha256，相同就说明是过期帧而不是模型没变。
## 11. 剑的解剖学参数表（2026-10-21 实测，三轮修正后）

| 指标 | 目标值 | 踩过的错 | 门禁文件 |
| --- | --- | --- | --- |
| 剑身长宽比 | 6-10（longsword 20/2.6 = 7.7） | 1:3.8 读成三角巨剑 | tests/blade.test.js |
| 深度/宽度 | 0.10-0.30（longsword 0.55/2.6 = 0.21） | 0.69 读成棍子 | tests/blade.test.js |
| 锥度位置 | 前 75% 只收 11%，最后 25% 收尖 | 从底一路收到尖 = 圆锥 | tests/blade.test.js |
| 护手全宽 | 剑身全宽 × 2.3 | 护手几乎等于剑身长 | tests/blade.test.js |
| 整剑比例 | 约 4.5（真长剑约 4.4） | — | — |

三个预设（改这六个值即可复现）：

| 变体 | 剑身长 | 全宽 | 厚度 | 护手 | 柄长 |
| --- | --- | --- | --- | --- | --- |
| longsword | 20 | 2.6 | 0.55 | 6.0 | 4.2 |
| greatsword | 26 | 3.2 | 0.65 | 7.4 | 5.4 |
| dagger | 10 | 1.5 | 0.45 | 3.6 | 3.0 |

### 厚度语义的坑（最容易翻车的一条）

`thickness` 必须表示**全厚度**，内部用 `thickness / 2` 作为半深度。若直接把 `thickness` 当半深度（`-thick` 到 `thick`），实际深度翻倍，扁刃立刻变成方棍 —— 这条坑过一次，深度 1.8 对宽度 2.6。

### 锥度公式（可复制）

```text
SHOULDER = 0.75
DISTAL   = 0.11
taperAt(halfWidth, t):
  t <= SHOULDER -> halfWidth * (1 - DISTAL * t / SHOULDER)
  否则          -> halfWidth * (1 - DISTAL) * ((1 - t) / (1 - SHOULDER)) ^ 0.62   // 下限 0.1
```

分段时每段取两端 `taperAt` 的较大值，避免出现反向盒。

## 12. 侧边栏实时画面（v0.14.0 架构）

1. **HTTP 桥** `lib/frame-server.js`：监听 `127.0.0.1:9879`（`BB_ATELIER_PANEL_PORT` 覆盖）。`GET /frame.png` 走通道 `see` 抓当前视口，`GET /status.json` 报连接状态 / 工程名 / 格式 / 元素数 / 帧计数。800ms 缓存 + 单飞，避免重复压 Blockbench。
2. **依赖注入**：桥把「通道请求」作为参数注入，自己只依赖 `node:http` —— 因此不背 DSH peer 依赖，可以用假通道做单测。
3. **客户端 bundle** `lib/client.js`：`window.__ModuleLoader__.load({ id, factory })`，只能 `require("react")`，不得 ESM / Node 内置 / 顶层 await。入口用 **`ctx.betterSidebar.registerTab({ id, title, icon, order, single, component })`**（`dsh-better-sidebar` 的服务，客户端 `inject: ["betterSidebar"]`），组件收到 `{ scope, visible }`，`visible` 为假时停轮询。`sidebar.panellist` 是另一个座位（侧边栏图标条），页面不要挂它。
4. **接线**：`package.json` 的 `dsh.client = { inject: [], platform: "web" }` 与 `exports["./client"]`。
5. **验收**：桥可以 `curl` 验（真机验过 53,788 字节 PNG、`connected:true`、缓存命中）；客户端面板要重启 DSH 才加载，重启会结束当前会话 —— 所以分两段验。
### 12.1 远程转视角（方案 A，v0.17.0 实测）

Blockbench 5.2.2 的相机**不在 `Canvas` 上**（`Canvas.scene` 里也没有 isCamera 子节点），真正的入口是全局 `main_preview`：

1. `main_preview.camera` —— PerspectiveCamera。
2. `main_preview.controls` —— OrbitControls 实例，`controls.target` 是模型中心（实测 `[0,12,0]`），还有 `minDistance` / `maxDistance`。
3. `main_preview.render()` —— 强制重绘一帧；**不调它的话，窗口被遮挡时抓帧会是旧的**。

轨道旋转做法：把 `camera.position - controls.target` 转成球坐标 `(radius, theta, phi)`，改 theta/phi（0.006 rad/px）、radians 夹在 `[0.06, PI-0.06]`，再写回笛卡尔坐标 + `camera.lookAt(target)` + `camera.updateMatrixWorld(true)` + `main_preview.render()`。

**不要**调 `controls.update()`：它会用内部旧的球坐标把位置覆盖回去。

滚轮缩放：半径乘 `exp(deltaY / 420)`，上滚（deltaY 为负）半径变小 = 拉近。

这条链路全部走 addon 的 `eval`，**不需要改 Blockbench 侧插件**。