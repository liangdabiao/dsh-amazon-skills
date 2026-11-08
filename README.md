# dsh-amazon-skills · 亚马逊卖家工具箱

DeepSeek Harness（dsh）插件：**54 个亚马逊运营技能**随包分发（选品调研、Listing 优化、FBA 计算、PPC 广告、评论策略、关税计算……），外加两个**真实数据工具**（关键词长尾扩展、商品页结构化抓取）与一个侧栏工作台面板。

技能内容来自 [Amazon-Skills](https://github.com/nexscope-ai/Amazon-Skills)（MIT，Copyright (c) 2026 Nexscope AI）——见 `skills/LICENSE` 与 `skills/manifest.json`。


<img width="2493" height="1199" alt="image" src="https://github.com/user-attachments/assets/f0480edb-7e62-4f7a-a4f1-6d8ef33e9306" />

## 装上以后有什么

| 能力 | 说明 |
|---|---|
| **54 个技能** | `/amazon-*` 斜杠命令 + 模型自主触发：一站式单品调研（one-shot）、品类全景扫描、店铺竞品研究、关键词研究、Listing 8 维度审计、PPC 广告、FBA 费用、关税到岸成本、评论分析、季节规划、账号申诉 POA……全部中文输出 |
| `amazon_suggest` 工具 | 官方搜索补全 API（零鉴权）：一个种子词 → 100~200 个真实买家长尾搜索词。12 个市场（us/uk/de/fr/it/es/jp/ca/au/in/mx/br），请求节流防限流 |
| `amazon_fetch_listing` 工具 | 抓取商品详情页并结构化返回：标题/品牌/价格/评分/评论数/五点卖点/高清图数/A+/BSR/上架日期。仅访问亚马逊官方域名 |
| 侧栏「卖家工具箱」面板 | 📚 技能目录（54 技能分类/搜索/描述速览）；🔍 关键词扩展器（种子词 → 长尾表，一键复制） |
| 数据 | 技能产生的报告按各技能约定输出到**当前工作区** `reports/` 目录（沙箱可直接读写） |

技能与工具打通：`amazon-keyword-research` / `listing-optimization` / `ppc-campaign` 等技能原设计要跑的 curl 脚本，在本插件里由上面两个 Host 工具承接（沙箱读不到插件安装目录，这是刻意的架构选择）。

## 使用

对话里直接说：

- 「深度调研 B0CLLNGMQQ」（one-shot 技能）
- 「帮我扩展 building blocks 的长尾关键词，德国站」（amazon_suggest）
- 「抓一下 B0CLLNGMQQ 这个 listing 的标题价格五点」（amazon_fetch_listing）
- 「帮我写一条户外储能电源的 Listing，英文，A9 算法优化」（listing-optimization 技能）

或打开侧栏「卖家工具箱」：浏览 54 个技能 → 关键词扩展器出长尾表。

## 技能依赖与降级（安装即用，无 API Key）

| 类型 | 数量 | dsh 内行为 |
|---|---|---|
| 纯知识/分析 | ~30 | 直接可用 |
| 需 web_search/web_fetch | 13 | 有网络工具则用；没有时亚马逊公开数据走插件工具，其余请用户提供，不编造数字 |
| 带本地脚本（bash/python3） | 5 | 脚本逻辑由 Host 工具承接（suggest/fetch_listing）；FBA/关税计算暂按正文费率手工估算 |
| 需浏览器自动化（Playwright） | 3 | one-shot / category-research / store-research：有浏览器工具按原流程；没有则商品页字段降级走 fetch_listing，其余章节请用户粘贴或标注「数据缺失」 |

每个技能加载时自动注入以上环境说明（addendum），不需要用户操心。

## 自检

```bash
npm install && npm test && npm run selftest && npm run build
```

- `npm test`：14 个单测（快照合规/rewrite/addendum 分类/市场表/补全解析/字段提取/ASIN 校验/反爬识别/鉴权），零 dsh 依赖、零网络
- `npm run selftest`：54 技能逐个加载正文校验 rewrite/addendum + fixture 解析，零网络
- `npm run build`：打包 `dist/client.js` 并做产物三自检

## 更新技能快照

```bash
# bash 复制（本沙箱环境会静默杀掉 node cpSync，故用 bash）
cp -r "<上游>/skills" skills && rm -f skills/banner.png
node scripts/vendor-manifest.mjs
```


## 安装

```bash
# 从 GitHub 装（dist/client.js 已入库，装完即有面板）
dsh plugin --profile web add github:liangdabiao/dsh-amazon-skills

# 钉版本
dsh plugin --profile web add github:liangdabiao/dsh-amazon-skills#v0.1.1
```

> ⚠️ 本包**没有发布到 npm**，所以 `dsh plugin add dsh-amazon-skills` 会失败——请用上面的 `github:` 形式。
>
> `dist/client.js` 是入库文件：dsh 宿主直接消费已构建的客户端 bundle（`package.json` → `exports["./client"]`），缺它会导致插件激活失败、侧栏「卖家工具箱」面板不出现。改完源码记得 `npm run build` 再提交。

改了 Host 半边（工具/路由）后需要让插件条目重启一次：设置 → 插件里关掉再打开，或重启 dsh。

## 许可

- 插件代码：MIT
- `skills/` 快照内容：[Amazon-Skills](https://github.com/nexscope-ai/Amazon-Skills) 原仓库 **MIT**（Copyright (c) 2026 Nexscope AI），本插件保留其 LICENSE 与来源 manifest

特别致谢社区支持：https://linux.do
