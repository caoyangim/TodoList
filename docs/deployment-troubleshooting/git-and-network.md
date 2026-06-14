# Git 与网络异常

## GitHub TLS 超时

只重试一次：

```bash
git -c http.version=HTTP/1.1 pull --ff-only origin main
```

仍失败时停止网络重试。可在本地已验证且已推送的仓库创建 Git bundle：

```bash
git bundle create todoflow-release.bundle main ^服务器当前提交
git bundle verify todoflow-release.bundle
```

上传后在服务器执行：

```bash
cd /var/www/todoflow
git fetch /tmp/todoflow-release.bundle main:refs/remotes/origin/main
git merge --ff-only origin/main
rm -f /tmp/todoflow-release.bundle
```

bundle 中的目标提交必须已经存在于真正的远程仓库。

## 服务器工作区不干净

```bash
git status
git diff
```

不要运行 `git reset --hard` 或删除未知修改。无法判断来源时停止并报告。

## 命令连接超时

不要立即重新发布，先检查：

```bash
pgrep -af 'deploy.sh|npm ci|next build'
git log -1 --oneline
pm2 status todoflow
```

进程仍在运行时等待并查看其日志；确认结束后才能决定是否重试。
