# MC Atelier

MC Atelier 是一个 DSH 插件，为 Blockbench Minecraft 建模与像素纹理工作流提供本地检查工具、结构校验、生成起点和两份可按需调用的技能指南。

## 能力

- `mc_bbmodel_inspect`：汇总几何、层级、旋转、UV 覆盖、纹理尺寸与统计信息。
- `mc_bbmodel_validate`：检查 UUID、outliner 引用、几何范围、纹理引用、PNG 解码和 UV 图集边界。
- `mc_texture_analyze`：统计 PNG 的透明度、可见色、亮度、邻色对比和逻辑 UV 缩放。
- `mc_bbmodel_create`：按 JSON cuboid 规格创建新的 `.bbmodel`，使用独占创建，不覆盖现有文件。
- 两项 DSH 技能：`mc-blockbench-modeling` 与 `mc-pixel-textures`。
- CLI 支持 `inspect`、`validate`、`texture`、`create` 和本地 `catalog`。

生成器创建的是可在 Blockbench 中继续编辑的 Bedrock 风格 `.bbmodel` 起点，不是完整游戏资源包，也不会代替目标版本的导出和游戏内检查。

## 安装

在插件目录运行：

```text
dsh plugin --profile web add .
```

将 `web` 换成要安装到的 DSH profile。启动该 profile 后，技能和工具由插件注册。

## CLI 示例

```text
node bin/mc-atelier.js inspect path/to/model.bbmodel
node bin/mc-atelier.js validate path/to/model.bbmodel
node bin/mc-atelier.js texture path/to/atlas.png --logical 16 16
node bin/mc-atelier.js create examples/creature.json C:/output/new-creature.bbmodel
node bin/mc-atelier.js catalog path/to/local-models C:/output/local-catalog.json
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
