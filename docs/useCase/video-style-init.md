# Use Case: Video 风格初始化链路

目标：验证“参考图搜索 → 提示词反推 → style_profile 持久化与读取”闭环。

> 所有命令建议加 `-v`，并将完整报文保存到 `temp/`。

## 1) 搜索参考图

```bash
curl -v "http://localhost:8001/api/video/style/search?q=cinematic%20portrait&limit=3"
```

期望：返回 `items[]`，每项含 `url`，可选 `title/source/thumbnailUrl`。

## 2) 反推提示词

```bash
curl -v -X POST "http://localhost:8001/api/video/style/reverse" \
  -H 'Content-Type: application/json' \
  -d '{
    "styleGoal": "clean cinematic portrait",
    "references": [{"url": "https://example.com/ref.jpg", "title": "sample"}],
    "constraints": ["high contrast", "35mm lens"]
  }'
```

期望：返回 `reversePrompt` 与 `negativePrompt`。

## 3) 保存 style_profile

```bash
curl -v -X PUT "http://localhost:8001/api/video/episodes/{scriptId}/style-profile" \
  -H 'Content-Type: application/json' \
  -d '{
    "styleGoal": "clean cinematic portrait",
    "referenceImages": [{"url": "https://example.com/ref.jpg", "title": "sample"}],
    "reversePrompt": "Target style: clean cinematic portrait ...",
    "negativePrompt": "low resolution, blurry details",
    "constraints": ["high contrast", "35mm lens"],
    "confirmed": true
  }'
```

期望：返回 `profile.version >= 1`。

## 4) 读取 style_profile

```bash
curl -v "http://localhost:8001/api/video/episodes/{scriptId}/style-profile"
```

期望：返回 `styleProfile.profile.confirmed=true`；重复保存后 `version` 递增。

## 5) 验证任务注入生效

```bash
curl -v -X POST "http://localhost:8001/api/video/tasks"   -H 'Content-Type: application/json'   -d '{
    "message": "基于当前风格给我生成第一镜 storyboard",
    "video_context": {"novelId": "{novelId}", "scriptKey": "{scriptKey}"},
    "user": "test"
  }'
```

期望：任务事件流中的工具调用和结果描述能够体现已保存的 style_profile 约束；更新 style_profile 后再次发任务，行为随之变化。
