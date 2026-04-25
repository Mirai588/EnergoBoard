import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../api";
import { Meter, Property } from "../App";
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

export function MetersPage({ selectedProperty, properties, onSelectProperty }: Props) {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [resourceType, setResourceType] = useState("electricity");
  const [unit, setUnit] = useState("kwh");
  const [serial, setSerial] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProperty) {
      api.get("meters/", { params: { property: selectedProperty } }).then(({ data }) => setMeters(data));
    } else {
      setMeters([]);
    }
  }, [selectedProperty]);

  const addMeter = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);
    if (!selectedProperty) return;
    if (!serial.trim()) {
      setError("Введите серийный номер");
      return;
    }
    try {
      const { data } = await api.post("meters/", {
        property: selectedProperty,
        resource_type: resourceType,
        unit,
        serial_number: serial,
      });
      setMeters([...meters, data]);
      setSerial("");
      setFeedback("Счётчик добавлен");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Не удалось добавить счётчик");
    }
  };

  const removeMeter = async (id: number) => {
    await api.delete(`meters/${id}/`);
    setMeters(meters.filter((m) => m.id !== id));
    setFeedback("Счётчик удалён");
  };

  const updateMeter = async (meter: Meter, patch: Partial<Meter>) => {
    const { data } = await api.patch(`meters/${meter.id}/`, patch);
    setMeters(meters.map((m) => (m.id === meter.id ? data : m)));
    setFeedback("Сохранено");
  };

  const grouped = useMemo(() => {
    const bucket: Record<string, Meter[]> = {};
    meters.forEach((m) => {
      if (!bucket[m.resource_type]) bucket[m.resource_type] = [];
      bucket[m.resource_type].push(m);
    });
    return bucket;
  }, [meters]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Центр приборов"
        title="Управление приборами"
        description="Добавляйте счётчики и следите за активными приборами по объекту."
        actions={
          <div className="secondary-nav">
            <button className="active" type="button">
              Приборы
            </button>
            <button type="button" onClick={() => selectedProperty && onSelectProperty(selectedProperty)}>
              Синхронизировать
            </button>
          </div>
        }
      />

      <Surface>
        <div className="section-grid">
          <div>
            <p className="subtitle">Шаг 1 · Выберите объект</p>
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
          </div>
          <div className="info-tile highlight-panel">
            <p className="subtitle">Шаг 2 · Добавьте прибор</p>
            <p className="subtitle">Заполните форму, чтобы прибор появился в списке и аналитике.</p>
          </div>
        </div>
      </Surface>

      {selectedProperty && (
        <div className="grid-2col">
          <Surface as="form" onSubmit={addMeter}>
            <PageHeader variant="section" title="Добавить счётчик" description="Новый прибор появится в связанном объекте." />
            <div className="form-grid">
              <label>Тип ресурса</label>
              <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <label>Единицы</label>
              <input placeholder="кВт·ч, м³..." value={unit} onChange={(e) => setUnit(e.target.value)} />
              <label>Серийный номер</label>
              <input placeholder="Укажите серийный номер" value={serial} onChange={(e) => setSerial(e.target.value)} />
              <div></div>
              <button type="submit">Сохранить прибор</button>
            </div>
            <div className="inline justify-between mt-xs">
              {error && <p className="error">{error}</p>}
              {feedback && <p className="success">{feedback}</p>}
            </div>
          </Surface>

          <Surface>
            <PageHeader variant="section" title="Сводка по типам" description="Короткий обзор активных счётчиков." />
            <div className="meter-stack">
              {Object.entries(grouped).map(([resource, items]) => (
                <div key={resource} className="meter-card">
                  <p className="subtitle">{RESOURCE_LABELS[resource] || resource}</p>
                  <strong>{items.length} шт.</strong>
                  <div className="chip-row mt-xs">
                    {items.map((m) => (
                      <span key={m.id} className="chip">
                        {m.serial_number || m.id} · {m.unit}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {meters.length === 0 && <p className="subtitle">Пока нет приборов.</p>}
            </div>
          </Surface>
        </div>
      )}

      <Surface>
        <PageHeader
          variant="section"
          title="Живой список"
          description="Быстрое управление приборами без переходов и лишних таблиц."
        />
        {selectedProperty ? (
          <div className="meter-stack">
            {meters.map((m) => (
              <div key={m.id} className="meter-card">
                <div className="inline justify-between">
                  <strong>{RESOURCE_LABELS[m.resource_type] || m.resource_type}</strong>
                  <span className="badge">{m.serial_number}</span>
                </div>
                <p className="subtitle">Ед.: {m.unit}</p>
                <div className="table-actions">
                  <button type="button" className="ghost" onClick={() => updateMeter(m, { is_active: !m.is_active })}>
                    {m.is_active ? "Деактивировать" : "Активировать"}
                  </button>
                  <button type="button" className="link" onClick={() => removeMeter(m.id)}>
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            {meters.length === 0 && <p className="subtitle">Нет приборов для выбранного объекта.</p>}
          </div>
        ) : (
          <p className="subtitle">Выберите объект, чтобы увидеть связанные счётчики.</p>
        )}
      </Surface>
    </div>
  );
}
