import React, { useState, useRef, useEffect } from 'react';
import { Layout, Input, Button, Card, Spin, List, message, Dropdown, Modal, Tabs, Collapse, Switch, Select, InputNumber, Drawer, Divider } from 'antd';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import axios from 'axios';
import 'antd/dist/reset.css';

loader.config({ monaco });

const { Header, Sider, Content, Footer } = Layout;
const { Panel } = Collapse;
const { TextArea } = Input;

function App() {
  // ============ 状态定义 ============
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [contextFile, setContextFile] = useState(null);
  const [newFileModalVisible, setNewFileModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renameFileName, setRenameFileName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [history, setHistory] = useState([]);
  // 文件多选状态
  const [selectedFiles, setSelectedFiles] = useState([]);
  // 编辑器光标位置状态（用于状态栏）
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  
  // ============ 设置状态 ============
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState({
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
  });

  // ============ 多 Tab 核心状态 ============
  // tabs 数组结构：[{ key: filePath, label: fileName, content: 当前内容, savedContent: 已保存的内容 }]
  const [tabs, setTabs] = useState([]);
  const [activeTabKey, setActiveTabKey] = useState(null);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  // 使用 ref 保存最新的 state，确保快捷键回调能获取最新值
  const activeTabKeyRef = useRef(activeTabKey);
  const tabsRef = useRef(tabs);
  // 标记是否正在切换 Tab（避免切换时触发 onChange 更新错误的 Tab）
  const isSwitchingTabRef = useRef(false);
  // 语法检查防抖定时器
  const validateTimeoutRef = useRef(null);

  // 同步 ref 和 state
  useEffect(() => {
    activeTabKeyRef.current = activeTabKey;
  }, [activeTabKey]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // 检查 Tab 是否有未保存的更改
  const hasUnsavedChanges = (tabKey) => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return false;
    return tab.content !== tab.savedContent;
  };

  // ============ 文件操作 ============
  const loadFiles = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:3001/api/files');
      if (response.data.success) {
        setFiles(response.data.data);
      }
    } catch (error) {
      console.error('加载文件列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/settings');
        if (response.data.success) {
          setSettings(response.data.settings);
        }
      } catch (error) {
        console.debug('加载设置失败，使用默认设置');
      }
    };
    loadSettings();
  }, []);

  // 保存设置
  const saveSettings = async (newSettings) => {
    try {
      const response = await axios.post('http://localhost:3001/api/settings', {
        settings: newSettings
      });
      if (response.data.success) {
        setSettings(newSettings);
        message.success('设置已保存');
      }
    } catch (error) {
      message.error('保存设置失败');
    }
  };

  // 打开文件（添加到 Tab）
  const handleFileClick = async (file) => {
    if (file.type === 'directory') return;

    // 检查是否已经打开
    const existingTab = tabs.find(tab => tab.key === file.path);
    if (existingTab) {
      setActiveTabKey(file.path);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get('http://localhost:3001/api/file', {
        params: { path: file.path }
      });
      if (response.data.success) {
        const fileContent = response.data.content;
        const newTab = {
          key: file.path,
          label: file.name,
          content: fileContent,
          savedContent: fileContent, // 记录已保存的内容
          filePath: file.path,
        };
        setTabs([...tabs, newTab]);
        setActiveTabKey(file.path);
        message.success(`已打开: ${file.name}`);
      }
    } catch (error) {
      console.error('加载文件内容失败:', error);
      message.error('读取文件失败');
    } finally {
      setLoading(false);
    }
  };

  // 关闭 Tab（如有未保存更改则询问）
  const handleTabClose = (targetKey) => {
    // 检查是否有未保存的更改
    if (hasUnsavedChanges(targetKey)) {
      const tab = tabs.find(t => t.key === targetKey);
      Modal.confirm({
        title: '保存更改',
        content: `"${tab?.label}" 有未保存的更改，是否保存？`,
        okText: '保存',
        cancelText: '不保存',
        onOk: async () => {
          // 先保存，再关闭
          await handleSaveFile(tab?.content, targetKey);
          doCloseTab(targetKey);
        },
        onCancel: () => {
          // 不保存，直接关闭
          doCloseTab(targetKey);
        }
      });
    } else {
      doCloseTab(targetKey);
    }
  };

  // 实际关闭 Tab 的逻辑
  const doCloseTab = (targetKey) => {
    const newTabs = tabs.filter(tab => tab.key !== targetKey);
    setTabs(newTabs);
    if (activeTabKey === targetKey) {
      if (newTabs.length > 0) {
        setActiveTabKey(newTabs[0].key);
      } else {
        setActiveTabKey(null);
      }
    }
  };

  // 获取当前活动 Tab 的内容
  const getActiveTabContent = () => {
    const tab = tabs.find(t => t.key === activeTabKey);
    return tab ? tab.content : '# 请打开一个文件';
  };

  const getActiveTabFilePath = () => {
    const tab = tabs.find(t => t.key === activeTabKey);
    return tab ? tab.filePath : null;
  };

  // 更新当前 Tab 的内容
  const updateActiveTabContent = (newContent) => {
    if (!activeTabKey) return;
    setTabs(tabs.map(tab =>
      tab.key === activeTabKey
        ? { ...tab, content: newContent }
        : tab
    ));
  };

  // 自动保存（防抖，避免频繁请求）
  const autoSaveRef = useRef(null);
  const autoSave = (filePath, content) => {
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
    }
    autoSaveRef.current = setTimeout(async () => {
      try {
        await axios.post('http://localhost:3001/api/save', {
          path: filePath,
          content: content
        });
        // 更新 Tab 的 savedContent
        setTabs(prevTabs => prevTabs.map(tab =>
          tab.key === filePath
            ? { ...tab, savedContent: content }
            : tab
        ));
        console.log('自动保存成功:', filePath.split(/[/\\]/).pop());
      } catch (error) {
        console.error('自动保存失败:', error);
      }
    }, 1500); // 1.5秒后自动保存
  };

  // ============ 语法错误标记 ============
  const validateCode = async (content) => {
    if (!content || content.trim() === '') return;

    try {
      const response = await axios.post('http://localhost:3001/api/validate', { content });
      if (response.data.success && monacoRef.current && editorRef.current) {
        const model = editorRef.current.getModel();
        if (!model) return;

        const markers = response.data.errors.map(err => ({
          severity: monacoRef.current.MarkerSeverity.Error,
          startLineNumber: err.line, // 后端已返回正确的行号（1-based）
          startColumn: err.column || 1,
          endLineNumber: err.line,
          endColumn: 1000,
          message: err.message,
        }));

        monacoRef.current.editor.setModelMarkers(model, 'python', markers);
      }
    } catch (error) {
      // 静默失败，不打扰用户
      console.debug('语法检查失败:', error);
    }
  };

  // 防抖检查：用户停止输入 1 秒后自动检查
  const debouncedValidate = (content) => {
    if (validateTimeoutRef.current) {
      clearTimeout(validateTimeoutRef.current);
    }
    validateTimeoutRef.current = setTimeout(() => {
      validateCode(content);
    }, 1000);
  };

  // ============ 保存文件 ============
  const handleSaveFile = async (content, targetFilePath = null) => {
    const filePath = targetFilePath || getActiveTabFilePath();
    if (!filePath) {
      message.warning('没有打开的文件');
      return;
    }
    try {
      setLoading(true);
      const response = await axios.post('http://localhost:3001/api/save', {
        path: filePath,
        content: content
      });
      if (response.data.success) {
        message.success(`文件保存成功 ✅ (${filePath.split(/[/\\]/).pop()})`);
        // 更新 Tab 的 savedContent
        setTabs(prevTabs => prevTabs.map(tab =>
          tab.key === filePath
            ? { ...tab, savedContent: content }
            : tab
        ));
        loadFiles(); // 刷新文件列表，更新修改时间
      }
    } catch (error) {
      console.error('保存文件失败:', error);
      message.error('保存文件失败');
    } finally {
      setLoading(false);
    }
  };

  // ============ 右键菜单：新建/重命名/删除 ============
  const handleCreateFile = async () => {
    if (!newFileName.trim()) {
      message.warning('文件名不能为空');
      return;
    }
    try {
      const response = await axios.post('http://localhost:3001/api/files/new', {
        name: newFileName.trim()
      });
      if (response.data.success) {
        message.success(response.data.message);
        setNewFileModalVisible(false);
        setNewFileName('');
        loadFiles();
      }
    } catch (error) {
      message.error(error.response?.data?.error || '创建文件失败');
    }
  };

  const handleRenameFile = async () => {
    if (!renameFileName.trim()) {
      message.warning('文件名不能为空');
      return;
    }
    try {
      const response = await axios.put('http://localhost:3001/api/files/rename', {
        oldPath: contextFile.path,
        newName: renameFileName.trim()
      });
      if (response.data.success) {
        message.success(response.data.message);
        setRenameModalVisible(false);
        setRenameFileName('');
        setContextFile(null);
        loadFiles();
        // 更新 Tab 中的路径（使用安全的路径拼接方式）
        const oldPath = contextFile.path;
        const pathParts = oldPath.split(/[/\\]/);
        pathParts[pathParts.length - 1] = renameFileName.trim();
        const newPath = pathParts.join('/');
        setTabs(prevTabs => prevTabs.map(tab =>
          tab.key === oldPath
            ? { ...tab, key: newPath, label: renameFileName.trim(), filePath: newPath }
            : tab
        ));
        if (activeTabKey === oldPath) {
          setActiveTabKey(newPath);
        }
      }
    } catch (error) {
      message.error(error.response?.data?.error || '重命名失败');
    }
  };

  const handleDeleteFile = async (file) => {
    try {
      const response = await axios.delete('http://localhost:3001/api/files/delete', {
        data: { path: file.path }
      });
      if (response.data.success) {
        message.success(response.data.message);
        loadFiles();
        // 删除文件后直接关闭 Tab，不需要询问是否保存
        doCloseTab(file.path);
      }
    } catch (error) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  // 文件多选操作
  const toggleFileSelection = (filePath) => {
    setSelectedFiles(prev =>
      prev.includes(filePath)
        ? prev.filter(p => p !== filePath)
        : [...prev, filePath]
    );
  };

  const toggleSelectAll = () => {
    const fileItems = files.filter(f => f.type === 'file');
    if (selectedFiles.length === fileItems.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(fileItems.map(f => f.path));
    }
  };

  const handleBatchDelete = () => {
    if (selectedFiles.length === 0) {
      message.warning('请先选择文件');
      return;
    }
    Modal.confirm({
      title: '批量删除',
      content: `确定要删除选中的 ${selectedFiles.length} 个文件吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        let successCount = 0;
        let failCount = 0;
        for (const filePath of selectedFiles) {
          try {
            await axios.delete('http://localhost:3001/api/files/delete', { data: { path: filePath } });
            successCount++;
            // 删除文件后直接关闭 Tab，不需要询问是否保存
            doCloseTab(filePath);
          } catch (error) {
            failCount++;
          }
        }
        if (failCount === 0) {
          message.success(`成功删除 ${successCount} 个文件`);
        } else {
          message.warning(`成功删除 ${successCount} 个文件，${failCount} 个失败`);
        }
        setSelectedFiles([]);
        loadFiles();
      }
    });
  };

  // 右键菜单配置
  const getFileContextMenu = (file) => ({
    items: [
      {
        key: 'rename',
        label: '✏️ 重命名',
        onClick: () => {
          setContextFile(file);
          setRenameFileName(file.name);
          setRenameModalVisible(true);
        }
      },
      {
        key: 'delete',
        label: '🗑️ 删除',
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: '确认删除',
            content: `确定要删除 "${file.name}" 吗？`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => handleDeleteFile(file)
          });
        }
      }
    ]
  });

  // 空白处右键菜单
  const getEmptyContextMenu = () => ({
    items: [
      {
        key: 'newFile',
        label: '📄 新建文件',
        onClick: () => {
          setNewFileName('');
          setNewFileModalVisible(true);
        }
      }
    ]
  });

  // ============ Agent 核心逻辑 ============
  const handleAgentSend = async () => {
    if (!inputValue.trim()) {
      message.warning('请输入指令');
      return;
    }
    const filePath = getActiveTabFilePath();
    if (!filePath) {
      message.warning('请先打开一个文件');
      return;
    }

    const userMsg = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAgentLoading(true);

    const currentContent = getActiveTabContent();

    // 智能判断操作类型：如果包含"添加/增加/新增"关键词，强制使用 append
    const addKeywords = ['添加', '增加', '新增', '加入', '添加一个', '加一个', '写一个', '新增一个'];
    const isAddOperation = addKeywords.some(kw => userMsg.includes(kw));

    try {
      const response = await axios.post('http://localhost:3001/api/agent', {
        userPrompt: userMsg,
        fileContent: currentContent,
        fileName: filePath.split(/[/\\]/).pop(),
        forceOperation: isAddOperation ? 'append' : null
      });

      if (response.data.success) {
        const result = response.data.data;

        if (result.operation === 'none') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `❌ ${result.message || '无需修改'}`
          }]);
        } else {
          // 保存历史快照
          setHistory(prev => [...prev, {
            filePath: filePath,
            content: currentContent,
            timestamp: new Date().toLocaleTimeString()
          }]);

          // 应用修改
          const editor = editorRef.current;
          if (editor) {
            const model = editor.getModel();
            const lines = model.getLineCount();

            let range;
            let textToInsert = result.newText || '';

            // 根据操作类型确定行范围
            if (result.operation === 'append') {
              // append: 在文件末尾之后插入，不替换任何内容
              range = new monaco.Range(lines + 1, 1, lines + 1, 1);
            } else if (result.operation === 'insert' && result.range?.startLine) {
              // insert: 在指定行之前插入
              const insertLine = Math.max(1, Math.min(result.range.startLine, lines + 1));
              range = new monaco.Range(insertLine, 1, insertLine, 1);
              textToInsert = textToInsert + '\n';
            } else {
              // replace: 替换指定范围
              const startLine = result.range?.startLine || 1;
              const endLine = result.range?.endLine || lines;
              const safeStart = Math.max(1, Math.min(startLine, lines));
              const safeEnd = Math.max(safeStart, Math.min(endLine, lines));
              range = new monaco.Range(safeStart, 1, safeEnd, model.getLineMaxColumn(safeEnd));
            }

            // 使用 executeEdits 让 Ctrl+Z 撤销生效
            editor.executeEdits('ai-agent', [{
              range,
              text: textToInsert
            }]);

            const newCode = editor.getValue();
            updateActiveTabContent(newCode);

            // 添加带 Diff 的助手消息
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✅ 已执行修改 (${result.operation})`,
              diff: {
                before: currentContent,
                after: newCode
              }
            }]);
            // AI 修改后自动检查语法
            validateCode(newCode);
            message.success('AI 修改已应用，可在聊天中查看 Diff');
          }
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ 处理失败：${response.data.error || '请重试'}`
        }]);
      }
    } catch (error) {
      console.error('Agent 请求失败:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 请求失败：请检查后端服务是否运行`
      }]);
    } finally {
      setAgentLoading(false);
    }
  };

  // 撤回功能
  const handleUndo = () => {
    if (history.length === 0) {
      message.warning('没有可撤回的历史记录');
      return;
    }
    const last = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    // 更新对应文件的内容
    setTabs(tabs.map(tab =>
      tab.key === last.filePath
        ? { ...tab, content: last.content }
        : tab
    ));
    if (activeTabKey === last.filePath) {
      // 强制编辑器刷新
      const editor = editorRef.current;
      if (editor) {
        editor.setValue(last.content);
      }
    }
    message.success(`已撤回至 ${last.timestamp} 的版本`);
  };

  // ============ Editor 生命周期 ============
  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 注册 Ctrl+S 快捷键 - 使用 ref 获取最新的 state
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const currentActiveKey = activeTabKeyRef.current;
      const currentTabs = tabsRef.current;

      if (!currentActiveKey) {
        message.warning('没有打开的文件');
        return;
      }

      const tab = currentTabs.find(t => t.key === currentActiveKey);
      if (!tab) {
        message.warning('找不到当前文件');
        return;
      }

      const content = editor.getValue();
      const filePath = tab.filePath;

      try {
        const response = await axios.post('http://localhost:3001/api/save', {
          path: filePath,
          content: content
        });
        if (response.data.success) {
          message.success(`文件保存成功 ✅ (${filePath.split(/[/\\]/).pop()})`);
          // 更新 Tab 的 savedContent（通过 ref 获取最新的 setTabs）
          setTabs(prevTabs => prevTabs.map(t =>
            t.key === filePath
              ? { ...t, savedContent: content }
              : t
          ));
          // 保存后检查语法
          validateCode(content);
        }
      } catch (error) {
        console.error('保存文件失败:', error);
        message.error('保存文件失败');
      }
    });

    // 注册 Shift+Alt+F 格式化代码快捷键
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, async () => {
      const currentActiveKey = activeTabKeyRef.current;
      if (!currentActiveKey) {
        message.warning('没有打开的文件');
        return;
      }
      const code = editor.getValue();
      try {
        const response = await axios.post('http://localhost:3001/api/format', { content: code });
        if (response.data.success) {
          if (response.data.changed) {
            editor.setValue(response.data.formatted);
            message.success(response.data.message);
            // 更新 Tab 内容
            setTabs(prevTabs => prevTabs.map(t =>
              t.key === currentActiveKey
                ? { ...t, content: response.data.formatted }
                : t
            ));
            // 格式化后检查语法
            validateCode(response.data.formatted);
          } else {
            message.info(response.data.message);
          }
        } else {
          message.error(response.data.error);
        }
      } catch (error) {
        console.error('代码格式化失败:', error);
        message.error('代码格式化失败');
      }
    });

    // ============ 注册 Python 代码补全 Provider ============
    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', ' ', '(', '[', '"', "'"],
      provideCompletionItems: async (model, position) => {
        const content = model.getValue();
        const line = position.lineNumber;
        const column = position.column;

        try {
          const response = await axios.post('http://localhost:3001/api/complete', {
            content,
            line,
            column
          });

          if (response.data.success && response.data.completions) {
            const suggestions = response.data.completions.map(item => ({
              label: item.name,
              kind: item.type === 'function' ? monaco.languages.CompletionItemKind.Function :
                    item.type === 'class' ? monaco.languages.CompletionItemKind.Class :
                    item.type === 'module' ? monaco.languages.CompletionItemKind.Module :
                    monaco.languages.CompletionItemKind.Variable,
              insertText: item.name,
              documentation: item.description || undefined,
              detail: item.type,
              range: new monaco.Range(line, column, line, column)
            }));
            return { suggestions };
          }
        } catch (error) {
          console.debug('补全请求失败:', error);
        }
        return { suggestions: [] };
      }
    });

    // ============ 注册悬停提示 Provider ============
    monaco.languages.registerHoverProvider('python', {
      provideHover: async (model, position) => {
        const content = model.getValue();
        const line = position.lineNumber;
        const column = position.column;

        try {
          const response = await axios.post('http://localhost:3001/api/hover', {
            content,
            line,
            column
          });

          if (response.data.success && response.data.hover) {
            const hover = response.data.hover;
            let contents = [];

            // 显示名称和类型
            contents.push({ value: `**${hover.name}** (${hover.type})` });

            // 显示模块来源
            if (hover.module && hover.module !== '__main__') {
              contents.push({ value: `*from ${hover.module}*` });
            }

            // 显示文档字符串
            if (hover.description) {
              contents.push({ value: '```python\n' + hover.description + '\n```' });
            }

            return {
              contents,
              range: new monaco.Range(line, column, line, column)
            };
          }
        } catch (error) {
          console.debug('悬停请求失败:', error);
        }
        return null;
      }
    });

    // ============ 注册代码跳转 Provider（Go to Definition）============
    monaco.languages.registerDefinitionProvider('python', {
      provideDefinition: async (model, position) => {
        const content = model.getValue();
        const line = position.lineNumber;
        const column = position.column;

        try {
          const response = await axios.post('http://localhost:3001/api/goto', {
            content,
            line,
            column
          });

          if (response.data.success && response.data.definitions && response.data.definitions.length > 0) {
            // 返回所有定义位置
            return response.data.definitions.map(def => {
              // 如果是当前文件内的定义，返回当前位置
              // 否则返回其他文件的位置（目前只支持当前文件内跳转）
              return {
                uri: model.uri,
                range: new monaco.Range(def.line, def.column, def.line, def.column + 10),
                raw: def  // 保留原始信息用于调试
              };
            });
          }
        } catch (error) {
          console.debug('代码跳转请求失败:', error);
        }
        return [];
      }
    });

    // 初始加载时检查语法
    const content = editor.getValue();
    if (content) {
      setTimeout(() => validateCode(content), 500);
    }

    // 监听光标位置变化（用于状态栏显示）
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });
  };

  // ============ Tab 切换 ============
  const handleTabChange = (key) => {
    // 切换前，先保存当前编辑器内容到当前 Tab
    if (activeTabKey && editorRef.current) {
      const currentContent = editorRef.current.getValue();
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.key === activeTabKey
          ? { ...tab, content: currentContent }
          : tab
      ));
    }

    // 标记正在切换，防止 onChange 触发
    isSwitchingTabRef.current = true;

    // 切换到新 Tab
    setActiveTabKey(key);
    const tab = tabs.find(t => t.key === key);
    if (tab && editorRef.current) {
      editorRef.current.setValue(tab.content);
      // 切换 Tab 后检查语法
      setTimeout(() => validateCode(tab.content), 300);
    }

    // 延迟重置标记（等待 onChange 触发完毕）
    setTimeout(() => {
      isSwitchingTabRef.current = false;
    }, 100);
  };

  // 当 tabs 变化时，同步编辑器内容
  useEffect(() => {
    if (activeTabKey && editorRef.current) {
      const tab = tabs.find(t => t.key === activeTabKey);
      if (tab) {
        const currentEditorValue = editorRef.current.getValue();
        if (currentEditorValue !== tab.content) {
          editorRef.current.setValue(tab.content);
        }
      }
    }
  }, [tabs, activeTabKey]);

  // ============ 渲染 ============
  return (
    <Layout style={{ height: '100vh' }}>
      {/* VSCode 风格的标题栏 */}
      <Header style={{
        display: 'flex',
        alignItems: 'center',
        color: 'white',
        fontSize: 14,
        justifyContent: 'space-between',
        padding: '0 16px',
        height: 36,
        lineHeight: '36px',
        background: 'linear-gradient(90deg, #323233 0%, #252526 100%)',
        borderBottom: '1px solid #191919',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 500 }}>🐍 Python Editor + AI Agent</span>
          {activeTabKey && (
            <span style={{ fontSize: 13, color: '#cccccc' }}>
              {activeTabKey.split(/[/\\]/).pop()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#858585' }}>历史: {history.length}</span>
          <Button
            size="small"
            onClick={handleUndo}
            disabled={history.length === 0}
            style={{
              background: history.length > 0 ? '#0e639c' : undefined,
              border: 'none',
              color: history.length > 0 ? 'white' : '#858585',
              fontSize: 12,
              height: 24,
            }}
          >
            ↩️ 撤回
          </Button>
          <Button
            size="small"
            onClick={() => setSettingsVisible(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#c5c5c5',
              fontSize: 16,
              height: 24,
              marginLeft: 4,
            }}
            title="设置"
          >
            ⚙️
          </Button>
        </div>
      </Header>

      <Layout style={{ flex: 1, minHeight: 0 }}>
        {/* VSCode 风格的侧边栏 */}
        <Dropdown menu={getEmptyContextMenu()} trigger={['contextMenu']}>
          <Sider
            width={240}
            theme="light"
            style={{
              padding: 0,
              overflow: 'auto',
              background: '#252526',
              borderRight: '1px solid #191919',
            }}
          >
            {/* 活动栏图标区 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 35,
              borderBottom: '1px solid #191919',
              background: '#333333',
            }}>
              <span style={{ color: '#ffffff', fontSize: 16 }}>📁</span>
            </div>

            {/* 文件列表头部 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              borderBottom: '1px solid #191919',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedFiles.length > 0 && selectedFiles.length === files.filter(f => f.type === 'file').length}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: 12, height: 12, accentColor: '#0e639c' }}
                  title="全选/取消全选"
                />
                <span style={{ color: '#bbbbbb', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                  EXPLORER
                </span>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                {selectedFiles.length > 0 && (
                  <Button
                    size="small"
                    type="text"
                    danger
                    onClick={handleBatchDelete}
                    title="批量删除选中文件"
                    style={{ color: '#f14c4c', fontSize: 12, padding: '0 4px' }}
                  >
                    🗑️ ({selectedFiles.length})
                  </Button>
                )}
                <Button
                  size="small"
                  type="text"
                  onClick={() => { setNewFileName(''); setNewFileModalVisible(true); }}
                  style={{ color: '#c5c5c5', fontSize: 14, padding: '0 4px' }}
                  title="新建文件"
                >
                  +
                </Button>
              </div>
            </div>

            {/* 文件列表 */}
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : files.length > 0 ? (
              <List
                size="small"
                dataSource={files}
                renderItem={(item) => (
                  <Dropdown menu={getFileContextMenu(item)} trigger={['contextMenu']}>
                    <div
                      style={{
                        padding: '4px 8px 4px 12px',
                        cursor: 'pointer',
                        background: tabs.some(t => t.key === item.path) ? '#094771' : 'transparent',
                        borderLeft: tabs.some(t => t.key === item.path) ? '2px solid #007acc' : '2px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onClick={() => handleFileClick(item)}
                    >
                      {item.type === 'file' && (
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(item.path)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleFileSelection(item.path);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', width: 12, height: 12, flexShrink: 0, accentColor: '#0e639c' }}
                        />
                      )}
                      <span style={{ color: '#cccccc', fontSize: 13 }}>
                        {item.type === 'directory' ? '📁' : '📄'} {item.name}
                      </span>
                    </div>
                  </Dropdown>
                )}
              />
            ) : (
              <div style={{ color: '#858585', fontSize: 13, padding: '12px', textAlign: 'center' }}>
                暂无文件
              </div>
            )}
          </Sider>
        </Dropdown>

        <Layout style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* 编辑器区域 - VSCode 风格 */}
          <Content style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#1e1e1e',
          }}>
            {/* Tab 标签栏 */}
            {tabs.length > 0 && (
              <div style={{
                background: '#252526',
                borderBottom: '1px solid #191919',
                padding: '0 8px',
              }}>
                <Tabs
                  activeKey={activeTabKey}
                  onChange={handleTabChange}
                  type="editable-card"
                  onEdit={(targetKey, action) => {
                    if (action === 'remove') handleTabClose(targetKey);
                  }}
                  items={tabs.map(tab => ({
                    key: tab.key,
                    label: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#cccccc' }}>
                        {hasUnsavedChanges(tab.key) && (
                          <span style={{ color: '#e2c08d', fontWeight: 'bold', fontSize: 10 }}>●</span>
                        )}
                        <span style={{ fontSize: 13 }}>{tab.label}</span>
                      </span>
                    ),
                    closable: true,
                  }))}
                  style={{ marginBottom: -1 }}
                  tabBarStyle={{
                    background: 'transparent',
                    borderBottom: 'none',
                  }}
                />
              </div>
            )}

            {/* 工具栏 */}
            {activeTabKey && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                padding: '4px 12px',
                background: '#252526',
                borderBottom: '1px solid #191919',
              }}>
                <Button
                  size="small"
                  onClick={async () => {
                    const code = editorRef.current?.getValue();
                    if (!code) return;
                    try {
                      const response = await axios.post('http://localhost:3001/api/format', { content: code });
                      if (response.data.success) {
                        if (response.data.changed) {
                          editorRef.current.setValue(response.data.formatted);
                          updateActiveTabContent(response.data.formatted);
                          message.success(response.data.message);
                          validateCode(response.data.formatted);
                        } else {
                          message.info(response.data.message);
                        }
                      } else {
                        message.error(response.data.error);
                      }
                    } catch (error) {
                      message.error('代码格式化失败');
                    }
                  }}
                  style={{
                    background: '#0e639c',
                    border: 'none',
                    color: 'white',
                    fontSize: 12,
                    height: 24,
                  }}
                >
                  🧹 格式化 (Shift+Alt+F)
                </Button>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => handleSaveFile(editorRef.current?.getValue())}
                  style={{
                    background: '#0e639c',
                    border: 'none',
                    color: 'white',
                    fontSize: 12,
                    height: 24,
                  }}
                >
                  💾 保存 (Ctrl+S)
                </Button>
              </div>
            )}

            {/* 编辑器 */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <Editor
                height="100%"
                width="100%"
                defaultLanguage="python"
                theme={settings.theme}
                value={getActiveTabContent()}
                onChange={(value) => {
                  // 如果正在切换 Tab，忽略 onChange
                  if (isSwitchingTabRef.current) return;

                  if (activeTabKey && value !== undefined) {
                    updateActiveTabContent(value);
                    // 自动保存（防抖）
                    if (settings.autoSave) {
                      const filePath = activeTabKey;
                      autoSave(filePath, value);
                    }
                    // 用户输入时防抖检查语法
                    debouncedValidate(value);
                  }
                }}
                onMount={handleEditorMount}
                loading={<Spin tip="编辑器加载中..." />}
                options={{
                  fontSize: settings.fontSize,
                  minimap: { enabled: settings.minimap, scale: 1, showSlider: 'mouseover' },
                  tabSize: settings.tabSize,
                  fontFamily: settings.fontFamily,
                  lineNumbers: settings.lineNumbers ? 'on' : 'off',
                  wordWrap: settings.wordWrap,
                  automaticLayout: true,
                  folding: true,
                  foldingStrategy: 'indentation',
                  quickSuggestions: true,
                  suggestOnTriggerCharacters: true,
                  wordBasedSuggestions: 'currentDocument',
                  hover: { enabled: true, delay: 300 },
                  find: { addExtraSpaceOnTop: false, autoFindInSelection: 'never' },
                  formatOnPaste: settings.formatOnSave,
                  formatOnType: false,
                  matchBrackets: 'always',
                  autoClosingBrackets: 'always',
                  autoClosingQuotes: 'always',
                  renderIndentGuides: true,
                  renderWhitespace: 'selection',
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  lineNumbers: 'on',
                  glyphMargin: true,
                  scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible',
                    useShadows: false,
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                  },
                  fontFamily: "'Consolas', 'Courier New', monospace",
                  fontLigatures: false,
                }}
              />
            </div>

            {/* Agent 对话区域 */}
            <div style={{
              background: '#252526',
              borderTop: '1px solid #191919',
              padding: 8,
              maxHeight: 180,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {messages.length > 0 && (
                <div style={{
                  flex: 1,
                  overflow: 'auto',
                  background: '#1e1e1e',
                  padding: 6,
                  borderRadius: 4,
                }}>
                  {messages.map((msg, idx) => {
                    if (msg.diff) {
                      return (
                        <div key={idx} style={{ marginBottom: 6, textAlign: 'left' }}>
                          <div style={{
                            display: 'inline-block',
                            background: '#2d2d2d',
                            padding: '4px 8px',
                            borderRadius: 4,
                            maxWidth: '95%',
                          }}>
                            <div style={{ marginBottom: 4, color: '#cccccc', fontSize: 12 }}>{msg.content}</div>
                            <Collapse ghost size="small">
                              <Panel header={<span style={{ color: '#3794ff', fontSize: 11 }}>📊 Diff</span>} key="diff">
                                <pre style={{ fontSize: 11, color: '#f14c4c', margin: 0 }}>- {msg.diff.before}</pre>
                                <pre style={{ fontSize: 11, color: '#89d185', margin: 0 }}>+ {msg.diff.after}</pre>
                              </Panel>
                            </Collapse>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={idx} style={{ marginBottom: 4, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                        <span style={{
                          display: 'inline-block',
                          background: msg.role === 'user' ? '#0e639c' : '#2d2d2d',
                          color: '#fff',
                          padding: '3px 8px',
                          borderRadius: 4,
                          maxWidth: '80%',
                          fontSize: 12,
                        }}>{msg.content}</span>
                      </div>
                    );
                  })}
                  {agentLoading && <div style={{ color: '#858585', fontSize: 12 }}>🤔 AI 思考中...</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <TextArea
                  placeholder="输入指令让 AI 改代码..."
                  rows={1}
                  style={{ flex: 1, background: '#1e1e1e', border: '1px solid #3c3c3c', color: '#ccc', fontSize: 12 }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAgentSend(); } }}
                  disabled={!activeTabKey}
                />
                <Button size="small" type="primary" onClick={handleAgentSend} loading={agentLoading} disabled={!activeTabKey}
                  style={{ background: '#0e639c', border: 'none', height: 28, fontSize: 12 }}>发送</Button>
              </div>
            </div>
          </Content>

          {/* VSCode 风格的状态栏 */}
          <div style={{
            height: 22,
            background: '#007acc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            color: 'white',
            fontSize: 12,
          }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <span>🐍 Python</span>
              <span>UTF-8</span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
              <span>Spaces: 4</span>
            </div>
          </div>
        </Layout>
      </Layout>

      {/* 新建文件弹窗 */}
      <Modal
        title="新建文件"
        open={newFileModalVisible}
        onOk={handleCreateFile}
        onCancel={() => { setNewFileModalVisible(false); setNewFileName(''); }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="输入文件名（如：main.py）"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          onPressEnter={handleCreateFile}
          autoFocus
        />
      </Modal>

      {/* 重命名弹窗 */}
      <Modal
        title="重命名文件"
        open={renameModalVisible}
        onOk={handleRenameFile}
        onCancel={() => { setRenameModalVisible(false); setRenameFileName(''); }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="输入新文件名"
          value={renameFileName}
          onChange={(e) => setRenameFileName(e.target.value)}
          onPressEnter={handleRenameFile}
          autoFocus
        />
      </Modal>

      {/* 设置面板 */}
      <Drawer
        title={<span style={{ color: '#cccccc' }}>⚙️ 编辑器设置</span>}
        placement="right"
        width={360}
        onClose={() => setSettingsVisible(false)}
        open={settingsVisible}
        styles={{
          header: { background: '#252526', borderBottom: '1px solid #191919' },
          body: { background: '#1e1e1e', padding: '16px' },
        }}
      >
        {/* 主题设置 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#cccccc', marginBottom: 8, fontSize: 13 }}>🎨 主题</div>
          <Select
            value={settings.theme}
            onChange={(value) => saveSettings({ ...settings, theme: value })}
            style={{ width: '100%' }}
            options={[
              { value: 'vs-dark', label: 'VS Code 深色' },
              { value: 'vs-light', label: 'VS Code 浅色' },
              { value: 'hc-black', label: '高对比度' },
            ]}
          />
        </div>

        <Divider style={{ background: '#3c3c3c', margin: '16px 0' }} />

        {/* 字体大小 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#cccccc', marginBottom: 8, fontSize: 13 }}>🔤 字体大小</div>
          <InputNumber
            min={8}
            max={32}
            value={settings.fontSize}
            onChange={(value) => saveSettings({ ...settings, fontSize: value })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Tab 大小 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#cccccc', marginBottom: 8, fontSize: 13 }}>📐 Tab 缩进</div>
          <Select
            value={settings.tabSize}
            onChange={(value) => saveSettings({ ...settings, tabSize: value })}
            style={{ width: '100%' }}
            options={[
              { value: 2, label: '2 空格' },
              { value: 4, label: '4 空格' },
              { value: 8, label: '8 空格' },
            ]}
          />
        </div>

        <Divider style={{ background: '#3c3c3c', margin: '16px 0' }} />

        {/* 显示设置 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#cccccc', fontSize: 13 }}>📊 显示 Minimap</span>
            <Switch
              checked={settings.minimap}
              onChange={(checked) => saveSettings({ ...settings, minimap: checked })}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#cccccc', fontSize: 13 }}>🔢 显示行号</span>
            <Switch
              checked={settings.lineNumbers}
              onChange={(checked) => saveSettings({ ...settings, lineNumbers: checked })}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#cccccc', marginBottom: 8, fontSize: 13 }}>🔄 自动换行</div>
          <Select
            value={settings.wordWrap}
            onChange={(value) => saveSettings({ ...settings, wordWrap: value })}
            style={{ width: '100%' }}
            options={[
              { value: 'off', label: '关闭' },
              { value: 'on', label: '开启' },
              { value: 'wordWrapColumn', label: '按列宽' },
            ]}
          />
        </div>

        <Divider style={{ background: '#3c3c3c', margin: '16px 0' }} />

        {/* 保存设置 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#cccccc', fontSize: 13 }}>💾 自动保存</span>
            <Switch
              checked={settings.autoSave}
              onChange={(checked) => saveSettings({ ...settings, autoSave: checked })}
            />
          </div>
        </div>

        {settings.autoSave && (
          <div style={{ marginBottom: 16, paddingLeft: 8 }}>
            <div style={{ color: '#858585', marginBottom: 8, fontSize: 12 }}>延迟时间（毫秒）</div>
            <InputNumber
              min={500}
              max={10000}
              step={100}
              value={settings.autoSaveDelay}
              onChange={(value) => saveSettings({ ...settings, autoSaveDelay: value })}
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#cccccc', fontSize: 13 }}>🧹 保存时格式化</span>
            <Switch
              checked={settings.formatOnSave}
              onChange={(checked) => saveSettings({ ...settings, formatOnSave: checked })}
            />
          </div>
        </div>

        <Divider style={{ background: '#3c3c3c', margin: '16px 0' }} />

        {/* 重置按钮 */}
        <Button
          block
          onClick={() => saveSettings({
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
          })}
          style={{ marginTop: 16 }}
        >
          🔄 恢复默认设置
        </Button>
      </Drawer>
    </Layout>
  );
}

export default App;