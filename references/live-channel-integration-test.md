# bb-rt 真机集成测试报告（Blockbench 5.2.2 Desktop）

> 测试日期：2026-10-19 ｜ 对象：`lampbearer/tools/bb-rt/`（addon/bb-bridge.js + lib/index.js）
> 结论：**通道层完全打通（TCP + net 权限 + health/ops 实测通过）；op 实现层因 API 符号名不符而失败，需按 §4 修复。**

---

## 1. 测试环境与方法

| 项 | 值 |
| --- | --- |
| Blockbench | **5.2.2 Desktop**，Electron 43.4.0 / Node 24.18.1 / Three.js r129 |
| 隔离实例 | `--user-data-dir=D:\netmcmod\.cache\bb-live --remote-debugging-port=9333`（**不动用户正在跑的实例**） |
| 插件加载 | Blockbench **不会**自动加载 plugins 目录里的 .js（已实验证伪：放一个只 console.log 的探针，日志无输出）。必须走 `Plugins.installed` + `BBPlugin.prototype.loadFromFile({path})` 或其 GUI 的 Load Plugin from File |
| 驱动方式 | **CDP**（`Runtime.evaluate`）在渲染进程里执行 JS 完成加载与探针 |
| 权限 | 预置 `plugin_permissions.json`；**该文件只在启动时读入内存**，运行期改无效 |

---

## 2. 实测结果

### 2.1 通过的（通道层）

```json
{"id":1,"ok":true,"result":{
  "ok":true,"plugin":"bb-rt","version":"0.2.0","blockbench":"5.2.2",
  "transport":"tcp-ndjson","net_ok":true,"net_source":"require","net_errors":[],"net_attempts":["require"],
  "node_route":"net","listening":true,"port":9878,"host":"127.0.0.1","connections":1,
  "is_web":false,"is_mobile":false,
  "project":null,"format":null,"elements":0,"groups":0,"textures":0,"animations":0,
  "capture_strategy":null,"capture_ok":null,"has_camera":false,"has_renderer":false,"has_canvas":false
}}
```

1. **`net` 权限可用**：`net_ok=true`、`net_source="require"` —— Blockbench 的 scoped require 确实放行 net。
2. **TCP + newline-delimited JSON 正常**：health、ops 均通过，ops 返回 15 个 op 的完整清单。
3. 「Blockbench 插件能不能起本地服务」这个最大风险点 **已排除**。

### 2.2 失败的三处（op 实现层）

| 操作 | 实测错误 | 根因 |
| --- | --- | --- |
| `project.new` | `Project API not available` | **Blockbench 5.x 里 `Project` 是 number（0），不是工程类** |
| `batch`（cube.add x3） | `one or more ops failed` | 依赖上层工程对象 |
| `see` | 所有截图策略失败：render_target 不可用、canvas 找不到 | 页面只有 1 个 canvas 且 **0x0**（未建工程，画布无尺寸） |

---

## 3. Blockbench 5.2.2 的真实 API（CDP 逐项探出，可直接照抄）

### 3.1 确实存在

| 全局 | 类型 | 说明 |
| --- | --- | --- |
| `newProject` | **function**（arity 1） | 建工程：`newProject(Formats.free)` |
| `Formats` | object | 键即格式：free / java_block / bedrock / bedrock_block / bedrock_old / modded_entity / optifine_entity / optifine_part / skin / image |
| `Codecs` | object | project / java_block / bedrock_voxel_shape / bedrock_entity_file / bedrock / bedrock_old / obj / gltf / fbx / collada / stl / modded_entity / optifine_entity / optifine_part / skin_model / image |
| `ModelFormat` | function | 原型有 new / select / convertTo / delete |
| `Cube` `Group` `Texture` `Outliner` `Canvas` `BarItems` `Panels` `Modes` | 存在 | Canvas 是 object（scene / gizmos / materials / raycast / getModelBoundingBox 等） |
| `UndoSystem` | **function（类）** | 静态：save / selectionSave；实例方法在 prototype |
| `Outliner` | object | ROOT / root / elements / selected / nodes / toJSON / loadJSON |
| `Blockbench` | object | version / isWeb / isMobile / platform / flags / events / showQuickMessage / showToastNotification / edit / reload |

### 3.2 当前插件用错的

| 插件里的写法 | 真实情况 |
| --- | --- |
| `Project`（当类用） | **是 number（0）**。工程对象走 `newProject()` 的返回值或 `Outliner.root` |
| `Undo.xxx` | `window.Undo` 不存在；真实是 **`UndoSystem`**（类）。`Blockbench.Undo` 也是 undefined |
| `Formats.formats` | `Formats` 的键直接就是格式对象 |
| `Canvas.canvas` / `Canvas.renderer` | `Canvas` 上**没有** canvas/renderer 相关键 |
| `Project.new(...)` | 应为 **`newProject(Formats.free)`** |

### 3.3 截图（see）的正确路径

1. DOM 里确实有 canvas（`document.querySelectorAll("canvas").length === 1`），但**未建工程时尺寸是 0x0**。
2. 正确顺序：**先 `newProject(Formats.free)` → 加内容 → canvas 获得尺寸 → 再截图**。
3. `Canvas` 上没有 renderer 句柄，渲染器不挂在 Canvas 上，需二次定位。

---

## 4. 修复清单

1. `project.new` 改成调全局 **`newProject(Formats[format])`**；格式名从 `Object.keys(Formats)` 取。
2. `history` / `txn` 把所有 `Undo` 换成 **`UndoSystem`**；先确认 initEdit/finishEdit/undo 是在 prototype 还是模块内单例。
3. `see`：先确保有工程（必要时自动 `newProject(Formats.free)` 兜底），再走 DOM canvas `toDataURL`；取不到就报可读错误（现有逻辑已具备）。
4. `cube.add` 等：用 CDP 现场试一行确认 `Cube` 构造与 `init()/addTo()` 在 5.2.2 的真实签名，最快。
5. 在 health 里加 `api_probe` 字段回传这些 typeof 结果，以后换版本能一次看出 API 漂移。

---

## 5. 可复现步骤（本机）

```text
1. 建测试 user-data-dir，启动前预置 plugin_permissions.json：
   {"rtveh":{"allowed":{"net":true}},"bb_bridge":{"allowed":{"net":true}}}
2. Blockbench.exe --user-data-dir=D:\netmcmod\.cache\bb-live --remote-debugging-port=9333
3. 取 CDP page 的 webSocketDebuggerUrl
4. Runtime.evaluate 执行：
   var p = new BBPlugin({id:"rtveh",name:"rtveh",title:"rtveh",author:"t",description:"d",version:"0.2.0",variant:"desktop"});
   p.loadFromFile({path:"<插件绝对路径>"}, false);
5. 127.0.0.1:9878 变为 LISTENING 即通道就绪
6. python probe.py health / ops
```

> 实测踩到的三个坑：
> a. 插件**不会**自动加载目录里的 .js；
> b. `loadFromFile` 收 `{path}` 对象不是字符串，且会把 `this.id` 改成文件名派生值（vehicle 文件名要和权限表 id 对应）；
> c. 权限文件只在启动时读；启动后改会弹权限框并**卡死渲染进程**（CDP 超时、端口 CLOSED）。