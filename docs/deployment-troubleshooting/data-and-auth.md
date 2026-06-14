# 环境变量、登录与数据异常

## 修改 `.env`

必须先获得用户对具体变量和值的授权：

```bash
cd /var/www/todoflow
nano .env
chmod 600 .env
pm2 restart todoflow --update-env
```

不得输出 `cat .env`。管理员初始变量只在数据库没有用户时生效，不会自动修改已有密码。

AI 通过 SSH 操作时，应在内存中更新 `.env`，不得把密码放入命令参数或临时文件。

## 登录成功但仍回到登录页

使用浏览器 Network 面板或不持久化凭据的内存 HTTP 客户端检查 `Set-Cookie`。
纯 HTTP 部署的会话 Cookie 不能带 `Secure`。

不要把登录密码写进 `curl` 参数、shell 历史、脚本或日志。

## 生产数据修改

先停止应用并备份：

```bash
cd /var/www/todoflow
pm2 stop todoflow
mkdir -p backups
archive="backups/todoflow-data-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$archive" data
```

数据修改必须：

- 修改前查询现状。
- 使用参数化 SQL 或经过审阅的项目 Service。
- 使用事务并保持幂等。
- 已存在的目标数据跳过。
- 修改后核对数量、归属和关键字段。
- 删除临时脚本和临时数据文件。
- 无论成功失败都恢复 PM2。

```bash
pm2 start todoflow
pm2 status todoflow
```

禁止直接覆盖 `todoflow.db`，除非正在执行明确批准的备份恢复。
