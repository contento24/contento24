![未知迪克](https://raw.githubusercontent.com/Contento24/contento24/refs/heads/main/resources/Contento24_full.png)

# Contento24

[测试聊天室](https://l.867678.xyz/contento24/)

消歧义：项目本名`Contento24` 但为了方便管理 所有出现在URL或Shell中的名称统一为`contento24`

一个开源的实时公共 WebSocket 聊天室。消息只在在线用户之间广播，服务器不保存聊天记录，刷新页面后本地内容会消失。

### 隐藏交互说明

在聊天框中还藏有少量终端风格的隐藏交互。熟悉 Linux 与 macOS 命令行的用户，或许会在某次输入时偶然遇见。

终端风格的隐藏交互完全由浏览器前端呈现，不会执行任何真实的系统命令，也不会将触发内容发送至服务器或广播给聊天室中的其他用户。

README 不公开具体触发方式，以保留探索的乐趣。

## 🛠 如何自建服务器

警告：默认使用 3000 端口，也可以通过 `PORT` 环境变量修改。项目同时使用 HTTP 和 WebSocket。

安装依赖（以debian sid版本为例 需要root权限）

```bash
apt update
apt install -y nodejs npm git
npm install -g pnpm
pnpm -v # 有输出证明上面几步没有失败
```

下载文件包并初始化

```bash
tar -xzf contento24.tar.gz
cd contento24/
pnpm install
```

将server.js配置为systemd服务

需注意要替换`path_contento24`字段为Contento24源码所在目录

nodejs二进制文件所在位置 这个默认的应该没问题 如果你的有出入请自行修改

```ini
cat <<'EOF'> /usr/lib/systemd/system/contento24.service
[Unit]
Description=Contento24 Server.js Service
Documentation=https://867678.xyz/project/contento24/
After=network.target

[Service]
Type=simple
WorkingDirectory=path_contento24
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
```

重载systemd并启动服务

```bash
systemctl daemon-reload
systemctl start contento24.service
systemctl enable contento24.service # 可选 设置为开机自启
systemctl status contento24.service # 可选 查看服务状态
```

或者也可以尝试直接启动

```bash
# 在项目根目录下
pnpm dev
```

## 📚 进阶教程

### 可选环境变量：

添加环境变量可以指定某些参数以适应更多工作环境。

- `PORT`：服务监听端口，默认为 `3000`。
- `ALLOWED_ORIGINS`：允许建立 WebSocket 连接的来源，多个来源使用英文逗号分隔；未设置时允许所有来源。

### 🛜 使用Nginx反向代理（可以添加TLS）

需注意透传IP 否则显示的发送者IP可能不正确

如果你使用别的IP或端口请替换下面`127.0.0.1:3000`指向正确的服务器和端口

```
location /contento24/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
}
```

### 🔧 如何开发

以ArchLinux为例

```
sudo pacman -Syyuu --needed git nodejs
# 直接安装Archlinux源中自带的pnpm将无法self-upgrade 需注意pnpm偶尔可能对npm有依赖关系
sudo corepack enable # 是的需要root权限
corepack use pnpm@latest
# 如果希望更新pnpm请将prepare换成use
git clone git@github.com:contento24/contento24.git
cd contento24
pnpm install
pnpm dev # 启动ws服务器
```

## 🙏 特别鸣谢

排名不分先后

项目创建、想法、美术、UI优化、联合维护者：[MidQwerty](https://github.com/midqwerty-alt)

服务器、细节与性能优化：[MoAEIOU](https://867678.xyz)

> 提供服务或引用软件：

域名提供商：<https://spaceship.com>

CDN、DNS、攻击保护：<https://cloudflare.com>

代码托管和分发：<https://github.com>

AI：<https://chatgpt.com> <https://claude.ai>

Web服务器：<https://nginx.org>

服务器提供商：<https://colocrossing.com>

## ⚖️ 项目许可

此项目以GNU Affero General Public License v3.0或更高版本授权

详细请参阅此存储库下的LICENSE文件
