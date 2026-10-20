# 方案分析：把 dsh-blender-plugin 的直连方案搬到 Blockbench

> 分析日期：2026-10-19 ｜ 结论：**照搬「直连 + 冻结工具面 + 内层循环 + 事务回滚 + 配套 skill」这套骨架，Blockbench 侧全部可行；面板与 186 ops 的 plan 层是二期。**
> 落地物：`lampbearer/tools/bb-rt/`（契约 `CONTRACT.md` v0.2）

---

## 1. 两个参照物是什么

### 1.1 开源 Blockbench MCP：`jasonjgardner/blockbench-mcp-plugin`（★540）

| 项 | 事实（实读仓库） |
| --- | --- |
| 形态 | **标准 MCP**。两个服务端：桌面插件走 **HTTP**（默认 `:3000/bb-mcp`），另一个是 **headless stdio**（不开 Blockbench 直接改 `.bbmodel`） |
| 语言/构建 | TypeScript + **bun**（`bun.lock`，`package.json` 依赖 `@modelcontextprotocol/sdk` + `zod`） |
| 规模 | 373 个 `.ts`，`server/tools/` 下 **25 个工具模块**（camera / animation / cubes / cube-uv / display / element / export / history / import / knife / material-instances / mesh / mesh-inspection / modes / paint / particle / performance / project / texture / ui / uv / armature / geolib / hytale …） |
| 亮点 | 已经有**截图/离屏视图**能力（`captureScreenshot` / `renderViewToDataUrl` / `createOffscreenView`，见 `server/tools/camera.ts`） |

**对本机的致命问题**：它用 bun 构建，**本机没有 bun**；而本机 npm 网络不稳（既有桥的 README 明确记了这条），装 `@modelcontextprotocol/sdk` 这条路不可靠。

### 1.2 要照搬的方案：`sixtysevenlf/dsh-blender-plugin` v2.2.0（★691）

| 项 | 事实（实读仓库 + 本机安装痕迹） |
| --- | --- |
| 形态 | **不走 MCP**。**DSH bundle 插件**（`package.json` 的 `dsh.bundle.patch = ./cordis.patch.yml`），用 **cordis** 注册工具 |
| 通道 | **直连 TCP**：addon `127.0.0.1:9876`、后端 `127.0.0.1:9877` |
| 工具面 | **冻结 16 个**：`blender_rt_see/do/watch/loop/pick/cmd/commands/perf/opt/headless/worker/job/txn/preset/plan` + `blender_viewport` |
| 扩展面 | `blender_rt_plan` 暴露 **28 个 family / 186 个 op** 的契约层（判定·验收·导出·造型） |
| 宿主集成 | 浏览器半边：**右侧栏视口面板**（只在通道可用时出现）、点击画面物体写入下一条消息、`@` 提及对象/材质/集合 —— 走独立 `/host/*` 路由 |
| 配套 | `skills/blender-modeling/` **随包发布并自动注册**；`runtime/` 自带 node+python |
| 规模 | `lib/index.js` **171 KB**、`src/index.ts` 156 KB、`lib/client.js` 81 KB、`lib/tui-panel.js` 47 KB；20+ 个自测脚本 |
| 验收判据 | `blender_viewport(op="doctor")` 必须返回 `kind=ok`，否则视为未安装 |

---

## 2. 为什么对 Blockbench 要选「直连」而不是 MCP

| 维度 | MCP 方案（现成开源） | 直连方案（Blender 那套） |
| --- | --- | --- |
| 本机可行性 | ❌ 要 bun + npm 装 SDK，两者本机都不稳 | ✅ **零第三方依赖**，纯 Node/Electron 内建 |
| 与 DSH 的关系 | 走 MCP 客户端插件，多一层协议转换 | ✅ **DSH 原生 cordis 插件**，工具直接进 `ctx.tools` |
| 每次调用开销 | MCP 序列化 + 桥进程转发 | ✅ 进程内直连，Blender 侧实测 25–160 ms 级 |
| 图片回传 | MCP 返回 base64（吃 token） | ✅ 落盘 + 走宿主 attachments |
| 扩展面 | 25 个工具模块，扁平 | ✅ 16 工具 + **186 op 契约层**（工具面不膨胀） |
| 本机既有惯例 | 无 MCP 的 Blockbench 服务 | ✅ 与 `dsh-blender-plugin` 同构，用户已熟悉 |

**结论：选直连。** 现成的 Blockbench MCP 不当底座，但**它的工具实现（尤其相机/截图那套）是极好的抄写来源**——见 §6 的「可借鉴清单」。

---

## 3. 落地方案（bb-rt）

```
DSH (agent)
   │  cordis 工具（ctx.tools.register）
   ▼
dsh-blockbench-plugin  (lib/index.js)          ← DSH 侧，8 个冻结工具
   │  HTTP 127.0.0.1:9878
   ▼
bb-bridge.js  (Blockbench 插件, %APPDATA%/Blockbench/plugins/)   ← Blockbench 侧，8 个端点 + op 命名空间
   │  Blockbench 运行时 API
   ▼
工程 / 画布 / 贴图 / 动画
```

**为什么通道用 HTTP 而不是裸 TCP**：Blockbench 插件跑在 Electron 渲染进程里，HTTP 比裸 socket 更好调试（浏览器能直接打）、且与既有 `mc-studio-bridge` 的经验一致。语义上等价于 Blender 的直连。

---

## 4. 工具面映射：Blender 16 → Blockbench 8（一期）

| Blender | 本方案 | 说明 |
| --- | --- | --- |
| `blender_rt_see`（视口帧，50–100 ms） | `mc_live_see` | ✅ 一期核心。Blockbench 画布是 three.js WebGL，取 PNG |
| `blender_rt_do`（跑 Python） | `mc_live_do`（跑 op 数组） | ✅ 一期核心 |
| `blender_rt_loop`（Blender 侧内环，160 tick/s） | 合并进 `bb_do` 的 `ops` 数组 | ✅ 一期。服务端连跑，agent 只拿摘要 |
| `blender_rt_txn`（事务回滚） | `mc_live_txn` + `bb_do{txn:"rollback"}` | ✅ 一期。用 Blockbench `Undo` 栈实现 |
| `blender_rt_commands`（列命令） | `mc_live_ops` | ✅ 一期。agent 自查能力 |
| `blender_rt_export`（契约层导出） | `mc_live_export` | ✅ 一期（bedrock geo/anim、gltf、png） |
| `blender_rt_preset`（配方库） | `mc_live_preset` | ✅ 一期（本地 JSON 库） |
| `blender_viewport`（通道运维 + 写租约） | `mc_live_doctor` | ✅ 一期，只做 `doctor/status/probe`（**写租约二期**） |
| — | `mc_live_state` | ➕ Blockbench 特有：模型状态是 agent 最需要的上下文 |
| `blender_rt_watch`（时间窗采样 ≤6 帧） | ❌ 二期 | 动画采样，Blockbench 有动画但优先级低于建模 |
| `blender_rt_pick`（用户在视口点选，阻塞式） | ❌ 二期 | 需要面板联动 |
| `blender_rt_cmd`（addon 命令透传） | ❌ 二期 | Blockbench 无等价「任意 addon 命令」面 |
| `blender_rt_perf`（渲染性能诊断） | ❌ 二期 | Blockbench 不是渲染器，收益低 |
| `blender_rt_opt`（对象精简/安全合并） | ❌ 二期 | 可做成 op |
| `blender_rt_headless` / `_worker` / `_job`（无头进程/热会话/作业层） | ❌ 二期 | **本机可行性最高的一项二期**：开源 MCP 已有 headless stdio 实现可借鉴 |
| `blender_rt_plan`（28 family / 186 op 契约层） | ❌ 二期 | 见 §5 |

---

## 5. 186 ops 的 plan 层怎么搬（二期，但先说清思路）

Blender 那边把「判定 / 验收 / 导出 / 造型」做成 **28 个 family、186 个 op** 的契约层，好处是**工具面不膨胀**——agent 只学 16 个工具，能力靠 op 目录发现。

Blockbench 侧的 op 来源非常明确，**几乎可以直接枚举**：

1. **官方 API 符号**：我们已抓到 `web.blockbench.net/docs` 的 **1,460 个可跳转条目**（`docs/reference/blockbench/06-api-reference-index.md`）——这就是天然的 op 池（`Cube`/`Group`/`Texture`/`Animator`/`Keyframe`/`UV`/`Canvas`…）。
2. **开源 MCP 的 25 个工具模块**：每个模块的动作可归并成 family（cubes / uv / texture / paint / animation / armature / display / mesh / particle / export…）。
3. **本项目实际需求**：方块模型、实体模型、attachable、贴图、UV、导出 bedrock geo/anim。

建议的 family 划分（一期先落 5 个）：`project` / `cube` / `group` / `texture` / `see`。

---

## 6. 右侧栏面板与配套 skill 怎么搬（二期）

| Blender 做法 | Blockbench 对应 | 可行性 |
| --- | --- | --- |
| `ctx.inject(['tuiPanels'], ...)` 注册侧栏面板 | 同一套 API（`dsh-blender-plugin` 的 `lib/tui-panel.js` 是现成模板，47 KB） | ✅ 高——照抄即可 |
| 点击画面物体 → 写入下一条消息 | 需要面板 + 通道回传（`/host/*` 路由） | ⚠️ 中——Blockbench 侧要能拿到选中对象，`Canvas`/`Outliner` 有选中态 |
| `@` 提及场景对象/材质/集合 | 同上 | ⚠️ 中 |
| `skills/blender-modeling/` 随包自动注册 | `skills/blockbench-modeling/` + `registerBundledSkill(ctx)` | ✅ 高——范式现成 |
| 通道可用时才出现面板 | 同 | ✅ 高 |

---

## 7. 预期收益（为什么这叫「提效」）

Blender 那边给的真实数字可以直接类比：

| 场景 | 传统做法 | 直连后 | 省什么 |
| --- | --- | --- | --- |
| 改一步看一眼 | 改 → 让用户截图 → 贴回来（1 个模型轮次 + 人工） | `bb_do{see:true}` 一次调用 ≈ 百毫秒级 | **1 个模型轮次/次修改** |
| 试 20 种排布 | 20 次工具调用 + 20 个轮次 | 1 次 `bb_do`（20 个 op）+ 1 张图 | **19 个轮次** |
| 试错后回退 | 手工撤销 / 重开 | `txn:"rollback"` | 人工操作 |
| agent 不知道自己能干啥 | 猜 API | `bb_ops` 自查 | 试错调用 |

**最值钱的是「agent 能自己看到模型」**——现在这个项目的建模是「我写完 → 你看 → 告诉我哪不对」，直连后变成「我写完 → 我自己看 → 自己改」。

---

## 8. 风险与未验证（诚实清单）

1. **Blockbench 插件能否起 HTTP 服务**：Blockbench 是 Electron，桌面版理论上能 `require('http')`，但**我没实测过**。已让 T29 明确给出结论与依据。若不行，退到 `net` 或 Electron IPC——**这是本方案第一个可能翻车的点**。
2. **能否截到非空 PNG**：three.js 默认 `preserveDrawingBuffer: false`，`toDataURL()` 可能拿到空白图。开源 MCP 里有 `captureScreenshot` / `renderViewToDataURL` 的成熟做法可抄。**这是第二个可能翻车的点。**
3. **DSH 插件装配是侵入性的**：要改 `~/.dsh/profiles/desktop/` 的 `cordis.patch.yml` 与 `package.json`。本机该目录**今天 19:43 还在被改动**（有实时插件管理），装之前**必须备份**。
4. **`vTool` / `@deepseek-ai/dsh-tools` 的解析路径未确认**：已让 T30 给结论。
5. **完整照搬是跨会话工程量**：参考实现 `lib/index.js` 171 KB + addon + 面板 + 20 个自测。本会话只做**一期 8 工具 + 真实截图闭环**。

---

## 9. 补齐清单（「缺啥补啥」backlog）

| 优先级 | 项 | 依赖 |
| --- | --- | --- |
| P0 | Blockbench 插件起服务 + `/see` 真出图 | T29 |
| P0 | DSH 插件 8 工具注册 + `doctor kind=ok` | T30 |
| P0 | 真机闭环：装插件 → 起 Blockbench → 截图 | lead |
| P1 | op 命名空间补齐（`texture.*`/`uv.*`/`anim.*`/`project.*`） | 一期跑通后 |
| P1 | `mc_live_plan`（从 1,460 个 API 符号 + 25 个 MCP 模块生成 op 目录） | 同上 |
| P1 | 配套 skill `skills/blockbench-modeling/` | 同上 |
| P2 | 右侧栏面板（`ctx.inject(['tuiPanels'])`，照 `tui-panel.js`） | 通道稳定后 |
| P2 | `headless` / `worker` / `job`（借鉴开源 MCP 的 headless stdio） | 同上 |
| P2 | 写租约（防止 agent 与用户同时改同一个工程） | 同上 |
| P2 | `pick` / `watch` | 面板就绪后 |

---

## 10. 可借鉴清单（从开源 Blockbench MCP 抄什么）

即便不用它的 MCP 外壳，这些实现值得直接读：

1. `server/tools/camera.ts` + `lib/views.ts`：**离屏视图 + 渲染成 dataURL**（`createOffscreenView` / `renderViewToDataUrl` / `resizeOffscreenView`）——`/see` 的直接答案。
2. `lib/util.ts` 的 `captureScreenshot` / `captureAppScreenshot` / `imageContent`。
3. `lib/animation-undo.ts`、`server/tools/history.ts`：**Undo 的正确用法**（与我们的 `txn` 直接相关）。
4. `lib/cube-knife.ts`、`lib/block-grid.ts`：cube 操作的边界情况。
5. `server/tools/export.ts` + `lib/export-file.ts`：导出格式与落盘。
6. `headless/`：**无头编辑 `.bbmodel`**——二期 `headless`/`worker` 的现成蓝本。
