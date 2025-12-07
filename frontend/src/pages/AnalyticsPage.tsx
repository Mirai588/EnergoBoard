import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api";
import { Property } from "../App";
import { PageHeader, Surface } from "../components/ui";
import { useMediaQuery } from "../hooks/useMediaQuery";

interface Props {
  selectedProperty: number | null;
  properties: Property[];
}

interface ResourceSummaryItem {
  resource_type: string;
  total_consumption: number;
  total_amount: number;
  unit?: string;
}

interface AnalyticsResponse {
  period: { start_year: number; start_month: number; end_year: number; end_month: number };
  monthly: { month: string; total_amount: number; total_consumption: number; cumulative_amount: number }[];
  monthly_by_resource?: { month: string; resource_type: string; consumption: number; amount: number }[];
  summary: {
    total_amount: number;
    total_consumption: number;
    average_daily_amount?: number;
    peak_month: string | null;
    resources?: ResourceSummaryItem[];
  };
  comparison: { property__id: number; property__name: string; total_amount: number; total_consumption: number }[];
  forecast_amount: number;
}

type FavoriteChartConfig = {
  id: string;
  name: string;
  properties: number[];
  resourceType: string;
  rangePreset: keyof typeof RANGE_PRESETS;
  metric: Metric;
  grouping: Grouping;
};

type Metric = "amount" | "consumption";
type Grouping = "total" | "resource";

const FAVORITES_KEY = "mf_favorite_charts";

const RESOURCE_LABELS: Record<string, string> = {
  electricity: "Электричество",
  cold_water: "Холодная вода",
  hot_water: "Горячая вода",
  gas: "Газ",
  heating: "Отопление",
};

const RANGE_PRESETS = {
  quarter: { label: "3 месяца", months: 3 },
  half: { label: "6 месяцев", months: 6 },
  year: { label: "Год", months: 12 },
  two: { label: "2 года", months: 24 },
} as const;

const RANGE_PRESET_OPTIONS = Object.entries(RANGE_PRESETS).sort(
  (a, b) => a[1].months - b[1].months,
);

const buildPeriodFromPreset = (preset: keyof typeof RANGE_PRESETS) => {
  const months = RANGE_PRESETS[preset].months;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);
  return {
    start_year: start.getFullYear(),
    start_month: start.getMonth() + 1,
    end_year: today.getFullYear(),
    end_month: today.getMonth() + 1,
  };
};

export function AnalyticsPage({ selectedProperty, properties }: Props) {
  const [rangePreset, setRangePreset] = useState<keyof typeof RANGE_PRESETS>("year");
  const [resourceType, setResourceType] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoriteCharts, setFavoriteCharts] = useState<FavoriteChartConfig[]>([]);
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteData, setFavoriteData] = useState<Record<string, AnalyticsResponse | null>>({});
  const [metric, setMetric] = useState<Metric>("amount");
  const [isCumulative, setIsCumulative] = useState<boolean>(false);
  const [grouping, setGrouping] = useState<Grouping>("total");
  const isCompact = useMediaQuery("(max-width: 900px)");

  useEffect(() => {
    if (selectedProperty && !selectedIds.length) {
      setSelectedIds([selectedProperty]);
    }
  }, [selectedProperty]);

  useEffect(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      try {
        setFavoriteCharts(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }
  }, []);

  const periodParams = useMemo(() => {
    return buildPeriodFromPreset(rangePreset);
  }, [rangePreset]);

  useEffect(() => {
    if (!selectedIds.length) return;
    setLoading(true);
    setError(null);
    api
      .get<AnalyticsResponse>("analytics/", {
        params: {
          properties: selectedIds.join(","),
          resource_type: resourceType || undefined,
          ...periodParams,
        },
      })
      .then(({ data }) => setData(data))
      .catch(() => setError("Не удалось загрузить аналитику"))
      .finally(() => setLoading(false));
  }, [selectedIds, resourceType, periodParams]);

  useEffect(() => {
    favoriteCharts.forEach((favorite) => {
      api
        .get<AnalyticsResponse>("analytics/", {
          params: {
            properties: favorite.properties.join(","),
            resource_type: favorite.resourceType || undefined,
            ...buildPeriodFromPreset(favorite.rangePreset),
          },
        })
        .then(({ data }) =>
          setFavoriteData((prev) => ({
            ...prev,
            [favorite.id]: data,
          })),
        )
        .catch(() => undefined);
    });
  }, [favoriteCharts]);

  useEffect(() => {
    setIsCumulative(false);
  }, [grouping, rangePreset, resourceType, metric]);

  const toggleProperty = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const persistFavorites = (items: FavoriteChartConfig[]) => {
    setFavoriteCharts(items);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
  };

  const addFavorite = () => {
    if (!selectedIds.length) return;
    const id = `${Date.now()}`;
    const name = favoriteName || `Виджет ${favoriteCharts.length + 1}`;
    const next: FavoriteChartConfig = {
      id,
      name,
      properties: selectedIds,
      resourceType,
      rangePreset,
      metric,
      grouping,
    };
    persistFavorites([...favoriteCharts, next]);
    setFavoriteName("");
  };

  const removeFavorite = (id: string) => {
    persistFavorites(favoriteCharts.filter((f) => f.id !== id));
  };

  if (!properties.length) return <Surface>Добавьте объект, чтобы увидеть аналитику.</Surface>;

  const resourceSummary = data?.summary.resources || [];
  const orderedMonthly = useMemo(
    () =>
      [...(data?.monthly || [])].sort((a, b) => (a.month > b.month ? 1 : -1)),
    [data],
  );

  const monthlyWithCumulative = useMemo(() => {
    let cumulativeAmount = 0;
    let cumulativeConsumption = 0;
    return orderedMonthly.map((m) => {
      cumulativeAmount = m.cumulative_amount ?? cumulativeAmount + m.total_amount;
      cumulativeConsumption += m.total_consumption;
      return {
        ...m,
        cumulative_amount: cumulativeAmount,
        cumulative_consumption: cumulativeConsumption,
      };
    });
  }, [orderedMonthly]);

  const averageDaily = useMemo(() => {
    if (!data) return { amount: 0, consumption: 0, days: 1 };
    const periodStart = new Date(data.period.start_year, data.period.start_month - 1, 1);
    const periodEnd = new Date(data.period.end_year, data.period.end_month, 0);
    const diffDays = Math.max(
      1,
      Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    );
    // Среднее в день: общая сумма/объем за выбранный период, делённые на количество календарных дней в этом периоде.
    return {
      amount: data.summary.average_daily_amount ?? data.summary.total_amount / diffDays,
      consumption: data.summary.total_consumption / diffDays,
      days: diffDays,
    };
  }, [data]);

  const averageDailyValue = metric === "amount" ? averageDaily.amount : averageDaily.consumption;
  const averageDailyUnit = metric === "amount" ? "₽" : "ед.";

  const monthlyByResource = useMemo(() => {
    const grouped: Record<string, { month: string; consumption: number; amount: number }[]> = {};
    (data?.monthly_by_resource || []).forEach((item) => {
      if (!grouped[item.resource_type]) grouped[item.resource_type] = [];
      grouped[item.resource_type].push({
        month: item.month,
        consumption: item.consumption,
        amount: item.amount,
      });
    });
    Object.values(grouped).forEach((list) => list.sort((a, b) => (a.month > b.month ? 1 : -1)));
    return grouped;
  }, [data]);

  const explorerSeries = useMemo(() => {
    if (!data) return [] as any[];
    if (grouping === "resource" && Object.keys(monthlyByResource).length) {
      const months = Array.from(new Set((data.monthly || []).map((m) => m.month))).sort();
      const cumulativeByResource: Record<string, number> = {};
      return months.map((month) => {
        const entry: any = { month };
        Object.entries(monthlyByResource).forEach(([res, values]) => {
          const point = values.find((v) => v.month === month);
          const rawValue = metric === "amount" ? point?.amount || 0 : point?.consumption || 0;
          cumulativeByResource[res] = (cumulativeByResource[res] || 0) + rawValue;
          entry[res] = isCumulative ? cumulativeByResource[res] : rawValue;
        });
        return entry;
      });
    }
    return monthlyWithCumulative.map((m) => ({
      month: m.month,
      value: isCumulative
        ? metric === "amount"
          ? m.cumulative_amount
          : m.cumulative_consumption
        : metric === "amount"
          ? m.total_amount
          : m.total_consumption,
    }));
  }, [data, grouping, isCumulative, metric, monthlyByResource, monthlyWithCumulative]);

  const topMovers = useMemo(() => {
    if (!data?.monthly?.length) return [] as { label: string; change: number }[];
    const sorted = [...data.monthly].sort((a, b) => (a.month > b.month ? 1 : -1));
    const movers: { label: string; change: number }[] = [];
    sorted.forEach((m, idx) => {
      if (idx === 0) return;
      const prev = sorted[idx - 1];
      const diff = (metric === "amount" ? m.total_amount - prev.total_amount : m.total_consumption - prev.total_consumption) /
        (metric === "amount" ? prev.total_amount || 1 : prev.total_consumption || 1);
      movers.push({ label: m.month, change: diff * 100 });
    });
    return movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 4);
  }, [data, metric]);

  const secondaryNav = (
    <div className="secondary-nav">
      <button className={grouping === "total" ? "active" : ""} onClick={() => setGrouping("total")} type="button">
        Итог по периоду
      </button>
      <button className={grouping === "resource" ? "active" : ""} onClick={() => setGrouping("resource")} type="button">
        Разрез по ресурсам
      </button>
    </div>
  );

  const filtersContent = (
    <>
      <div>
        <p className="subtitle">Объекты</p>
        <div className="property-grid">
          {properties.map((p) => {
            const active = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`pill property-chip ${active ? "active" : ""}`}
                onClick={() => toggleProperty(p.id)}
              >
                <span className="property-name">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="subtitle">Диапазон</p>
        <div className="inline">
          {RANGE_PRESET_OPTIONS.map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className={`pill ${rangePreset === key ? "active" : ""}`}
              onClick={() => setRangePreset(key as keyof typeof RANGE_PRESETS)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="subtitle">Ресурс</p>
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
          <option value="">Все</option>
          <option value="electricity">Электричество</option>
          <option value="cold_water">Холодная вода</option>
          <option value="hot_water">Горячая вода</option>
          <option value="gas">Газ</option>
          <option value="heating">Отопление</option>
        </select>
      </div>

      <div>
        <p className="subtitle">Метрика</p>
        <div className="secondary-nav">
          <button className={metric === "amount" ? "active" : ""} onClick={() => setMetric("amount")} type="button">
            Стоимость
          </button>
          <button
            className={metric === "consumption" ? "active" : ""}
            onClick={() => setMetric("consumption")}
            type="button"
          >
            Потребление
          </button>
        </div>
      </div>

      <div>
        <p className="subtitle">Закрепить конфигурацию</p>
        <input placeholder="Название виджета" value={favoriteName} onChange={(e) => setFavoriteName(e.target.value)} />
        <button type="button" onClick={addFavorite} disabled={!selectedIds.length}>
          Сохранить виджет
        </button>
        <p className="subtitle">Сохраняет объекты, ресурс, диапазон и выбранные метрики.</p>
      </div>
    </>
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Аналитический конструктор"
        title="Исследователь EnergoBoard"
        description="Настройте период, ресурс, метрику и сохраните любимые конфигурации как виджеты."
        actions={secondaryNav}
      />

      <div className={`analytics-layout ${isCompact ? "analytics-layout--compact" : ""}`}>
        {!isCompact && <aside className="analytics-filters">{filtersContent}</aside>}

        <section className="analytics-panels">
          {isCompact && (
            <section className="analytics-mobile-filters" aria-label="Фильтры аналитики">
              <header className="analytics-mobile-filters__intro">
                <p className="subtitle">Фильтры и объекты</p>
                <h3>Настройте выдачу перед графиками</h3>
              </header>
              {filtersContent}
            </section>
          )}
          {error && <Surface className="error">{error}</Surface>}
          {loading && <Surface>Загрузка...</Surface>}

          {data && (
            <>
              <div className="stat-grid">
                <Surface className="stat-card">
                  <p className="subtitle">Сумма за период</p>
                  <h2>{data.summary.total_amount.toFixed(2)} ₽</h2>
                  <p className="subtitle">Все начисления выбранного периода</p>
                </Surface>
                <Surface className="stat-card">
                  <p className="subtitle">Среднее в день</p>
                  <h2>
                    {averageDailyValue.toFixed(2)} {averageDailyUnit}
                  </h2>
                  <p className="subtitle">По {averageDaily.days} дням выбранного периода</p>
                </Surface>
                <Surface className="stat-card">
                  <p className="subtitle">Прогноз, ₽</p>
                  <h2>{data.forecast_amount.toFixed(2)}</h2>
                  <p className="subtitle">Оценка по истории выбранных объектов</p>
                </Surface>
              </div>

              <Surface>
                <div className="panel-header">
                  <div>
                    <h3>Тренды</h3>
                    <p className="subtitle">Гибкий график под выбранные параметры</p>
                  </div>
                  <div className="panel-actions">
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={isCumulative}
                        onChange={(e) => setIsCumulative(e.target.checked)}
                      />
                      <span>Накопительно</span>
                    </label>
                    <span className="badge">{grouping === "resource" ? "Разрез" : "Итог"}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  {grouping === "resource" && Object.keys(monthlyByResource).length ? (
                    <BarChart data={explorerSeries} stackOffset="none">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {Object.keys(monthlyByResource).map((key) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          name={RESOURCE_LABELS[key] || key}
                          stackId="a"
                          fill="#f97316"
                        />
                      ))}
                    </BarChart>
                  ) : (
                    <LineChart data={explorerSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="value" name={metric === "amount" ? "Начисления" : "Потребление"} stroke="#f97316" />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </Surface>

              <Surface>
                <div className="panel-header">
                  <div>
                    <h3>Разбивка ресурсов</h3>
                    <p className="subtitle">Сравнение суммарных значений в выбранном окне</p>
                  </div>
                </div>
                <div className="resource-grid">
                  {resourceSummary.map((res) => (
                    <div key={res.resource_type} className="resource-card">
                      <p className="subtitle">{RESOURCE_LABELS[res.resource_type] || res.resource_type}</p>
                      <h3 className="metric-value">
                        {(metric === "amount" ? res.total_amount : res.total_consumption).toFixed(2)} {metric === "amount" ? "₽" : res.unit || ""}
                      </h3>
                      <p className="subtitle">{metric === "amount" ? "Сумма" : "Объем"} за период</p>
                    </div>
                  ))}
                  {resourceSummary.length === 0 && <p className="subtitle">Нет разбиения по ресурсам.</p>}
                </div>
              </Surface>

              <div className="grid-2col">
                <Surface>
                  <div className="panel-header">
                    <h3>Кумулятивный итог</h3>
                    <p className="subtitle">Накопление выбранной метрики</p>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={monthlyWithCumulative}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey={
                          metric === "amount" ? "cumulative_amount" : "cumulative_consumption"
                        }
                        name={metric === "amount" ? "₽" : "Потребление"}
                        stroke="#ea580c"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Surface>

                <Surface>
                  <div className="panel-header">
                    <h3>Самые резкие изменения</h3>
                    <p className="subtitle">Доля изменений месяц к месяцу, %</p>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Месяц</th>
                          <th>Δ %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topMovers.map((m) => (
                          <tr key={m.label}>
                            <td>{m.label}</td>
                            <td>{m.change.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Surface>
              </div>

              <Surface>
                <div className="panel-header">
                  <h3>Сравнение объектов</h3>
                  <p className="subtitle">Суммарные значения в выбранном периоде</p>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Объект</th>
                        <th>Потребление</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.comparison.map((row) => (
                        <tr key={row.property__id}>
                          <td>{row.property__name}</td>
                          <td>
                            {metric === "consumption"
                              ? `${row.total_consumption.toFixed(2)}`
                              : "—"}
                          </td>
                          <td>{row.total_amount.toFixed(2)} ₽</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Surface>

              {favoriteCharts.length > 0 && (
                <Surface>
                  <div className="panel-header">
                    <h3>Сохранённые виджеты</h3>
                    <p className="subtitle">Мини-панели с сохранёнными фильтрами</p>
                  </div>
                  <div className="favorite-grid">
                    {favoriteCharts.map((fav) => {
                      const chartData = favoriteData[fav.id];
                      return (
                        <div key={fav.id} className="favorite-chart">
                          <div className="favorite-chart-header">
                            <div>
                              <strong>{fav.name}</strong>
                              <p className="subtitle">
                                {RANGE_PRESETS[fav.rangePreset].label} · {RESOURCE_LABELS[fav.resourceType] || (fav.resourceType ? fav.resourceType : "все ресурсы")}
                              </p>
                              <p className="subtitle">
                                {fav.metric === "amount" ? "Стоимость" : "Потребление"} · {fav.grouping === "resource" ? "Ресурсы" : "Итог"}
                              </p>
                            </div>
                            <button className="link" type="button" onClick={() => removeFavorite(fav.id)}>
                              Удалить
                            </button>
                          </div>
                          {chartData ? (
                            <ResponsiveContainer width="100%" height={160}>
                              {fav.grouping === "resource" && chartData.monthly_by_resource ? (
                                <BarChart
                                  data={Array.from(new Set((chartData.monthly || []).map((m) => m.month))).map((month) => {
                                    const entry: any = { month };
                                    (chartData.monthly_by_resource || [])
                                      .filter((i) => i.month === month)
                                      .forEach((point) => {
                                        entry[point.resource_type] = fav.metric === "amount" ? point.amount : point.consumption;
                                      });
                                    return entry;
                                  })}
                                  stackOffset="none"
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="month" />
                                  <YAxis />
                                  <Tooltip />
                                  <Legend />
                                  {(chartData.monthly_by_resource || [])
                                    .reduce((acc: string[], cur) => (acc.includes(cur.resource_type) ? acc : [...acc, cur.resource_type]), [])
                                    .map((key) => (
                                      <Bar key={key} dataKey={key} name={RESOURCE_LABELS[key] || key} stackId="a" fill="#f97316" />
                                    ))}
                                </BarChart>
                              ) : (
                                <LineChart data={chartData.monthly}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="month" />
                                  <YAxis />
                                  <Tooltip />
                                  <Legend />
                                  <Line type="monotone" dataKey={fav.metric === "amount" ? "total_amount" : "total_consumption"} name="Значение" stroke="#f97316" />
                                </LineChart>
                              )}
                            </ResponsiveContainer>
                          ) : (
                            <p className="subtitle">Загрузка...</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Surface>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
