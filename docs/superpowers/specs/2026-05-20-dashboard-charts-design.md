# Dashboard 图表展示增强 — 设计文档

- **日期**:2026-05-20
- **状态**:已批准,待实现规划
- **范围**:用户侧 `/dashboard` 页面(`GET /api/dashboard`,JWT 鉴权)。不涉及 admin、不涉及 `/v1/*`。

## 1. 背景与目标

当前 `/dashboard` 页面(`frontend/src/pages/dashboard.tsx`)**完全没有图表**:4 个 KPI 卡片 + 「最近活动」列表 + 「Top 模型」「Top API Key」两个纯文字 stat 列表。后端 `GET /api/dashboard`(`backend/app/api/dashboard.py`)只返回当前快照(今日计数、本月汇总、Top 5),**没有任何时间序列数据**。前端**未安装任何图表库**。

`request_logs` 表已有足够画图的原始数据(`created_at`、`cost`、`request_type`、`status`、`model_id` 等),所以本项目的工作是「加聚合接口 + 加前端渲染」,不需要新数据。

**目标**:在 `/dashboard` 增加基础的「花费 + 用量」可视化,让用户看清「最近花了多少、用量趋势如何、钱花在哪些模型上」。

**调研结论**(OpenAI / Anthropic / OpenRouter / Helicone 用量 dashboard):
- 「花费随时间」公认用**柱状图**;「请求数随时间」柱状图也是主流。
- Helicone 的指标卡片式(小标题 + 大数字 + 紧凑图)最简洁,本设计采用其卡片风格。

## 2. 决策记录

| 决策 | 选择 | 说明 |
|---|---|---|
| 关注点 | 花费 + 用量趋势 | 不做延迟图、失败率图(运维观测类) |
| 放哪 | 嵌入现有 `/dashboard` 页面 | 不新建独立分析页 |
| 时间范围 | 7 天 / 30 天切换 | 后端固定返回 30 天,前端切换=客户端切片 |
| 图表数量 | 花费 + 请求数 两张 | |
| 实现技术 | 手写 SVG,**不引图表库** | 符合项目「UI 原语全手写」的约定 |
| 视觉风格 | Helicone 卡片式 | 小标题 + 大数字 + 紧凑柱状图 + 首尾日期标签 |
| 月度上限可视化 | 否(选 1B) | 上限按 API Key 存(`api_keys.monthly_limit`),无用户级总上限;改为「本月花费」提升展示 |
| Top 模型 | 升级为横向条形图 | Top API Key 保持纯文字列表不变 |

**明确不做**:延迟图、失败率/错误率图、占比环形图、独立分析页、自定义日期范围选择器、CSV/PDF 导出、Top API Key 改图、月度上限进度条。

## 3. 三块改动总览

1. **用量趋势区块** — 两张 Helicone 卡片式堆叠柱状图(花费 / 请求数),放在 KPI 条与下方主 grid 之间。
2. **本月花费** — 提升为 KPI 条里独立的一格(当前它只是「今日花费」卡的副文本)。
3. **Top 模型** — 纯文字 stat 列表升级为横向条形图。

## 4. 后端设计

### 4.1 接口

**不新增 endpoint。** 扩展现有 `GET /api/dashboard` 的 `DashboardOut`,**只新增一个字段**:

```python
daily_usage: list[DailyUsageEntry]   # 最近 30 个 UTC 自然日,按日期升序,含今天
```

`month_spend`、`top_models_by_cost` 字段**已存在**——「本月花费」KPI 格和「Top 模型横向条形图」直接复用,后端无需为这两块改动。

### 4.2 新 Pydantic 模型

```python
class DailyUsageEntry(BaseModel):
    date: date              # 该 UTC 自然日
    text_cost: Decimal
    image_cost: Decimal
    video_cost: Decimal
    text_requests: int
    image_requests: int
    video_requests: int
```

### 4.3 聚合查询

一条 group-by 查询,按 **UTC 自然日** 和 `request_type` 分组:

```python
start = today_utc() - timedelta(days=29)   # today_utc() 来自 utils/time.py,返回今天 00:00 UTC
day_col = func.date(func.timezone("UTC", RequestLog.created_at)).label("d")
rows = (
    db.query(
        day_col,
        RequestLog.request_type,
        func.coalesce(func.sum(RequestLog.cost), 0).label("cost"),
        func.count(RequestLog.id).label("n"),
    )
    .filter(RequestLog.user_id == user.id, RequestLog.created_at >= start)
    .group_by(day_col, RequestLog.request_type)
    .all()
)
```

- **UTC 日界**:用 `func.timezone("UTC", created_at)` 显式锁时区(等价 SQL `created_at AT TIME ZONE 'UTC'`),不依赖 DB session 时区。与现有 `today_utc()` / `month_spend` 的 UTC 口径一致。
- **失败请求**:`status="failed"` 的 `cost=0`(项目不变量),`sum(cost)` 自然不计失败的花费;`count(*)` **计入所有状态**——与现有 KPI `_count_by_type` 行为一致(它不过滤 status)。

### 4.4 纯函数:补零 + 透视

把「30 天补零 + 透视成连续序列」抽成 dashboard.py 的模块级**纯函数**,便于单测:

```python
def build_daily_usage(
    rows: list[tuple[date, str, Decimal, int]],
    start: date,
    num_days: int = 30,
) -> list[DailyUsageEntry]:
    """把 (day, request_type, cost, count) 分组行透视成 num_days 个连续日桶。
    缺失的天补零。只识别 request_type ∈ {text, image, video},其它类型忽略。
    返回按日期升序的列表。"""
```

要点:
- 输出**恒为 `num_days` 个元素**,日期从 `start` 到 `start + (num_days-1)` 连续,无缺口。
- 钱全程 `Decimal`:`cost` 来自 SQL `sum`,包装为 `Decimal(str(value))`,绝不经过 `float`。
- 空输入 → 30 个全零桶。

`dashboard()` 路由把 `rows` 和 `start.date()` 传给 `build_daily_usage`,结果塞进 `DashboardOut.daily_usage`。

### 4.5 索引

无需新索引。`request_logs` 已有 `user_id`、`created_at` 索引;现有 `month_spend` 查询就是 `user_id + created_at >= ...` 的同样过滤,保持一致。

## 5. 前端设计

### 5.1 新 UI 原语 `src/components/ui/bar-chart.tsx`

手写 SVG **堆叠柱状图**,无外部依赖。

```ts
export type BarSeries = { key: string; label: string; colorVar: string };
// colorVar 是 CSS 变量名,如 "--info" / "--warn" / "--accent"
export type BarDatum = { label: string; tooltipLabel: string; values: Record<string, number> };

export function BarChart(props: {
  data: BarDatum[];
  series: BarSeries[];           // 堆叠顺序(底→顶)
  height?: number;               // 默认 130
  formatValue: (n: number) => string;  // tooltip 与合计数值格式化
  emptyText: string;             // 全 0 时显示
}): JSX.Element;
```

实现要点:
- **响应式宽度**:`<svg width="100%" height={height} viewBox="0 0 W height" preserveAspectRatio="none">`,柱子按 viewBox 逻辑坐标布局,浏览器横向缩放。**无需 ResizeObserver**。
- **堆叠柱**:每个 `BarDatum` 一列,`series` 各段用 `<rect>` 堆叠;最大值取所有 datum 的堆叠总和。柱顶 2–3px 圆角(顶段 rect 圆角)。
- **hover tooltip**:每天一个透明全高 `<rect>` 命中区,`onMouseEnter` 记 hovered index 到 React state。tooltip 是绝对定位的 HTML `<div>`(不放 SVG 内),`left` 用百分比定位 `(i + 0.5) / n * 100%`;内容为 `tooltipLabel` + 各 series 值 + 合计。
- **空状态**:所有 datum 的所有值为 0 → 渲染居中的 muted `emptyText`,不画柱子。
- **配色**:`fill` 用 `var(--xxx)` 引 CSS token,不硬编码色值。
- TS strict,无 `any`。

### 5.2 新区块组件 `src/components/usage-trends.tsx`

「用量趋势」区块,含两张 Helicone 卡片式图。

- 顶部:区块标题「用量趋势」+ 右侧 7天/30天 切换(`Tabs` 或简单按钮组,复用现有 UI 风格)。
- local state `range: 7 | 30`;切换只做 `daily_usage.slice(-range)`,**不重新请求接口**。
- 两张卡 `lg` 并排、移动端堆叠。每张卡:
  - 左上小标题(花费 / 请求数),右上类型图例(文本/图片/视频 三个色点)。
  - 中间**大数字**(选定范围内的合计:花费=求和,请求数=求和),mono 字体。
  - 下方 `<BarChart>`,`height≈130`。
  - 底部一行 X 轴:只标首尾日期(首日 / 末日)。
- 三个 series 复用 `TypeBadge` 的「类型→颜色」约定:
  - `text` → `--info`(蓝)、`image` → `--warn`(琥珀)、`video` → `--accent`(绿)。
- 花费图:`formatValue` 用金额格式(复用 `fmtCompactMoney` / `fmtBalance` 的口径);堆叠 `text_cost/image_cost/video_cost`。
- 请求数图:`formatValue` 用整数;堆叠 `text_requests/image_requests/video_requests`。

### 5.3 `src/pages/dashboard.tsx` 改动

1. **本月花费提升为 KPI 格**:`KpiStrip` 从 4 格变 5 格 —— 余额 / 今日花费 / **本月花费** / 今日文本请求 / 近期失败。`本月花费` 值用已有的 `data.month_spend`。「今日花费」卡原来的副文本(`kpiThisMonthHint`,即「本月 $X」)随之移除或留空,避免重复。
2. **插入 `<UsageTrends>`**:位置在 `<KpiStrip>` 与下方主 grid `<div className="grid ...">` 之间,传入 `data?.daily_usage`。
3. **Top 模型改横向条形图**:`top_models_by_cost` 那段,把 `<StatRows>` 换成横向条形渲染——每行:模型名(左)+ 横向条(宽度 = 该模型 cost / 最大 cost)+ 金额(右)。点击仍跳 `/logs?model=...`。「Top API Key」那段 `<StatRows>` **保持不变**。
   - 横向条用一个轻量内联渲染或小 helper 即可,不必做成通用原语;条形颜色用 `--info` 或 `--primary`。

### 5.4 类型与基础设施

- `src/lib/types.ts` 新增 `DailyUsage` 类型(对应后端 `DailyUsageEntry`),`dashboard.tsx` 的 `DashboardOut` 本地类型加 `daily_usage: DailyUsage[]`。共享类型集中放置(项目不变量 #8)。
- i18n:`src/lib/i18n/dict-en.ts` 与 `dict-zh.ts` 新增 key —— 区块标题、两图标题、7天/30天、图例三项(文本/图片/视频)、空状态文案、tooltip「合计」、本月花费 KPI 标签。组件用 `useT()`。
- `frontend/DESIGN.md`:在 `## Components` 下新增 `BarChart` 原语条目(项目约定:新视觉原语须同次改动记入 DESIGN.md)。
- TS strict(`strict` / `noImplicitAny`):新代码不得引入 `any`,用 `unknown` 并收窄。

## 6. 测试与验证

### 6.1 后端

- **纯函数单测** `backend/tests/test_dashboard_usage.py`:测 `build_daily_usage` —— ① 空输入返回 30 个全零桶;② 单日单类型;③ 多日多类型透视正确;④ 缺失的天补零、输出恒为 30 个且日期连续升序;⑤ cost 为 `Decimal` 类型、不退化为 `float`。纯函数测试,任意环境可跑。
- **接口 shape 集成测试**:在 `backend/tests/` 验证 `GET /api/dashboard` 返回含 `daily_usage` 且为 30 元素。需 Postgres,无则 auto-skip(沿用现有集成测试约定)。
- 不破坏现有 dashboard 相关测试。

### 6.2 前端

- 无前端单测基建。验证 = `cd frontend && npm run build`(内含 `tsc -b`)通过,无类型错误。

## 7. 不变量符合性检查

- **#1 钱是 `Decimal`**:`DailyUsageEntry` 的 cost 字段声明 `Decimal`;SQL `sum` 结果以 `Decimal(str(...))` 包装;前端只做展示不做钱的运算。
- **#8 共享 TS 类型集中**:`DailyUsage` 放 `lib/types.ts`。
- **DESIGN.md**:新 `BarChart` 原语同次记入。
- 鉴权不变:沿用 `get_current_user`(JWT),不碰 `/v1/*` 与 API Key 路径。
- 不触碰 billing / cost_service / gateway 热路径。

## 8. 实现顺序建议

1. 后端:`DailyUsageEntry` + `build_daily_usage` 纯函数 + 查询 + 接到 `DashboardOut`;补纯函数单测。
2. 前端:`BarChart` 原语 + `DESIGN.md` 条目。
3. 前端:`UsageTrends` 区块组件 + i18n key + `types.ts`。
4. 前端:`dashboard.tsx` 集成(KPI 格、插入区块、Top 模型横向条形)。
5. 验证:后端 `pytest`、前端 `npm run build`。
