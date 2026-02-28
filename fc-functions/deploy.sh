#!/bin/bash

# 阿里云FC函数部署脚本
# 用法: ./deploy.sh [generate-image|generate-video|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必要工具
check_requirements() {
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装"
        exit 1
    fi

    if ! command -v zip &> /dev/null; then
        log_error "zip 未安装"
        exit 1
    fi

    # 检查ossutil是否安装（可选）
    if ! command -v ossutil &> /dev/null; then
        log_warn "ossutil 未安装，将跳过自动上传到OSS"
        log_warn "请手动上传 build/*.zip 到 OSS"
        HAS_OSSUTIL=false
    else
        HAS_OSSUTIL=true
    fi
}

# 打包单个函数
build_function() {
    local func_name=$1
    local func_dir="$SCRIPT_DIR/$func_name"
    local output_file="$BUILD_DIR/$func_name.zip"

    if [ ! -d "$func_dir" ]; then
        log_error "函数目录不存在: $func_dir"
        return 1
    fi

    log_info "正在构建 $func_name..."

    # 进入函数目录
    cd "$func_dir"

    # 清理旧的 node_modules
    if [ -d "node_modules" ]; then
        log_info "清理旧的 node_modules..."
        rm -rf node_modules
    fi

    # 安装依赖
    log_info "安装依赖..."
    npm install --production --silent

    # 打包 - 在代码目录内直接打包（包含 node_modules，排除 .env）
    log_info "打包中..."
    mkdir -p "$BUILD_DIR"
    rm -f "$output_file"
    # 使用 -y 保留符号链接，排除 .env 文件
    zip -rq -y "$output_file" ./ -x "*.env*"

    log_info "构建完成: $output_file"

    # 显示文件大小
    local size=$(du -h "$output_file" | cut -f1)
    log_info "文件大小: $size"

    cd "$SCRIPT_DIR"
}

# 上传到OSS
upload_to_oss() {
    local func_name=$1
    local zip_file="$BUILD_DIR/$func_name.zip"

    if [ "$HAS_OSSUTIL" != "true" ]; then
        return 0
    fi

    if [ -z "$FC_OSS_BUCKET" ]; then
        log_warn "FC_OSS_BUCKET 未设置，跳过上传"
        return 0
    fi

    local oss_path="oss://$FC_OSS_BUCKET/fc-functions/$func_name.zip"

    log_info "上传到 OSS: $oss_path"
    ossutil cp "$zip_file" "$oss_path" -f

    log_info "上传完成！"
    echo ""
    echo "================================================"
    echo "OSS 路径: $oss_path"
    echo "================================================"
}

# 显示部署说明
show_deploy_guide() {
    local func_name=$1

    echo ""
    echo "================================================"
    echo "          阿里云 FC 配置指南 - $func_name"
    echo "================================================"
    echo ""
    echo "1. 登录阿里云函数计算控制台"
    echo "   https://fcnext.console.aliyun.com/"
    echo ""
    echo "2. 创建服务（如果还没有）"
    echo "   - 服务名称: video-mgr 或自定义"
    echo "   - 日志功能: 建议开启"
    echo ""
    echo "3. 创建函数"
    echo "   - 函数名称: $func_name"
    echo "   - 运行环境: Node.js 18"
    echo "   - 代码上传方式: 通过 OSS 上传"
    echo "   - OSS Bucket: 选择包含 fc-functions/$func_name.zip 的 bucket"
    echo "   - 请求处理程序: index.handler"
    echo ""
    echo "4. 配置函数"
    echo "   - 内存规格: 建议 1024MB 或更高"
    echo "   - 执行超时时间: 图片300秒，视频600秒"
    echo "   - 实例并发度: 根据需求设置"
    echo ""
    echo "5. 配置环境变量"

    if [ "$func_name" = "generate-image" ]; then
        echo "   OSS_REGION=cn-hangzhou"
        echo "   OSS_ACCESS_KEY_ID=<your-key-id>"
        echo "   OSS_ACCESS_KEY_SECRET=<your-key-secret>"
        echo "   OSS_BUCKET=<your-bucket>"
        echo "   GEMINI_BASE_URL=<optional>"
        echo "   GEMINI_API_KEY=<optional>"
    elif [ "$func_name" = "generate-video" ]; then
        echo "   OSS_REGION=cn-hangzhou"
        echo "   OSS_ACCESS_KEY_ID=<your-key-id>"
        echo "   OSS_ACCESS_KEY_SECRET=<your-key-secret>"
        echo "   OSS_BUCKET=<your-bucket>"
        echo "   JIMENG_ACCESS_KEY_ID=<your-jimeng-key>"
        echo "   JIMENG_SECRET_ACCESS_KEY=<your-jimeng-secret>"
    fi

    echo ""
    echo "6. 创建触发器"
    echo "   - 触发器类型: HTTP触发器"
    echo "   - 认证方式: 无需认证（或根据需要配置）"
    echo "   - 请求方法: POST, OPTIONS"
    echo ""
    echo "7. 获取函数URL"
    echo "   触发器创建后，会生成一个公网访问地址"
    echo "   格式: https://<account-id>.<region>.fc.aliyuncs.com/2016-08-15/proxy/<service>/<function>/"
    echo ""
    echo "================================================"
}

# 主函数
main() {
    local target=${1:-all}

    log_info "开始部署 FC 函数..."

    check_requirements

    case $target in
        generate-image)
            build_function "generate-image"
            upload_to_oss "generate-image"
            show_deploy_guide "generate-image"
            ;;
        generate-video)
            build_function "generate-video"
            upload_to_oss "generate-video"
            show_deploy_guide "generate-video"
            ;;
        all)
            build_function "generate-image"
            build_function "generate-video"
            upload_to_oss "generate-image"
            upload_to_oss "generate-video"
            show_deploy_guide "generate-image"
            show_deploy_guide "generate-video"
            ;;
        *)
            log_error "未知目标: $target"
            echo "用法: $0 [generate-image|generate-video|all]"
            exit 1
            ;;
    esac

    log_info "部署脚本执行完成！"
}

main "$@"
