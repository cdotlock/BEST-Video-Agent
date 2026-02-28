#!/bin/bash

# 从项目 .env 文件生成 FC 函数所需的环境变量配置
# 用法: ./generate-env-config.sh [generate-image|generate-video|all]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 读取 .env 文件中的值
get_env_value() {
    local key=$1
    if [ -f "$ENV_FILE" ]; then
        grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2-
    fi
}

# 生成 generate-image 函数的环境变量
generate_image_env() {
    echo ""
    echo "================================================"
    echo "  generate-image 函数环境变量配置"
    echo "================================================"
    echo ""
    echo "请在阿里云 FC 控制台的「函数配置」->「环境变量」中添加以下配置："
    echo ""
    echo "OSS_REGION=$(get_env_value 'OSS_REGION')"
    echo "OSS_ACCESS_KEY_ID=$(get_env_value 'OSS_ACCESS_KEY_ID')"
    echo "OSS_ACCESS_KEY_SECRET=$(get_env_value 'OSS_ACCESS_KEY_SECRET')"
    echo "OSS_BUCKET=$(get_env_value 'OSS_BUCKET')"
    echo ""
    echo "# 以下为可选配置（也可通过请求参数传入）"
    echo "GEMINI_BASE_URL=$(get_env_value 'OPENAI_BASE_URL')"
    echo "GEMINI_API_KEY=$(get_env_value 'OPENAI_API_KEY')"
    echo "GEMINI_MODEL=google/gemini-3-pro-image-preview"
    echo ""
}

# 生成 generate-video 函数的环境变量
generate_video_env() {
    echo ""
    echo "================================================"
    echo "  generate-video 函数环境变量配置"
    echo "================================================"
    echo ""
    echo "请在阿里云 FC 控制台的「函数配置」->「环境变量」中添加以下配置："
    echo ""
    echo "OSS_REGION=$(get_env_value 'OSS_REGION')"
    echo "OSS_ACCESS_KEY_ID=$(get_env_value 'OSS_ACCESS_KEY_ID')"
    echo "OSS_ACCESS_KEY_SECRET=$(get_env_value 'OSS_ACCESS_KEY_SECRET')"
    echo "OSS_BUCKET=$(get_env_value 'OSS_BUCKET')"
    echo "JIMENG_ACCESS_KEY_ID=$(get_env_value 'JIMENG_ACCESS_KEY_ID')"
    echo "JIMENG_SECRET_ACCESS_KEY=$(get_env_value 'JIMENG_SECRET_ACCESS_KEY')"
    echo ""
}

# 生成 JSON 格式配置（可直接粘贴到 FC 控制台）
generate_json_config() {
    local func_name=$1
    
    echo ""
    echo "================================================"
    echo "  $func_name JSON 格式配置（可直接导入）"
    echo "================================================"
    echo ""
    
    if [ "$func_name" = "generate-image" ]; then
        cat << EOF
{
  "OSS_REGION": "$(get_env_value 'OSS_REGION')",
  "OSS_ACCESS_KEY_ID": "$(get_env_value 'OSS_ACCESS_KEY_ID')",
  "OSS_ACCESS_KEY_SECRET": "$(get_env_value 'OSS_ACCESS_KEY_SECRET')",
  "OSS_BUCKET": "$(get_env_value 'OSS_BUCKET')",
  "GEMINI_BASE_URL": "$(get_env_value 'OPENAI_BASE_URL')",
  "GEMINI_API_KEY": "$(get_env_value 'OPENAI_API_KEY')",
  "GEMINI_MODEL": "google/gemini-3-pro-image-preview"
}
EOF
    elif [ "$func_name" = "generate-video" ]; then
        cat << EOF
{
  "OSS_REGION": "$(get_env_value 'OSS_REGION')",
  "OSS_ACCESS_KEY_ID": "$(get_env_value 'OSS_ACCESS_KEY_ID')",
  "OSS_ACCESS_KEY_SECRET": "$(get_env_value 'OSS_ACCESS_KEY_SECRET')",
  "OSS_BUCKET": "$(get_env_value 'OSS_BUCKET')",
  "JIMENG_ACCESS_KEY_ID": "$(get_env_value 'JIMENG_ACCESS_KEY_ID')",
  "JIMENG_SECRET_ACCESS_KEY": "$(get_env_value 'JIMENG_SECRET_ACCESS_KEY')"
}
EOF
    fi
    echo ""
}

# 主函数
main() {
    local target=${1:-all}

    if [ ! -f "$ENV_FILE" ]; then
        log_error "未找到 .env 文件: $ENV_FILE"
        log_warn "请先在项目根目录创建 .env 文件"
        exit 1
    fi

    log_info "从 $ENV_FILE 读取配置..."

    case $target in
        generate-image)
            generate_image_env
            generate_json_config "generate-image"
            ;;
        generate-video)
            generate_video_env
            generate_json_config "generate-video"
            ;;
        all)
            generate_image_env
            generate_json_config "generate-image"
            generate_video_env
            generate_json_config "generate-video"
            ;;
        *)
            log_error "未知目标: $target"
            echo "用法: $0 [generate-image|generate-video|all]"
            exit 1
            ;;
    esac
}

main "$@"
