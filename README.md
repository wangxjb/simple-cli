# simple-cli

`simple-cli` 是一个终端交互式 CLI，目标是提供接近 Codex 的命令行工作流：输入问题、模型决定是否调用本地只读工具、CLI 执行工具并把结果回传给模型，直到得到最终回答。

当前仓库内置的是 DeepSeek 适配器，但交互层和工具循环是独立的。只要新的模型服务能提供兼容的聊天接口，就可以替换掉模型适配层，复用这套 CLI。

## 能力

- 在终端里打开全屏交互界面，直接输入问题。
- 支持模型按需请求本地只读工具。
- 支持 `list_files`、`read_file`、`search_text`。
- 支持显示每一轮模型返回的思考过程、原始输出、工具调用和工具结果。
- 支持打字机式输出，不会一次性刷屏。
- 支持本地配置文件和代理，适合开发机、内网或代理环境。

## 最短上手

从 GitHub 克隆后，最短可用步骤如下：

```bash
git clone https://github.com/wangxjb/simple-cli.git
cd simple-cli
npm install
copy config.local.example.json config.local.json
```

然后编辑 `config.local.json`，填入你的 `apiKey`。

启动交互界面有两种方式：

```bash
npm start
```

或者先做全局链接，再直接使用 `scli`：

```bash
npm link
scli
```

`npm link` 不是必须的，它只是让你在任意目录都能直接敲 `scli`。

## 配置

配置读取优先级如下：

1. 环境变量
2. `config.local.json`
3. 默认值

支持的配置项：

- `apiKey`：模型服务的 API Key
- `baseUrl`：模型接口地址，默认 `https://api.deepseek.com`
- `model`：模型名称，默认 `deepseek-v4-flash`
- `proxyUrl`：可选代理地址

本地开发时，建议从示例文件复制配置：

```bash
copy config.local.example.json config.local.json
```

`config.local.json` 已被 `.gitignore` 忽略，不会被提交到仓库。

## 使用

启动后，直接在底部输入问题并回车即可。

示例：

```text
查看package.json文件的内容
```

如果模型需要读取本地上下文，它会返回工具调用；CLI 执行工具后再把结果发回模型，直到模型输出最终答案。

常用按键：

- `PageUp` / `PageDown`：翻页查看历史消息
- `↑` / `↓`：小幅滚动
- `Home` / `End`：跳到顶部或底部
- `Esc`：清空输入
- `Ctrl+C`：退出

## 工具

当前提供的只读工具：

- `list_files`：列出目录下文件
- `read_file`：读取单个文件内容
- `search_text`：在项目内搜索文本

这些工具只用于查看本地上下文，不会写入、删除或修改文件。

## 测试

```bash
npm test
```

## 模型替换

如果你不想用 DeepSeek，切换点在模型适配层，不在终端交互层。

- CLI、工具循环、打字机输出、历史消息展示都可以沿用。
- 需要替换的是具体的聊天客户端实现。
- 只要新的模型服务能提供类似的对话接口，就能接入这套 CLI。

## 能力路线图

agent 能力建设记录在 `docs/agent-capabilities`。每个能力都需要说明为什么做、解决什么问题、怎么实现、如何验证，以及后续如何改进。

## 命令名

安装完成后，全局命令名是 `scli`。
