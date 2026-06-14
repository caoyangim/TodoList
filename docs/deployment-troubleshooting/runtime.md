# 构建、PM2 与健康检查异常

## 构建失败

`scripts/deploy.sh` 会恢复旧 `.next` 并重新启动 PM2。检查：

```bash
cd /var/www/todoflow
pm2 status todoflow
pm2 logs todoflow --lines 100 --nostream
test -f .next/BUILD_ID
```

不要在原因不明时删除 `.next` 或再次运行发布。

## PM2 不在线

```bash
cd /var/www/todoflow
pm2 logs todoflow --lines 100 --nostream
pm2 restart todoflow --update-env
```

PM2 中不存在应用时：

```bash
pm2 start npm --name todoflow -- start
pm2 save
```

## 健康检查失败

```bash
curl -i --max-time 15 http://127.0.0.1:3000/login
ss -lntp | grep ':3000'
pm2 status todoflow
pm2 logs todoflow --lines 100 --nostream
```

旧错误日志不一定代表当前故障，应同时核对日志时间、PM2 uptime 和当前 HTTP 响应。

## Nginx 异常

普通发布无需重启 Nginx。配置变更后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

代理必须传递：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```
