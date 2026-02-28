/**
 * Built-in Skill: video-mgr
 *
 * 标准 SKILL.md 格式（YAML frontmatter + Markdown body）以字符串形式内嵌。
 * 由 builtins/index.ts 统一加载解析。
 */
export const raw = `---
name: video-mgr
description: Generate images and videos via FC (Function Compute) multimodal services. Use when asked to create, generate, or produce images or videos.
tags:
  - core
  - multimodal
  - image
  - video
requires_mcps:
  - video_mgr
---
# 多模态生成服务（video-mgr）

## 概述

系统内置两个多模态生成 tool，通过 FC（阿里云函数计算）后端实现：

- \`video_mgr__generate_image\` — 文生图
- \`video_mgr__generate_video\` — 图生视频

两者共用同一组 FC 环境变量，无需额外端口或外部服务。返回的 URL 均为永久 OSS 地址，可直接使用。

## 工具详情

### generate_image — 文生图（带生命周期管理）

从文本 prompt 生成图片，返回永久 OSS URL。每次调用都会记录 prompt、URL 和版本历史，支持用户脱离 LLM 独立重新生成、回滚和修改 prompt。

**参数**：
- \`key\`（必填）— 图片的语义唯一标识，session 内唯一。使用同一个 key 再次调用会创建新版本而非新图片。
- \`prompt\`（必填）— 描述要生成的图片内容
- \`referenceImageUrls\`（可选）— 参考图 URL 数组，用于风格或内容引导

**key 命名规范**：
- 角色立绘：\`char_{name}_portrait\`（如 \`char_alice_portrait\`）
- 场景空镜：\`scene_{n}_bg\`（如 \`scene_1_bg\`）
- 分镜图：\`shot_{scene}_{shot}\`（如 \`shot_1_3\`）
- 换装立绘：\`costume_{name}_{ep}\`（如 \`costume_alice_ep1\`）
- 其他：使用描述性英文，用下划线连接

**重要**：生成前检查上下文中的 Image Registry 段，如果目标 key 已存在且图片满足需求，无需重复生成。

**示例**：

\\\`\\\`\\\`json
{
  "items": [{
    "key": "char_alice_portrait",
    "prompt": "一个穿着蓝色连衣裙的少女站在樱花树下，动漫风格，高清",
    "referenceImageUrls": ["https://example.com/style-ref.jpg"]
  }]
}
\\\`\\\`\\\`

**返回**：
\\\`\\\`\\\`json
[{ "index": 0, "status": "ok", "key": "char_alice_portrait", "imageUrl": "https://oss.../generated.png", "version": 1 }]
\\\`\\\`\\\`

### generate_video — 图生视频

将一张静态图片 + 运动描述 prompt 生成短视频，返回永久 OSS URL。

**参数**：
- \`imageUrl\`（必填）— 源图片 URL（通常是 generate_image 的输出）
- \`prompt\`（必填）— 描述期望的动画/运动效果

**示例**：

\\\`\\\`\\\`json
{
  "imageUrl": "https://oss-cn-shanghai.aliyuncs.com/xxx/generated.png",
  "prompt": "樱花花瓣缓缓飘落，少女的头发在微风中轻轻飘动"
}
\\\`\\\`\\\`

**返回**：
\\\`\\\`\\\`json
{ "videoUrl": "https://oss-cn-shanghai.aliyuncs.com/xxx/generated.mp4" }
\\\`\\\`\\\`

## 典型工作流

### 文生图 → 图生视频

1. 调用 \`video_mgr__generate_image\` 生成图片
2. 调用 \`video_mgr__generate_video\`，传入上一步返回的 \`imageUrl\` + 运动 prompt

### 批量生成

需要生成多张图片时，在同一次 generate_image 调用的 items 数组中传入多个条目。每个条目都需要独立的 key。

### Image Registry

系统会自动在上下文中注入 \`## Image Registry\` 段，列出当前 session 所有已生成的图片及其最新状态（key、prompt、url、版本号）。

- 生成前先检查 Image Registry，避免对已有且满意的图片重复生成
- 用户可能通过 UI 直接修改 prompt、重新生成或回滚图片版本，这些操作会以 \`[系统通知]\` 形式出现在对话中
- 看到 \`[系统通知]\` 时，以 Image Registry 中的最新状态为准

## Prompt 编写建议

### 图片 Prompt

- 明确描述主体、场景、风格、画质
- 中英文均可，推荐使用中文描述场景 + 英文描述风格关键词
- 善用参考图（referenceImageUrls）统一画风

### 视频 Prompt

- 描述运动而非静态画面（"花瓣飘落"而非"有花瓣"）
- 动作幅度不宜过大，适合微动效果（头发飘动、光影变化、水面波纹）
- 视频时长固定，无法指定

## 环境配置

需要在 \`.env\` 中配置以下变量（与 video-mgr 项目共用）：

- \`FC_GENERATE_IMAGE_URL\` — FC 图像生成函数 URL
- \`FC_GENERATE_IMAGE_TOKEN\` — FC 图像生成函数 Token
- \`FC_GENERATE_VIDEO_URL\` — FC 视频生成函数 URL
- \`FC_GENERATE_VIDEO_TOKEN\` — FC 视频生成函数 Token

未配置时调用会返回明确错误提示，不会崩溃。

## 约束

- 不支持纯文生视频（必须先有图片）
- 不支持视频编辑或拼接，每次调用生成独立短视频
- FC 函数有超时限制，超大图片或复杂 prompt 可能失败
`;
