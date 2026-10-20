# Changelog

本文件记录每个版本的**实测数据**，不是承诺。

## v0.4.0

效率版，思路来自 `dsh-blender-plugin` v2.3 的直连设计（持久内核 / 通用逃生口 / 本地目录 / 图像去重）。

1. **`mc_live_eval`**（新）—— 在 Blockbench 内执行任意 JS，持久内核 `K` 跨调用保留，可把常用的建模辅助函数存进去复用。解决了"固定 op 覆盖不到就只能改插件"的问题。
2. **`mc_live_ops` 改为本地目录** —— 15 个 op 带 `op / args / use / avoid`，**零往返**；`live=true` 才问 Blockbench。
3. **`mc_live_see` 加 `max_size` 与字节级去重** —— 长边上限替代手算宽高；与上一帧 sha256 相同时返回 `reused:true` 复用旧路径，`force=true` 强制重写。省 token、省磁盘。
4. 测试 18 → 20（新增本地目录结构、去重指纹）。

## v0.3.1

文档版：新增 `references/modeling-playbook.md`（92 行真机工艺手册），技能补六条操作要点，通道契约补实测限制。

实测来源：一把 58 部件长剑的完整制作过程，踩到的坑全部记录在手册里。

## v0.3.0

直连通道并入主插件：`lib/live.js` 注册 8 个 `mc_live_*` 工具，Blockbench 侧插件随包发布在 `addon/bb-bridge.js`。

实测：`health` / `project.new` / `cube.add ×4` / `state` / `see` 全链路通过；`see` 返回 64,568 字节真图，`variance=255`。

## v0.2.0

首个公开版本。修两个真 bug：

1. 工具 `render` 返回裸字符串，导致**所有**工具调用抛 `content.some is not a function`；改为返回内容块数组。
2. `SKILL.md` frontmatter 解析在 CRLF 检出上必挂；解析前规范化换行。

新增 `UV_SPACE` 与 `UV_BLANK` 校验。实测：一个 58 部件模型 `348` 个活动面、`outOfBounds=0`、`errors=0`。