import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../api";
import { Meter, Property } from "../App";
import { PageHeader, Surface } from "../components/ui";

interface Props {
  properties: Property[];
  onUpdated: (list: Property[]) => void;
  selectedProperty: number | null;
  onSelect: (id: number) => void;
}

const TAGS = ["Дом", "Офис", "Склад", "Дача"];

export function PropertiesPage({ properties, onUpdated, selectedProperty, onSelect }: Props) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [meters, setMeters] = useState<Meter[]>([]);
  const [tags, setTags] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!properties.length) {
      api.get("properties/").then(({ data }) => onUpdated(data));
    }
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      api.get("meters/", { params: { property: selectedProperty } }).then(({ data }) => setMeters(data));
    } else {
      setMeters([]);
    }
  }, [selectedProperty]);

  useEffect(() => {
    setTags((prev) => {
      const next = { ...prev };
      properties.forEach((p) => {
        if (!next[p.id]) {
          next[p.id] = TAGS[p.id % TAGS.length];
        }
      });
      return next;
    });
  }, [properties]);

  const addProperty = async (e: FormEvent) => {
    e.preventDefault();
    const { data } = await api.post("properties/", { name, address });
    onUpdated([...properties, data]);
    setName("");
    setAddress("");
  };

  const groupedMeters = useMemo(() => {
    const groups: Record<string, Meter[]> = {};
    meters.forEach((m) => {
      if (!groups[m.resource_type]) groups[m.resource_type] = [];
      groups[m.resource_type].push(m);
    });
    return groups;
  }, [meters]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Карта объектов"
        title="Объекты и приборы в одном окне"
        description="Выберите объект, чтобы сразу увидеть его приборы по типам."
        actions={
          <div className="secondary-nav">
            <button className="active" type="button">
              Объекты
            </button>
            <button type="button" onClick={() => selectedProperty && onSelect(selectedProperty)}>
              Синхронизировать
            </button>
          </div>
        }
      />

      <div className="property-rail">
        <Surface>
          <PageHeader
            variant="section"
            title="Каталог объектов"
            description="Выберите узел, чтобы увидеть его приборы и метки."
          />
          <div className="property-list">
            {properties.map((p) => {
              const active = selectedProperty === p.id;
              return (
                <div key={p.id} className={`property-card ${active ? "active" : ""}`}>
                  <div className="inline justify-between">
                    <strong>{p.name}</strong>
                    <span className="badge">{tags[p.id]}</span>
                  </div>
                  <p className="subtitle">{p.address}</p>
                  <div className="inline justify-between mt-xs">
                    <button type="button" className="ghost" onClick={() => onSelect(p.id)}>
                      Сделать активным
                    </button>
                    <span className="subtitle">ID {p.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>

        <Surface>
          <PageHeader
            variant="section"
            title="Паспорт объекта"
            description="Мгновенный обзор по активному объекту."
            align="center"
            actions={selectedProperty ? <span className="badge">{tags[selectedProperty]}</span> : undefined}
          />

          {!selectedProperty && <p className="subtitle">Выберите объект слева.</p>}

          {selectedProperty && (
            <>
              <div className="hero-grid">
                <div className="info-tile">
                  <p className="subtitle">Приборов всего</p>
                  <div className="stat-value">{meters.length}</div>
                  <p className="subtitle">По активному объекту</p>
                </div>
                <div className="info-tile">
                  <p className="subtitle">Типов ресурсов</p>
                  <div className="stat-value">{Object.keys(groupedMeters).length || 0}</div>
                  <p className="subtitle">Сгруппировано по данным прибора</p>
                </div>
              </div>

              <div className="meter-stack">
                {Object.entries(groupedMeters).map(([resource, ms]) => (
                  <div key={resource} className="meter-card">
                    <p className="subtitle">{resource}</p>
                    <strong>{ms.length} сч.</strong>
                    <div className="chip-row mt-xs">
                      {ms.map((m) => (
                        <span key={m.id} className="chip">
                          #{m.serial_number || m.id} · {m.unit}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {meters.length === 0 && <p className="subtitle">Приборов пока нет — добавьте на вкладке «Приборы».</p>}
              </div>
            </>
          )}
        </Surface>
      </div>

      <Surface>
        <PageHeader variant="section" title="Добавить объект" description="Заполните форму, чтобы добавить новый объект." />
        <form onSubmit={addProperty} className="form-grid">
          <label htmlFor="name">Название</label>
          <input id="name" placeholder="Например, ЖК Солнечный" value={name} onChange={(e) => setName(e.target.value)} required />
          <label htmlFor="address">Адрес</label>
          <input
            id="address"
            placeholder="Город, улица, дом"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
          <div></div>
          <button type="submit">Добавить объект</button>
        </form>
      </Surface>
    </div>
  );
}
