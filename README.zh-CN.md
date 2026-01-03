# Storacha Admin TUI

这是一个独立的 Storacha 管理终端 UI 工具，提供了基础的Storacha空间及文件管理能力。

## 功能概览

- 查看空间列表与空间用量
- 查询指定主体的速率限制
- 分页浏览上传与 Blob，并查看详情
- 删除上传/Blob，支持批量清理并带安全确认

## 环境要求

- Node.js 18+
- Storacha 服务密钥与访问权限

## 安装

```bash
npm install
```

## 配置

在项目根目录创建 `.env`，或通过环境变量提供：

```
STORACHA_SERVICE_KEY=...
STORACHA_PROFILE=storacha-admin-tui
STORACHA_SERVICE_PROOF=...
STORACHA_LOGIN_EMAIL=you@example.com
STORACHA_PROVIDER_DID=did:web:...
```

上述配置都为可选项。如果未提供，首次运行会自动生成
agent key 并保存在本地 profile 中。

## 运行

```bash
npm start
```

或作为全局 CLI：

```bash
npm link
storacha-admin-tui
```

## 目录结构

- `src/admin`：Storacha 业务操作与菜单流程
- `src/tui`：基于 Blessed 的 TUI 组件
- `src/utils`：格式化与摘要工具
- `src/config`：环境变量与 multiformats 配置

## License

MIT
