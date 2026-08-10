![未知迪克](https://raw.githubusercontent.com/contento24/contento24/refs/heads/main/origin_resources/Contento24.png)

# Contento24

[测试聊天室](https://l.867678.xyz/contento24/)

一个开源的实时公共 WebSocket 聊天室。消息只在在线用户之间广播，服务器不保存聊天记录，刷新页面后本地内容会消失。

## 🛠 如何自建服务器

> 警告：默认使用 3000 端口，也可以通过 `PORT` 环境变量修改。
>
> 项目使用 HTTP（可能有HTTPS 推荐使用） 和 WebSocket（也可以用WSS），请确保您的环境支持上述协议。

### 安装依赖（以Debian trixie版本为例 需要root权限）

> 需保证最少是个nodejs 24.0.0，tar支持解压zstd，wget支持https

```bash
apt update
apt install -y nodejs wget tar
```

### 下载文件包并初始化

> 如果当前目录已经有一个contento24 请将其删除 否则将可能安装失败

```bash
mkdir -p contento24/
cd contento24/
wget https://github.com/contento24/contento24/releases/latest/download/contento24.tar.zst
tar -xzf contento24.tar.zst
rm contento24.tar.zst
```

### 更新

> 确保你在contento24/的上级文件夹

```bash
rm -rf contento24/
mkdir -p contento24/
cd contento24/
wget https://github.com/contento24/contento24/releases/latest/download/contento24.tar.zst
tar -xvf contento24.tar.zst
rm contento24.tar.zst
cd ..
systemctl restart contento24
```

### 运行服务

```bash
cd contento24/
pnpm dev #如果你装有pnpm
node ./server.js #必须有nodejs
```

弹出下列提示表示成功启动服务

```bash
Listening on http://localhost:3000
```

### 创建服务（如果你使用systemd）

将server.js配置为systemd服务

> 需注意要替换`/var/www/html/contento24`字段为Contento24源码所在目录
>
> node二进制文件所在位置 也就是`/usr/bin/node` 默认值一般没问题
>
> 如果你的有出入请执行`which node` 根据输出自行修改

```ini
cat <<'EOF'> /usr/lib/systemd/system/contento24.service
[Unit]
Description=Contento24 Service
Documentation=https://867678.xyz/project/contento24/
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/html/contento24
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
```

### 重载systemd并启动服务

```bash
systemctl daemon-reload
systemctl start contento24.service
systemctl enable contento24.service # 可选 设置为开机自启
systemctl status contento24.service # 可选 查看服务状态
```

## 📚 进阶教程

### 可选环境变量：

添加环境变量可以指定某些参数以适应更多工作环境。

- `PORT`：服务监听端口，默认为 `3000`。
- `ALLOWED_ORIGINS`：允许建立 WebSocket 连接的来源，多个来源使用半角逗号分隔；未设置时允许所有来源。

### 🛜 使用Nginx反向代理（可以添加TLS）

如果你使用别的IP或端口请替换下面`127.0.0.1:3000`指向正确的服务器和端口

```ini
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

### 🔧 如何初始化环境（自行开发本项目）

以ArchLinux为例

> 需要root权限
>
> 下面使用`corepack`安装pnpm

```bash
sudo pacman -Syyuu --needed git nodejs
sudo corepack enable
corepack use pnpm@latest
git clone git@github.com:contento24/contento24.git
cd contento24
pnpm install

# 下面是可选项

pnpm dev # 启动本地服务器
pnpm check # 检查代码格式。这不能检查问题，只是语法检查
```

## 🙏 特别鸣谢

项目创建、想法、美术、UI优化、联合维护者：[MidQwerty](https://github.com/midqwerty-alt)

服务器、细节与性能优化：[MoAEIOU](https://867678.xyz)

## 📋 其他

消歧义：项目本名`Contento24` 但为了方便管理 所有出现在URL或Shell中的名称统一为`contento24`

### 隐藏交互说明

在聊天框中还藏有少量终端风格的隐藏交互。熟悉 Linux 与 macOS 命令行的用户，或许会在某次输入时偶然遇见。

终端风格的隐藏交互完全由浏览器前端呈现，不会执行任何真实的系统命令，也不会将触发内容发送至服务器或广播给聊天室中的其他用户。

## ⚖️ 项目许可

此项目以GNU Affero General Public License v3.0或更高版本授权

详细请参阅此存储库下的LICENSE文件
