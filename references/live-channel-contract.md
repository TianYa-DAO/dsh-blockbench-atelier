# bb-rt 接口契约 v0.2（Blockbench × DSH 直连插件）

> 方案来源：`sixtysevenlf/dsh-blender-plugin` v2.2.0（★691）—— **不走 MCP、本地直连通道 + 冻结工具面 + 内层循环 + 事务回滚 + 常驻 worker + 配套 skill + 右侧栏面板**
> 本机约束：Blockbench 已装（`%LOCALAPPDATA%\Programs\Blockbench\`）、插件目录 `%APPDATA%\Blockbench\plugins\`（放 .js 自动加载）；Node v22 有、**无 bun**；npm 不稳 → **零第三方依赖**
> 版本：v0.2 ｜ 2026-10-19 ｜ **v0.1 的 MCP 桥方案作废**（改成 DSH 原生 cordis 插件）

---

## 0. 拓扑（对齐 Blender 方案）

```
DSH (agent)  ──cordis 插件注册工具──▶  dsh-blockbench-plugin (lib/index.js)
                                              │  TCP/HTTP 127.0.0.1:9878
                                              ▼
                                    bb-bridge.js  (装在 Blockbench 内)
                                              │  直接调 Blockbench 运行时 API
                                              ▼
                                        Blockbench 工程 / 画布
```

1. **bb-bridge.js**：Blockbench 插件（单文件 IIFE），在 Blockbench 内起本地 HTTP 服务，暴露 §1 的端点。
2. **dsh-blockbench-atelier**：DSH bundle 插件。**本机权威样板是用户自己的 `D:\dsh插件\dsh-mc-atelier`**（同机同 DSH 版本，已装进 desktop profile），照它写：

```js
import { defineTool } from "@deepseek-ai/dsh-tools";
export const name = "dsh-blockbench-atelier";
export const inject = ["skills", "tools"];
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "mc_live_see",
    description: "...",
    parameters: { width: { type: "integer", description: "..." } },
    output: { schema: { type: "object", additionalProperties: true }, render: (_a, r) => JSON.stringify(r) },
    isConcurrencySafe: () => true,
    async execute(args) { ... }
  }));
}
```

**不要用 `vTool` / `ctx.effect`**（那是 `refs/dsh-blender-plugin` 所属的另一个 DSH 版本的 API）。
3. 端口默认 **9878**，环境变量 `BB_RT_PORT` 可覆盖。**只监听 127.0.0.1**。


---

## 1.0 【2026-10-19 实测修正 · 传输层必须是裸 TCP，不能用 HTTP】

**实测结论（从 Blockbench 5.2.2 的 `app.asar` 里挖出来的官方实现）**：Blockbench 对插件 require 做了白名单：

```js
SAFE_APIS = ['path','crypto','events','zlib','timers','url','string_decoder','querystring','constants','buffer','stream','perf_hooks']
REQUESTABLE_APIS = ['fs','process','child_process','https','net','tls','util','os','v8','dialog','clipboard','shell']
```

1. **`http` 两个表都不在** → `require('http')` 直接抛 `The module "http" is not supported`。**这就是 v0.1/v0.2 的 HTTP 方案在真机上端口不开的原因**（插件不崩，静默失败）。
2. **`net` 在 REQUESTABLE_APIS 里**（官方描述：full network access）→ **裸 TCP 可行**。
3. 可请求的模块**首次使用会弹同步模态框**（`Plugin Permission` → `Allow once` / `Always allow for this plugin`），授权结果写进用户数据目录的 `plugin_permissions.json`，格式实测为：

```json
{"vox_importer":{"allowed":{"fs":true}}}
```

→ 我们的插件需要 `net` 权限（若还要自己落盘 PNG 才需要 `fs`；本方案由 DSH 侧落盘，**插件不需要 fs**）。

### 因此传输层改为：**newline-delimited JSON over TCP**

1. 插件用 `require('net').createServer()` 监听 `127.0.0.1:9878`（权限：net）。
2. **一请求一响应**，每条消息一行 JSON 以 `\n` 结尾；同一连接上可连续发多条。
3. 请求： `{"id":1,"method":"health|ops|state|op|batch|see|history|export","params":{...}}`
4. 响应： `{"id":1,"ok":true,"result":<any>}` 或 `{"id":1,"ok":false,"error":"..."}`
5. **`see` 的图片以 base64 放在 `result.png_b64`**（本机回环，~百 KB 级，可接受）；同时给 `width/height/bytes`。
6. 除传输层外，**§1 的端点语义、§1.1 的 op、§2 的工具面全部不变**——method 名与原来端点名一一对应。

### 装配注意（新增）

1. 首次加载插件会弹权限框，用户需点 **Always allow for this plugin**。
2. 无人值守测试可在用户数据目录预置 `plugin_permissions.json`：`{"bb_bridge":{"allowed":{"net":true}}}`
## 1. Blockbench 侧通道契约（bb-bridge.js 实现）

JSON 响应；`/see` 返回 `image/png` 字节。

| 端点 | 方法 | 入参 | 返回 |
| --- | --- | --- | --- |
| `/health` | GET | — | `{ok, plugin, version, blockbench, project, format, elements, groups, textures, animations}` |
| `/ops` | GET | — | `{ok, ops:[{name, args, desc}]}` |
| `/state` | GET | — | `{ok, project, elements, groups, textures, animations}`（精简） |
| `/op` | POST | `{op, args}` | `{ok, op, result, took_ms}` |
| `/batch` | POST | `{ops:[...], stop_on_error?, see?, txn?}` | `{ok, ran, results, took_ms, see_png_b64?, rolled_back}` |
| `/see` | GET | `?width=&height=&angle=` | PNG 字节（默认 512×512） |
| `/history` | POST | `{action:"undo"\|"redo"\|"mark"\|"rollback_to"}` | `{ok, depth}` |
| `/export` | POST | `{format, path}` | `{ok, path}` |

**语义硬要求**：
1. `/batch` 的 `txn:"rollback"` 必须把整批操作**干净撤销**（`Undo.initEdit`/`Undo.finishEdit` 成对使用），让 agent 能「试了再退」。
2. `/see` 必须返回**真实 PNG 字节**；取不到画面时必须返回 500 + 可读原因，**不许返回空白图**。
3. `/batch` 是**内层循环**：一批 op 在 Blockbench 侧连续跑完，agent 只拿摘要，不参与中间步骤。

### 1.1 op 命名空间（v0.2 至少实现这些）

| op | args | 说明 |
| --- | --- | --- |
| `state.get` | — | 取工程状态 |
| `cube.add` | `from:[x,y,z], to:[x,y,z], name?` | 新建 cube |
| `cube.set` | `uuid\|name, from?, to?, rotation?, origin?, inflate?` | 改 cube |
| `cube.remove` | `uuid\|name` | 删 cube |
| `group.add` | `name, origin?` | 新建组 |
| `group.assign` | `name\|uuid, group` | 把 cube 放进组 |
| `texture.new` | `name, width, height` | 新建贴图 |
| `texture.paint` | `name, x, y, color\|dataurl` | 画一个像素/贴一块图 |
| `uv.map` | `uuid\|name, box_uv?:true, face?, uv:[u,v]` | 设 UV |
| `project.set` | `key, value` | 改工程设置（格式、模型标识等） |
| `project.new` | `format` | 新建工程 |
| `anim.keyframe` | `animator, channel, time, x?,y?,z?` | 加关键帧 |
| `see` | `width?, height?, angle?` | 渲染预览（也可作为 op 用） |
| `undo` / `redo` | — | 历史 |

> 命名空间留了扩展位；**优先把 `cube.*` / `group.*` / `state.get` / `see` 做对**，其余按「缺啥补啥」补。

---

## 2. DSH 侧工具面（dsh-blockbench-plugin 注册）

**冻结为 8 个工具**（Blender 是 16，我们先做核心 8 个；扩展走 `mc_live_do` 的 op）：

| 工具名 | 入参 | 映射 | 对照 Blender |
| --- | --- | --- | --- |
| `mc_live_see` | `width? height? angle?` | `GET /see` | `blender_rt_see` |
| `mc_live_do` | `ops`(数组,必填) `see?` `txn?` | `POST /batch` | `blender_rt_do` + `_loop` |
| `mc_live_state` | — | `GET /state` | （Blender 无独立对应） |
| `mc_live_ops` | — | `GET /ops` | `blender_rt_commands` |
| `mc_live_txn` | `action` | `POST /history` | `blender_rt_txn` |
| `mc_live_export` | `format path` | `POST /export` | `blender_rt_export`（Blender 是 plan 的 op） |
| `mc_live_preset` | `action(name/list/save/apply) name?` | 本地 JSON 配方库 | `blender_rt_preset` |
| `mc_live_doctor` | `op`(`doctor`/`status`/`probe`) | `GET /health` 等 | `blender_viewport` |

**验收判据（对齐 Blender 的「doctor kind=ok」）**：
`mc_live_doctor(op="doctor")` 必须返回 `kind=ok`；否则视为**未安装**。

约定：
1. 图片：`mc_live_see` / `mc_live_do{see:true}` 把 PNG 落到 `%TEMP%/bb-rt/<ts>.png`，**返回文件路径**（不吐 base64）。
2. 连不上时错误文案可执行：「Blockbench 未运行或 bb-bridge 插件未加载：连不上 127.0.0.1:9878」。
3. 插件必须带 `skills/blockbench-modeling/`（**配套 skill 随包自动注册**，用 `registerBundledSkill(ctx)` 的等价实现）。

---

## 3. 装配位置（真实路径）

| 东西 | 位置 |
| --- | --- |
| DSH profile | `C:\Users\xie_f\.dsh\profiles\desktop\` |
| 插件装配 | `cordis.patch.yml` 里加一条 `- insert: [{id, name, config}]` |
| profile 依赖 | `profiles/desktop/package.json` 的 dependencies + `node_modules` |
| **权威样板（本机）** | `D:\dsh插件\dsh-mc-atelier` —— 用户的 Blockbench DSH 插件，已装进 profile，注册 4 个离线工具（`mc_bbmodel_inspect` / `mc_bbmodel_validate` / `mc_texture_analyze` / `mc_bbmodel_create`）+ 2 个 skill。**bb-rt 补的正是它缺的「活通道」**（离线文件工具 vs 连正在运行的 Blockbench） |
| 方案原型（只读） | `D:\netmcmod\refs\dsh-blender-plugin\`（另一 DSH 版本，API 不同，只借思路不抄 API） |
| 本机 DSH 检查清单 | `~/.dsh/profiles/desktop/cordis.yml`（102KB，装配结果） |

---

## 4. 硬约束

1. 不改 Blockbench 安装目录；只放 `%APPDATA%/Blockbench/plugins/bb-bridge.js`。
2. 插件不阻塞 UI；长操作让出事件循环。
3. 只监听 127.0.0.1。
4. **代码不写注释、不出现中文**（用户硬规范）；说明写 README。
5. `Undo` 必须成对（`initEdit`/`finishEdit`），否则会破坏 Edit Session 同步。
6. 装 DSH 插件前**先备份** `cordis.patch.yml` 与 profile `package.json`（本机已有 .bak 惯例）。

## 实测限制（2026-10，Blockbench 5.2.2）

1. **大批量会超时**：一次 `batch` 提交 50 个以上 `cube.add` 时，客户端 60-90 秒收不到响应；服务端不报错，元素其实已写入。单批建议 10-15 个。
2. **超时后先 `health` 核对 `elements`**，不要立刻重发同一批，否则容易重复添加。
3. **通道只管几何与状态**。贴图绑定、材质重建这类渲染层操作没有对应 op，需要 CDP 或离线生成文件后 `Codecs.project.parse`。
4. **`free` 格式下贴图绑不上**，贴图类模型请建 `bedrock` 或 `bedrock_block` 格式。
5. 窗口被遮挡时渲染会被节流，`Page.captureScreenshot` 可能反复返回同一张旧帧（逐字节相同），此时应先 `Emulation.setFocusEmulationEnabled` 再确认 FPS。