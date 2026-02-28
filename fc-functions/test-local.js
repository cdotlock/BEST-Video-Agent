// 本地测试 FC 函数
// 用法: node test-local.js [generate-image|generate-video]

const path = require('path')
const fs = require('fs')

// 从 .env 文件加载环境变量
function loadEnv(envPath) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    content.split('\n').forEach(line => {
      line = line.trim()
      if (line && !line.startsWith('#')) {
        const [key, ...values] = line.split('=')
        if (key && values.length > 0) {
          process.env[key.trim()] = values.join('=').trim()
        }
      }
    })
    console.log(`✓ 已加载环境变量: ${envPath}`)
  }
}

async function testGenerateImage() {
  const funcDir = path.join(__dirname, 'generate-image')
  loadEnv(path.join(funcDir, '.env'))
  
  const { handler } = require(path.join(funcDir, 'index.js'))
  
  // 模拟 FC HTTP 请求
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      prompt: '参考图片的风格，生成一只可爱的小狗',
      referenceImageUrls: [
        'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1768127789794-imad1.png'
      ]
    }),
    isBase64Encoded: false
  }
  
  console.log('\n测试 generate-image 函数...')
  console.log('请求:', JSON.parse(event.body))
  
  try {
    const result = await handler(event, {})
    console.log('\n响应状态:', result.statusCode)
    console.log('响应内容:', JSON.parse(result.body))
  } catch (error) {
    console.error('错误:', error)
  }
}

async function testGenerateVideo() {
  const funcDir = path.join(__dirname, 'generate-video')
  loadEnv(path.join(funcDir, '.env'))
  
  const { handler } = require(path.join(funcDir, 'index.js'))
  
  // 模拟 FC HTTP 请求 - 仅提交任务（不等待完成）
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      action: 'CVSync2AsyncSubmitTask',
      image_urls: [
        'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1768127789794-imad1.png',
        'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1768127789794-imad1.png'
      ],
      prompt: '微风轻拂',
      seed: -1,
      frames: 121
    }),
    isBase64Encoded: false
  }
  
  console.log('\n测试 generate-video 函数...')
  console.log('请求:', JSON.parse(event.body))
  
  try {
    const result = await handler(event, {})
    console.log('\n响应状态:', result.statusCode)
    console.log('响应内容:', JSON.parse(result.body))
  } catch (error) {
    console.error('错误:', error)
  }
}

// 主函数
async function main() {
  const target = process.argv[2] || 'generate-image'
  
  console.log('='.repeat(50))
  console.log(`本地测试: ${target}`)
  console.log('='.repeat(50))
  
  if (target === 'generate-image') {
    await testGenerateImage()
  } else if (target === 'generate-video') {
    await testGenerateVideo()
  } else {
    console.log('用法: node test-local.js [generate-image|generate-video]')
  }
}

main().catch(console.error)
