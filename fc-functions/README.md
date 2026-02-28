# 阿里云函数计算 (FC) 部署指南

本目录包含两个阿里云函数计算函数，用于执行图片生成和视频生成任务。

## 目录结构

```
fc-functions/
├── generate-image/       # 图片生成函数
│   ├── index.js          # 函数入口
│   ├── package.json      # 依赖配置
│   └── .env.example      # 环境变量示例
├── generate-video/       # 视频生成函数
│   ├── index.js          # 函数入口
│   ├── package.json      # 依赖配置
│   └── .env.example      # 环境变量示例
├── deploy.sh             # 打包部署脚本
├── build/                # 构建输出目录（自动生成）
└── README.md             # 本文档
```

## 快速开始

### 1. 打包函数

```bash
cd fc-functions

# 打包所有函数
./deploy.sh all

# 或单独打包
./deploy.sh generate-image
./deploy.sh generate-video
```

构建完成后，zip 包位于 `build/` 目录下。打包内容包含 `index.js`、`package.json` 和 `node_modules/`。

### 1.5 生成环境变量配置

```bash
# 从项目 .env 文件生成 FC 所需的环境变量配置
./generate-env-config.sh all

# 或单独生成
./generate-env-config.sh generate-image
./generate-env-config.sh generate-video
```

该脚本会读取项目根目录的 `.env` 文件，生成可以直接复制到 FC 控制台的环境变量配置（包括 JSON 格式）。

### 2. 上传到 OSS

#### 方式一：手动上传
1. 登录阿里云 OSS 控制台
2. 选择一个 bucket（建议与 FC 同一地域）
3. 上传 `build/generate-image.zip` 和 `build/generate-video.zip`

#### 方式二：使用 ossutil 自动上传
```bash
# 设置环境变量
export FC_OSS_BUCKET=your-bucket-name

# 运行部署脚本
./deploy.sh all
```

### 3. 在阿里云控制台创建函数

#### 创建服务

1. 访问 [阿里云函数计算控制台](https://fcnext.console.aliyun.com/)
2. 点击「创建服务」
3. 填写服务名称，如 `video-mgr`
4. 开启日志功能（推荐）

#### 创建 generate-image 函数

1. 在服务下点击「创建函数」
2. 基础配置：
   - 函数名称：`generate-image`
   - 运行环境：`Node.js 18`
   - 请求处理程序：`index.handler`
3. 代码配置：
   - 代码上传方式：`通过 OSS 上传`
   - 选择上传的 `generate-image.zip` 文件
4. 函数配置：
   - 内存规格：`1024 MB`（推荐更高，如 2048 MB）
   - 执行超时时间：`300 秒`
   - 实例并发度：`10`（根据需求调整）
5. 高级配置-环境变量：
   ```
   OSS_REGION=cn-hangzhou
   OSS_ACCESS_KEY_ID=<your-key-id>
   OSS_ACCESS_KEY_SECRET=<your-key-secret>
   OSS_BUCKET=<your-bucket>
   GEMINI_BASE_URL=<optional-可通过请求参数传入>
   GEMINI_API_KEY=<optional-可通过请求参数传入>
   ```

#### 创建 generate-video 函数

1. 在服务下点击「创建函数」
2. 基础配置：
   - 函数名称：`generate-video`
   - 运行环境：`Node.js 18`
   - 请求处理程序：`index.handler`
3. 代码配置：
   - 代码上传方式：`通过 OSS 上传`
   - 选择上传的 `generate-video.zip` 文件
4. 函数配置：
   - 内存规格：`1024 MB`
   - 执行超时时间：`600 秒`（视频生成需要较长时间）
   - 实例并发度：`5`（根据需求调整）
5. 高级配置-环境变量：
   ```
   OSS_REGION=cn-hangzhou
   OSS_ACCESS_KEY_ID=<your-key-id>
   OSS_ACCESS_KEY_SECRET=<your-key-secret>
   OSS_BUCKET=<your-bucket>
   JIMENG_ACCESS_KEY_ID=<your-jimeng-key>
   JIMENG_SECRET_ACCESS_KEY=<your-jimeng-secret>
   ```

#### 创建 HTTP 触发器

为每个函数创建 HTTP 触发器：

1. 进入函数详情页
2. 点击「触发器」->「创建触发器」
3. 配置：
   - 触发器类型：`HTTP 触发器`
   - 名称：`http-trigger`
   - 认证方式：`无需认证`（或根据安全需求选择）
   - 请求方法：勾选 `POST` 和 `OPTIONS`
4. 创建后获取函数 URL

### 4. 配置实例规格（高带宽）

FC 支持配置更高的网络带宽，适合下载大文件场景：

1. 进入函数配置
2. 高级配置 -> 实例规格
3. 选择「弹性实例」或「GPU 实例」
4. 配置网络带宽（最高可达 10Gbps）

## API 使用说明

### generate-image 函数

**请求**
```json
POST /
{
  "prompt": "生成图片的提示词，可包含参考图片URL",
  "baseURL": "可选，Gemini API baseURL",
  "apiKey": "可选，Gemini API key",
  "model": "可选，默认 google/gemini-3-pro-image-preview"
}
```

**响应**
```json
{
  "result": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/public/image/xxx.png"
}
```

### generate-video 函数

支持三种模式：

#### 模式1：完整生成（推荐）
```json
POST /
{
  "action": "generate",
  "imageUrl": "输入图片的URL",
  "prompt": "视频描述提示词"
}
```

响应：
```json
{
  "result": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/public/video/xxx.mp4"
}
```

#### 模式2：仅提交任务
```json
POST /
{
  "action": "CVSync2AsyncSubmitTask",
  "image_urls": ["url1", "url2"],
  "prompt": "视频描述",
  "seed": -1,
  "frames": 121
}
```

#### 模式3：仅查询任务
```json
POST /
{
  "action": "CVSync2AsyncGetResult",
  "task_id": "任务ID"
}
```

## 在客户端集成 FC

在项目中使用 FC 函数，可以在 apiConfig 中添加 FC endpoint 配置：

```typescript
// src/types/apiConfig.ts
interface FCConfig {
  generateImageUrl: string
  generateVideoUrl: string
}

// 调用示例
const response = await fetch(fcConfig.generateImageUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: '...',
    baseURL: '...',
    apiKey: '...'
  })
})
```

## 成本优化建议

1. **按量付费**：FC 按实际执行时间和内存计费，适合不规则负载
2. **预留实例**：如果有稳定负载，可配置预留实例降低成本
3. **内存优化**：根据实际使用调整内存配置
4. **并发控制**：通过实例并发度控制并发成本

## 故障排查

### 查看日志
1. 进入函数详情页
2. 点击「日志」查看执行日志
3. 或使用日志服务 SLS 查询详细日志

### 常见问题

**Q: 函数执行超时**
A: 增加执行超时时间，视频生成建议 600 秒以上

**Q: 内存不足**
A: 增加内存配置，处理大图片建议 2048 MB

**Q: 网络下载慢**
A: 配置更高带宽的实例规格

**Q: CORS 错误**
A: 函数已内置 CORS 处理，确保返回了正确的 headers
