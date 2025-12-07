import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../api";
import { Property } from "../App";
import { PageHeader, Surface } from "../components/ui";

const RESOURCE_LABELS: Record<string, string> = {
  electricity: "Электричество",
  cold_water: "Холодная вода",
  hot_water: "Горячая вода",
  gas: "Газ",
  heating: "Отопление",
};

interface Props {
  selectedProperty: number | null;
  properties: Property[];
  onSelectProperty: (id: number) => void;
}

interface ForecastResponse {
  forecast_amount: number;
}

interface AnalyticsResponse {
  monthly: { month: string; total_amount: number; total_consumption: number }[];
  summary: { total_amount: number };
  monthly_by_resource?: { month: string; resource_type: string; consumption: number; amount: number }[];
}

type FavoriteChartConfig = {
  id: string;
  name: string;
  properties: number[];
  resourceType: string;
  rangePreset: "year" | "half" | "two";
};

type GoalConfig = {
  threshold: number;
  metric: "amount" | "consumption";
};

const FAVORITES_KEY = "mf_favorite_charts";
const GOALS_KEY = "eb_goals";

const RANGE_LABELS: Record<FavoriteChartConfig["rangePreset"], string> = {
  year: "Год",
  half: "6 месяцев",
  two: "2 года",
};

const formatMonth = (m: string) => {
  const [year, month] = m.split("-");
  return `${month}.${year.slice(-2)}`;
};

const monthKey = (dateObj: Date) => `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;

export function Dashboard({ selectedProperty, properties, onSelectProperty }: Props) {
  const [forecast, setForecast] = useState<number>(0);
  const [readings, setReadings] = useState<any[]>([]);
  const [charges, setCharges] = useState<AnalyticsResponse | null>(null);
  const [favoriteCharts, setFavoriteCharts] = useState<FavoriteChartConfig[]>([]);
  const [favoritesData, setFavoritesData] = useState<Record<string, AnalyticsResponse>>({});
  const [goals, setGoals] = useState<Record<number, GoalConfig>>(() => {
    const saved = localStorage.getItem(GOALS_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    if (!selectedProperty && properties.length > 0) {
      onSelectProperty(properties[0].id);
    }
  }, [properties]);

  useEffect(() => {
    if (selectedProperty) {
      api
        .get<ForecastResponse>("analytics/forecast/", { params: { property: selectedProperty } })
        .then(({ data }) => setForecast(Number(data.forecast_amount) || 0));

      api
        .get("readings/", { params: { meter__property: selectedProperty } })
        .then(({ data }) => setReadings(data));

      const startDate = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
      api
        .get<AnalyticsResponse>("analytics/", {
          params: {
            property: selectedProperty,
            start_year: startDate.getFullYear(),
            start_month: startDate.getMonth() + 1,
            end_year: new Date().getFullYear(),
            end_month: new Date().getMonth() + 1,
          },
        })
        .then(({ data }) => setCharges(data));
    }
  }, [selectedProperty]);

  useEffect(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      try {
        setFavoriteCharts(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    favoriteCharts.slice(0, 4).forEach((favorite) => {
      api
        .get<AnalyticsResponse>("analytics/", {
          params: {
            properties: favorite.properties.join(","),
            resource_type: favorite.resourceType || undefined,
            ...getPeriodFromPreset(favorite.rangePreset),
          },
        })
        .then(({ data }) =>
          setFavoritesData((prev) => ({
            ...prev,
            [favorite.id]: data,
          })),
        )
        .catch(() => undefined);
    });
  }, [favoriteCharts]);

  const today = new Date();
  const currentMonthKey = monthKey(today);
  const previousMonthKey = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));

  const currentMonthAmount = charges?.monthly.find((m) => m.month === currentMonthKey)?.total_amount ?? 0;
  const previousMonthAmount = charges?.monthly.find((m) => m.month === previousMonthKey)?.total_amount ?? 0;

  const getPeriodFromPreset = (preset: FavoriteChartConfig["rangePreset"]) => {
    const monthsMap: Record<FavoriteChartConfig["rangePreset"], number> = {
      year: 12,
      half: 6,
      two: 24,
    };
    const months = monthsMap[preset];
    const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);
    return {
      start_year: start.getFullYear(),
      start_month: start.getMonth() + 1,
      end_year: today.getFullYear(),
      end_month: today.getMonth() + 1,
    };
  };

  const insights = useMemo(() => buildInsights(charges, readings), [charges, readings]);

  const goalForProperty = selectedProperty ? goals[selectedProperty] : undefined;
  const goalStatus = useMemo(() => {
    if (!goalForProperty || !charges) return null;
    const metricValue =
      goalForProperty.metric === "amount"
        ? currentMonthAmount
        : charges.monthly.reduce((sum, m) => sum + m.total_consumption, 0) / (charges.monthly.length || 1);
    const met = metricValue <= goalForProperty.threshold;
    return { met, value: metricValue };
  }, [goalForProperty, currentMonthAmount, charges]);

  const updateGoal = (threshold: number, metric: GoalConfig["metric"]) => {
    if (!selectedProperty) return;
    const next = { ...goals, [selectedProperty]: { threshold, metric } };
    setGoals(next);
    localStorage.setItem(GOALS_KEY, JSON.stringify(next));
  };

  const lastReadings = readings.slice(0, 6);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Быстрый обзор по объекту"
        title="Дашборд энергопотребления"
        description="Прогноз, цели, инсайты и закреплённые панели собраны в одном экране."
        actions={
          <div className="secondary-nav" aria-label="Навигация рабочего места">
            <button className="active" type="button">
              Главная
            </button>
            <button type="button" onClick={() => onSelectProperty(selectedProperty || properties[0]?.id)}>
              Обновить данные
            </button>
          </div>
        }
      />

      <Surface>
        <div className="section-grid align-center">
          <div>
            <p className="subtitle">Активный объект</p>
            <select value={selectedProperty || ""} onChange={(e) => onSelectProperty(Number(e.target.value))}>
              <option value="" disabled>
                Выберите объект
              </option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="tag-row mt-sm">
              <span className="tag">Лента показаний</span>
              <span className="tag">Цели и сигналы</span>
              <span className="tag">Панели из исследователя</span>
            </div>
          </div>
          <div className="info-tile highlight-panel">
            <p className="subtitle">Прогноз на месяц</p>
            <div className="stat-value">{forecast.toFixed(2)} ₽</div>
            <span className="badge">По истории начислений</span>
          </div>
          <div className="info-tile">
            <p className="subtitle">Изменение к прошлому месяцу</p>
            <div className="stat-value">{(currentMonthAmount - previousMonthAmount).toFixed(2)} ₽</div>
            <p className="subtitle">{formatMonth(currentMonthKey)} vs {formatMonth(previousMonthKey)}</p>
          </div>
        </div>
      </Surface>

      {goalForProperty && goalStatus && (
        <Surface tone="soft">
          <PageHeader
            variant="section"
            align="center"
            title="Цель по объекту"
            description="Контроль расходов без влияния на расчёты."
            actions={
              <span className={`badge goal-status ${goalStatus.met ? "met" : "missed"}`}>
                {goalStatus.met ? "Цель достигнута" : "Цель превышена"}
              </span>
            }
          />
          <p className="subtitle">
            Текущее значение: {goalForProperty.metric === "amount" ? `${goalStatus.value.toFixed(2)} ₽` : `${goalStatus.value.toFixed(2)}`}
          </p>
        </Surface>
      )}

      <div className="grid-2col">
        <Surface>
          <PageHeader variant="section" align="center" title="Инсайты" description="Сдвиги, всплески и тишина по приборам." />
          <div className="insight-grid">
            {insights.map((insight) => (
              <div key={insight.title} className="insight-card">
                <p className="subtitle">{insight.type}</p>
                <strong>{insight.title}</strong>
                <p className="subtitle">{insight.detail}</p>
              </div>
            ))}
            {insights.length === 0 && <p className="subtitle">Данных пока недостаточно.</p>}
          </div>
        </Surface>

        <Surface>
          <PageHeader
            variant="section"
            align="center"
            title="Цель по объекту"
            description="Простой таргет: лимит суммы или среднего потребления."
          />
          <GoalEditor
            goal={goalForProperty}
            onSave={(threshold, metric) => updateGoal(threshold, metric)}
            disabled={!selectedProperty}
          />
        </Surface>
      </div>

      {favoriteCharts.length > 0 && (
        <Surface>
          <PageHeader
            variant="section"
            title="Закреплённые панели"
            description="Избранные конфигурации из исследователя всегда под рукой."
          />
          <div className="favorite-grid">
            {favoriteCharts.slice(0, 4).map((fav) => {
              const favData = favoritesData[fav.id];
              return (
                <div className="favorite-chart" key={fav.id}>
                  <div className="favorite-chart-header">
                    <div>
                      <strong>{fav.name}</strong>
                      <p className="subtitle">
                        {RANGE_LABELS[fav.rangePreset]} · {RESOURCE_LABELS[fav.resourceType] || (fav.resourceType ? fav.resourceType : "все ресурсы")}
                      </p>
                    </div>
                  </div>
                  {favData ? (
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={favData.monthly}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" hide />
                        <YAxis hide />
                        <Tooltip />
                        <Line type="monotone" dataKey="total_amount" stroke="#f97316" dot={false} />
                      </LineChart>
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

      <Surface>
        <PageHeader
          variant="section"
          title="Свежие показания"
          description="Последние записи с пометками по ресурсам."
          actions={
            <div className="chip-row">
              <span className="chip">Лента</span>
              <span className="chip">События</span>
            </div>
          }
        />
        <div className="timeline">
          {lastReadings.map((r) => {
            const meter = r.meter_detail || {};
            return (
              <div key={r.id} className="timeline-item">
                <div>
                  <strong>{r.reading_date}</strong>
                  <p className="subtitle">{RESOURCE_LABELS[meter.resource_type] || meter.resource_type || "Счетчик"}</p>
                </div>
                <div>
                  <div className="inline justify-between">
                    <span>{`${r.value} ${meter.unit || ""}`}</span>
                    <span className="badge">{meter.serial_number || meter.id}</span>
                  </div>
                  <p className="subtitle">{r.amount_value ? `${Number(r.amount_value).toFixed(2)} ₽` : "—"}</p>
                </div>
              </div>
            );
          })}
          {lastReadings.length === 0 && <p className="subtitle">Нет показаний по выбранному объекту.</p>}
        </div>
      </Surface>
    </div>
  );
}

function GoalEditor({
  goal,
  onSave,
  disabled,
}: {
  goal?: GoalConfig;
  onSave: (threshold: number, metric: GoalConfig["metric"]) => void;
  disabled: boolean;
}) {
  const [threshold, setThreshold] = useState(goal?.threshold || 300);
  const [metric, setMetric] = useState<GoalConfig["metric"]>(goal?.metric || "amount");

  useEffect(() => {
    if (goal) {
      setThreshold(goal.threshold);
      setMetric(goal.metric);
    }
  }, [goal]);

  return (
    <div className="goal-card">
      <div className="form-grid">
        <label>Метрика</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value as GoalConfig["metric"])} disabled={disabled}>
          <option value="amount">Сумма за месяц (₽)</option>
          <option value="consumption">Среднее потребление</option>
        </select>
        <label>Порог</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          disabled={disabled}
        />
        <div></div>
        <button type="button" onClick={() => onSave(threshold, metric)} disabled={disabled}>
          Сохранить цель
        </button>
      </div>
    </div>
  );
}

function buildInsights(charges: AnalyticsResponse | null, readings: any[]) {
  const list: { title: string; detail: string; type: string }[] = [];
  if (charges?.monthly?.length) {
    const sorted = [...charges.monthly].sort((a, b) => (a.month > b.month ? 1 : -1));
    sorted.forEach((m, idx) => {
      if (idx === 0) return;
      const prev = sorted[idx - 1];
      const delta = m.total_amount - prev.total_amount;
      const percent = prev.total_amount ? (delta / prev.total_amount) * 100 : 0;
      if (percent > 18) {
        list.push({
          type: "Скачок",
          title: `${formatMonth(m.month)}: +${percent.toFixed(1)}% к предыдущему месяцу`,
          detail: `Сумма ${m.total_amount.toFixed(2)} ₽ против ${prev.total_amount.toFixed(2)} ₽`,
        });
      }
    });

    const average =
      sorted.reduce((sum, m) => sum + m.total_amount, 0) / (sorted.length || 1);
    const maxMonth = sorted.reduce((acc, cur) => (cur.total_amount > acc.total_amount ? cur : acc), sorted[0]);
    if (maxMonth.total_amount > average * 1.35) {
      list.push({
        type: "Аномалия",
        title: `${formatMonth(maxMonth.month)} выше среднего`,
        detail: `Среднее ${average.toFixed(2)} ₽, всплеск до ${maxMonth.total_amount.toFixed(2)} ₽`,
      });
    }
  }

  if (readings.length) {
    const lastByMeter: Record<string, string> = {};
    readings.forEach((r) => {
      const meterId = r.meter_detail?.id || r.meter;
      if (!lastByMeter[meterId]) lastByMeter[meterId] = r.reading_date;
    });
    Object.entries(lastByMeter).forEach(([meterId, dateStr]) => {
      const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 45) {
        list.push({
          type: "Тишина",
          title: `Нет данных по счётчику ${meterId}`,
          detail: `Последняя запись ${dateStr}, прошло ${days} дней`,
        });
      }
    });
  }

  return list.slice(0, 6);
}
