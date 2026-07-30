# Python Editor + AI Agent

一个基于 React + Monaco Editor 的类 VSCode 在线 Python 代码编辑器，集成 AI 代码助手功能。

## 项目简介

本项目是一个 BS 架构的 Web 应用，实现了类似 VSCode 的 Python 代码编辑器，支持语法高亮、代码补全、错误标记、多标签编辑等功能，并集成了 AI 对话助手，可以通过自然语言指令让 AI 帮助修改代码。

## 功能特性

### 编辑器功能

| 功能 | 说明 |
|------|------|
| **Python 语法高亮** | 支持 Python 代码语法着色 |
| **行号显示** | 显示行号，可设置开关 |
| **代码折叠** | 支持函数、类等代码块折叠 |
| **Minimap** | 右侧代码缩略图导航 |
| **搜索** | Ctrl+F 搜索代码 |
| **错误标记** | 自动检测语法错误，红色波浪线标记 |
| **悬停提示** | 鼠标悬停显示函数/变量信息 |
| **自动补全** | 基于 jedi 的智能代码补全 |
| **代码跳转** | F12 跳转到定义 |
| **代码格式化** | Shift+Alt+F 格式化代码 |
| **多 Tab 编辑** | 同时编辑多个文件 |
| **自动保存** | 编辑后自动保存 |

### 文件管理功能

| 功能 | 说明 |
|------|------|
| **目录树** | 左侧显示 workspace 目录 |
| **新建文件** | 右键菜单新建文件 |
| **重命名** | 右键菜单重命名文件 |
| **删除** | 右键菜单删除文件 |
| **多选删除** | 勾选多个文件批量删除 |

### AI Agent 功能

| 功能 | 说明 |
|------|------|
| **多轮对话** | 与 AI 进行多轮对话 |
| **代码修改** | 通过自然语言指令修改代码 |
| **Diff 展示** | 显示修改前后的代码对比 |
| **撤回操作** | 一键撤回 AI 修改 |

### 设置功能

| 设置项 | 说明 |
|--------|------|
| 主题 | VS Code 深色/浅色/高对比度 |
| 字体大小 | 8-32 |
| Tab 缩进 | 2/4/8 空格 |
| Minimap 显示 | 开启/关闭 |
| 行号显示 | 开启/关闭 |
| 自动换行 | 关闭/开启 |
| 自动保存 | 开启/关闭 |
| 保存时格式化 | 开启/关闭 |

## 技术栈

### 前端
- **React 19** - UI 框架
- **Vite** - 构建工具
- **Monaco Editor** - 代码编辑器
- **Ant Design 6** - UI 组件库
- **Axios** - HTTP 请求库

### 后端
- **Node.js** - 运行环境
- **Express 5** - Web 框架
- **fs-extra** - 文件系统操作
- **jedi** (Python) - Python 代码分析

### AI
- **DeepSeek API** - 大模型接口

## 项目结构

```
成都潜在人工智能公司面试题/
├── frontend/                # 前端项目
│   ├── src/
│   │   └── App.jsx         # 主组件
│   ├── package.json
│   └── vite.config.js
├── backend/                 # 后端项目
│   ├── index.js            # 服务入口
│   ├── jedi_oneshot.py     # jedi 分析脚本
│   ├── jedi_http.py        # jedi HTTP 服务
│   ├── jedi_server.py      # jedi 进程服务
│   └── package.json
├── workspace/               # 工作目录
│   ├── main.py             # 示例文件
│   ├── utils.py            # 示例文件
│   └── .editor-settings.json # 编辑器设置
└── README.md
```

## 快速开始

### 环境要求
- Node.js 18+
- Python 3.8+（含 jedi 库）
- npm 或 yarn

### 安装依赖

```bash
# 安装前端依赖
cd frontend
npm install

# 安装后端依赖
cd ../backend
npm install

# 安装 Python jedi 库
pip install jedi black autopep8
```

### 配置环境变量

在系统环境变量中设置：
```
DEEPSEEK_API_KEY=your_api_key_here
```

### 启动服务

```bash
# 启动后端（在 backend 目录）
cd backend
node index.js

# 启动前端（在 frontend 目录）
cd frontend
npm run dev
```

### 访问应用

打开浏览器访问：http://localhost:5173/

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+S | 保存文件 |
| Shift+Alt+F | 格式化代码 |
| Ctrl+F | 搜索 |
| F12 | 跳转到定义 |
| Ctrl+Space | 触发补全 |
| Ctrl+Z | 撤销 |

## API 接口

### 文件操作
- `GET /api/files` - 获取文件列表
- `GET /api/file?path=` - 读取文件内容
- `POST /api/save` - 保存文件
- `POST /api/files/new` - 新建文件
- `PUT /api/files/rename` - 重命名文件
- `DELETE /api/files/delete` - 删除文件

### 代码分析
- `POST /api/validate` - 语法检查
- `POST /api/complete` - 代码补全
- `POST /api/hover` - 悬停提示
- `POST /api/goto` - 代码跳转
- `POST /api/format` - 代码格式化

### AI Agent
- `POST /api/agent` - AI 对话

### 设置
- `GET /api/settings` - 获取设置
- `POST /api/settings` - 保存设置

## 开发说明

### 添加新功能
1. 后端：在 `backend/index.js` 添加新接口
2. 前端：在 `frontend/src/App.jsx` 调用接口

### 代码风格
- 前端：React Hooks + 函数组件
- 后端：Express 中间件模式
- 注释：中文注释

## 许可证

MIT License

## 作者

影梦