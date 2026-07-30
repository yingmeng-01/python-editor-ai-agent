const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// 读取 workspace 目录下的文件列表（不递归读取子文件夹）
app.get('/api/files', async (req, res) => {
  try {
    const workspacePath = path.join(__dirname, '..', 'workspace');
    const items = await fs.readdir(workspacePath);
    const files = [];
    for (const item of items) {
      const fullPath = path.join(workspacePath, item);
      const stat = await fs.stat(fullPath);
      files.push({
        name: item,
        type: stat.isDirectory() ? 'directory' : 'file',
        path: fullPath,
      });
    }
    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 读取单个文件内容（限制只能读取 workspace 目录下的文件）
app.get('/api/file', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径参数' });
    }

    const workspacePath = path.resolve(path.join(__dirname, '..', 'workspace'));
    const targetPath = path.resolve(filePath);

    // 安全校验：目标路径必须在 workspace 目录内（Windows 路径不区分大小写）
    const normalizedWorkspace = workspacePath.toLowerCase() + path.sep;
    const normalizedTarget = targetPath.toLowerCase();
    if (!normalizedTarget.startsWith(normalizedWorkspace) && normalizedTarget !== workspacePath.toLowerCase()) {
      return res.status(403).json({ success: false, error: '禁止访问指定目录外的文件' });
    }

    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: '目标路径不是文件' });
    }

    const content = await fs.readFile(targetPath, 'utf-8');
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 保存文件内容（限制只能保存 workspace 目录下的文件）
app.post('/api/save', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径参数' });
    }
    if (content === undefined) {
      return res.status(400).json({ success: false, error: '缺少文件内容参数' });
    }

    const workspacePath = path.resolve(path.join(__dirname, '..', 'workspace'));
    const targetPath = path.resolve(filePath);

    // 安全校验：目标路径必须在 workspace 目录内（Windows 路径不区分大小写）
    const normalizedWorkspace = workspacePath.toLowerCase() + path.sep;
    const normalizedTarget = targetPath.toLowerCase();
    if (!normalizedTarget.startsWith(normalizedWorkspace)) {
      return res.status(403).json({ success: false, error: '禁止写入指定目录外的文件' });
    }

    // 确保目标文件的父目录存在
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content, 'utf-8');
    res.json({ success: true, message: '文件保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 安全校验函数：确保路径在 workspace 目录内
const isPathInWorkspace = (targetPath) => {
  const workspacePath = path.resolve(path.join(__dirname, '..', 'workspace'));
  const resolvedTarget = path.resolve(targetPath);
  const normalizedWorkspace = workspacePath.toLowerCase() + path.sep;
  const normalizedTarget = resolvedTarget.toLowerCase();
  return normalizedTarget.startsWith(normalizedWorkspace) || normalizedTarget === workspacePath.toLowerCase();
};

// 新建文件（限制只能在 workspace 目录内创建）
app.post('/api/files/new', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: '缺少文件名' });
    }

    // 安全校验：文件名不能包含路径分隔符，防止路径遍历
    if (name.includes(path.sep) || name.includes('/') || name.includes('\\') || name.includes('..')) {
      return res.status(400).json({ success: false, error: '文件名不能包含路径字符' });
    }

    const workspacePath = path.resolve(path.join(__dirname, '..', 'workspace'));
    const filePath = path.join(workspacePath, name);

    if (await fs.pathExists(filePath)) {
      return res.status(400).json({ success: false, error: '文件已存在' });
    }
    await fs.writeFile(filePath, '', 'utf-8');
    res.json({ success: true, message: `文件 ${name} 创建成功` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重命名文件（限制只能在 workspace 目录内操作）
app.put('/api/files/rename', async (req, res) => {
  try {
    const { oldPath, newName } = req.body;
    if (!oldPath || !newName) {
      return res.status(400).json({ success: false, error: '缺少参数' });
    }

    // 安全校验：原文件路径必须在 workspace 目录内
    if (!isPathInWorkspace(oldPath)) {
      return res.status(403).json({ success: false, error: '禁止操作指定目录外的文件' });
    }

    // 安全校验：新文件名不能包含路径分隔符
    if (newName.includes(path.sep) || newName.includes('/') || newName.includes('\\') || newName.includes('..')) {
      return res.status(400).json({ success: false, error: '文件名不能包含路径字符' });
    }

    const dir = path.dirname(path.resolve(oldPath));
    const newPath = path.join(dir, newName);

    // 安全校验：新路径也必须在 workspace 目录内
    if (!isPathInWorkspace(newPath)) {
      return res.status(403).json({ success: false, error: '禁止将文件移动到指定目录外' });
    }

    if (await fs.pathExists(newPath)) {
      return res.status(400).json({ success: false, error: '文件名已存在' });
    }
    await fs.rename(oldPath, newPath);
    res.json({ success: true, message: '重命名成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除文件（限制只能删除 workspace 目录内的文件）
app.delete('/api/files/delete', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径' });
    }

    // 安全校验：文件路径必须在 workspace 目录内
    if (!isPathInWorkspace(filePath)) {
      return res.status(403).json({ success: false, error: '禁止删除指定目录外的文件' });
    }

    await fs.remove(filePath);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Agent 接口：接收用户指令，调用大模型 API，返回结构化修改建议
app.post('/api/agent', async (req, res) => {
  try {
    const { userPrompt, fileContent, fileName, forceOperation } = req.body;
    if (!userPrompt) {
      return res.status(400).json({ success: false, error: '缺少用户指令' });
    }

    // 检查 API Key 是否配置
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: '未配置 DEEPSEEK_API_KEY 环境变量' });
    }

    // 如果前端强制指定操作类型，直接使用
    if (forceOperation) {
      const systemPrompt = `
你是一个 Python 代码助手。用户要在现有代码基础上${forceOperation === 'append' ? '追加新代码' : '修改代码'}。

重要：必须保留原有代码，不要删除或覆盖任何现有内容。

请返回 JSON 格式：
{
  "operation": "${forceOperation}",
  "newText": "要添加的代码"
}

只返回 JSON，不要有其他内容。
`;
      const userContent = `当前文件：${fileName}\n当前代码：\n${fileContent || '# 空文件'}\n\n用户需求：${userPrompt}`;

      // 调用 DeepSeek API
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature: 0.3,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      let result = response.data.choices[0].message.content;
      // 提取 JSON
      const jsonMatch = result.match(/\{.*\}/s);
      if (jsonMatch) {
        result = jsonMatch[0];
      }
      const parsed = JSON.parse(result);
      return res.json({ success: true, data: parsed });
    }

    const systemPrompt = `
你是一个 Python 代码助手。用户会提供当前代码和修改需求。

重要原则：
1. 必须保留原有代码，只在需要的位置添加或修改
2. "添加函数"意味着在文件末尾追加新函数，不要删除现有代码
3. "修改某函数"只替换指定函数，保留其他代码

请返回 JSON 格式：
{
  "operation": "append" | "replace" | "insert",
  "range": { "startLine": 行号, "endLine": 行号 },
  "newText": "要添加或替换的代码"
}

操作说明：
- append: 在文件末尾追加代码（range 可省略）
- replace: 替换指定行范围内的代码
- insert: 在指定行之前插入代码

如果不需要修改，返回 { "operation": "none", "message": "说明原因" }
只返回 JSON，不要有其他内容。
`;

    const userContent = `当前文件：${fileName}\n当前代码：\n${fileContent || '# 空文件'}\n\n用户需求：${userPrompt}`;

    // 调用 DeepSeek API
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    let result = response.data.choices[0].message.content;
    // 提取 JSON
    const jsonMatch = result.match(/\{.*\}/s);
    if (jsonMatch) {
      result = jsonMatch[0];
    }
    const parsed = JSON.parse(result);
    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Agent 调用失败:', error.message);
    res.status(500).json({
      success: false,
      error: 'AI 处理失败，请检查 API 密钥或稍后重试'
    });
  }
});

// ============ 语法检查接口 ============
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');

app.post('/api/validate', async (req, res) => {
  try {
    const { content } = req.body;
    if (content === undefined) {
      return res.status(400).json({ success: false, error: '缺少代码内容' });
    }

    // 创建临时文件（使用随机文件名避免冲突）
    const tempDir = os.tmpdir();
    const randomId = Math.random().toString(36).substring(2, 15);
    const tempFile = path.join(tempDir, `validate_${randomId}.py`);

    try {
      // 写入临时文件
      await fs.writeFile(tempFile, content, 'utf-8');

      // 使用 py_compile 检查语法
      const command = `python -m py_compile "${tempFile}"`;
      const { stdout, stderr } = await execPromise(command, {
        timeout: 5000, // 5秒超时
        windowsHide: true
      });

      // 解析错误信息
      const errors = [];
      if (stderr) {
        const lines = stderr.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // 匹配格式：File "...", line N
          const match = line.match(/File ".*?", line (\d+)/);
          if (match) {
            const lineNum = parseInt(match[1]);
            // 提取错误类型（下一行通常是错误详情）
            let errorMsg = '语法错误';
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1];
              // 提取如 "SyntaxError: invalid syntax"
              const errMatch = nextLine.match(/(\w+Error:.*)/i);
              if (errMatch) {
                errorMsg = errMatch[1];
              }
            }
            errors.push({
              line: lineNum, // Monaco 行号从 1 开始
              column: 1,
              message: errorMsg,
              severity: 'error'
            });
          }
        }
        // 如果没有解析到具体错误，返回通用错误
        if (errors.length === 0) {
          errors.push({
            line: 1,
            column: 1,
            message: stderr.trim() || '语法错误',
            severity: 'error'
          });
        }
      }

      res.json({ success: true, errors });
    } finally {
      // 确保删除临时文件
      try {
        await fs.remove(tempFile);
      } catch (e) {
        console.warn('删除临时文件失败:', e.message);
      }
    }
  } catch (error) {
    // exec 超时或出错
    if (error.stderr) {
      // 有 stderr 输出，尝试解析错误
      const lines = error.stderr.split('\n');
      const errors = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/File ".*?", line (\d+)/);
        if (match) {
          const lineNum = parseInt(match[1]);
          let errorMsg = '语法错误';
          if (i + 1 < lines.length) {
            const errMatch = lines[i + 1].match(/(\w+Error:.*)/i);
            if (errMatch) {
              errorMsg = errMatch[1];
            }
          }
          errors.push({
            line: lineNum,
            column: 1,
            message: errorMsg,
            severity: 'error'
          });
        }
      }
      if (errors.length > 0) {
        return res.json({ success: true, errors });
      }
    }
    res.status(500).json({ success: false, error: '语法检查失败' });
  }
});

// 代码格式化接口（使用 Python 的 autopep8 或 black 格式化代码）
app.post('/api/format', async (req, res) => {
  try {
    const { content } = req.body;
    if (content === undefined) {
      return res.status(400).json({ success: false, error: '缺少代码内容' });
    }

    // 创建临时文件
    const tempDir = os.tmpdir();
    const randomId = Math.random().toString(36).substring(2, 15);
    const tempFile = path.join(tempDir, `format_${randomId}.py`);

    try {
      // 写入临时文件
      await fs.writeFile(tempFile, content, 'utf-8');

      let formattedContent = '';
      let usedFormatter = '';

      // 优先尝试 black（更流行的 Python 格式化工具）
      try {
        const blackCmd = `python -m black --quiet --line-length 120 "${tempFile}"`;
        await execPromise(blackCmd, { timeout: 10000, windowsHide: true });
        formattedContent = await fs.readFile(tempFile, 'utf-8');
        usedFormatter = 'black';
      } catch (blackError) {
        // black 不可用，尝试 autopep8
        try {
          const autopep8Cmd = `python -m autopep8 --max-line-length 120 --in-place "${tempFile}"`;
          await execPromise(autopep8Cmd, { timeout: 10000, windowsHide: true });
          formattedContent = await fs.readFile(tempFile, 'utf-8');
          usedFormatter = 'autopep8';
        } catch (autopep8Error) {
          // 两个格式化工具都不可用
          return res.json({
            success: false,
            error: '未安装格式化工具。请安装 black 或 autopep8：\npip install black\n或\npip install autopep8'
          });
        }
      }

      // 检查格式化后内容是否有变化
      if (formattedContent === content) {
        return res.json({ success: true, formatted: content, message: '代码已是最佳格式', changed: false });
      }

      res.json({
        success: true,
        formatted: formattedContent,
        message: `代码已格式化 (${usedFormatter})`,
        changed: true
      });
    } finally {
      // 确保删除临时文件
      try {
        await fs.remove(tempFile);
      } catch (e) {
        console.warn('删除临时文件失败:', e.message);
      }
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '代码格式化失败: ' + error.message });
  }
});

// ============ Python 代码补全和悬停提示（使用 jedi_oneshot.py）============
// 调用已有的 jedi_oneshot.py 脚本，正确处理了列号偏移和 parso 缓存问题
const jediScriptPath = path.join(__dirname, 'jedi_oneshot.py');

app.post('/api/complete', async (req, res) => {
  try {
    const { content, line, column } = req.body;
    if (content === undefined || line === undefined || column === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 创建临时文件写入代码内容
    const tempDir = os.tmpdir();
    const randomId = Math.random().toString(36).substring(2, 15);
    const tempFile = path.join(tempDir, `jedi_${randomId}.py`);

    try {
      await fs.writeFile(tempFile, content, 'utf-8');

      // 调用 jedi_oneshot.py complete <file> <line> <column>
      const command = `python "${jediScriptPath}" complete "${tempFile}" ${line} ${column}`;
      const { stdout } = await execPromise(command, {
        timeout: 10000,
        windowsHide: true
      });

      const result = JSON.parse(stdout);
      res.json(result);
    } finally {
      try { await fs.remove(tempFile); } catch (e) {}
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '代码补全失败: ' + error.message });
  }
});

// 悬停提示接口
app.post('/api/hover', async (req, res) => {
  try {
    const { content, line, column } = req.body;
    if (content === undefined || line === undefined || column === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const tempDir = os.tmpdir();
    const randomId = Math.random().toString(36).substring(2, 15);
    const tempFile = path.join(tempDir, `jedi_${randomId}.py`);

    try {
      await fs.writeFile(tempFile, content, 'utf-8');

      // 调用 jedi_oneshot.py hover <file> <line> <column>
      const command = `python "${jediScriptPath}" hover "${tempFile}" ${line} ${column}`;
      const { stdout } = await execPromise(command, {
        timeout: 10000,
        windowsHide: true
      });

      const result = JSON.parse(stdout);
      res.json(result);
    } finally {
      try { await fs.remove(tempFile); } catch (e) {}
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '悬停提示失败: ' + error.message });
  }
});

// 代码跳转接口（Go to Definition）
app.post('/api/goto', async (req, res) => {
  try {
    const { content, line, column } = req.body;
    if (content === undefined || line === undefined || column === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const tempDir = os.tmpdir();
    const randomId = Math.random().toString(36).substring(2, 15);
    const tempFile = path.join(tempDir, `jedi_${randomId}.py`);

    try {
      await fs.writeFile(tempFile, content, 'utf-8');

      // 调用 jedi_oneshot.py goto <file> <line> <column>
      const command = `python "${jediScriptPath}" goto "${tempFile}" ${line} ${column}`;
      const { stdout } = await execPromise(command, {
        timeout: 10000,
        windowsHide: true
      });

      const result = JSON.parse(stdout);
      res.json(result);
    } finally {
      try { await fs.remove(tempFile); } catch (e) {}
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '代码跳转失败: ' + error.message });
  }
});

// ============ 设置功能 ============
const settingsFilePath = path.join(__dirname, '..', 'workspace', '.editor-settings.json');

// 默认设置
const defaultSettings = {
  theme: 'vs-dark',
  fontSize: 14,
  tabSize: 4,
  fontFamily: "'Consolas', 'Courier New', monospace",
  minimap: true,
  lineNumbers: true,
  wordWrap: 'off',
  autoSave: true,
  autoSaveDelay: 1500,
  formatOnSave: false,
};

// 获取设置
app.get('/api/settings', async (req, res) => {
  try {
    if (await fs.pathExists(settingsFilePath)) {
      const settings = await fs.readJson(settingsFilePath);
      // 合并默认设置（确保新增的设置项有默认值）
      res.json({ success: true, settings: { ...defaultSettings, ...settings } });
    } else {
      res.json({ success: true, settings: defaultSettings });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '读取设置失败' });
  }
});

// 保存设置
app.post('/api/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ success: false, error: '缺少设置内容' });
    }
    // 合并默认设置，确保所有字段都存在
    const mergedSettings = { ...defaultSettings, ...settings };
    await fs.writeJson(settingsFilePath, mergedSettings, { spaces: 2 });
    res.json({ success: true, message: '设置已保存' });
  } catch (error) {
    res.status(500).json({ success: false, error: '保存设置失败' });
  }
});

app.listen(PORT, () => {
  console.log(`后端服务已启动: http://localhost:${PORT}`);
});