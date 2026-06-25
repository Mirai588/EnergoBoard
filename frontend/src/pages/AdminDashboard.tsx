import { useEffect, useState } from "react";
import api from "../api";
import { PageHeader, Surface } from "../components/ui";

interface DashboardData {
  total_users: number;
  total_properties: number;
  total_meters: number;
  total_readings: number;
  total_charges: number;
  total_payments: number;
  recent_users: Array<{
    id: number;
    username: string;
    email: string;
    is_staff: boolean;
    is_active: boolean;
    date_joined: string;
  }>;
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get<DashboardData>("admin/dashboard/").then(({ data }) => setData(data));
  }, []);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Администрирование"
        title="Панель управления системой"
        description="Общая статистика и мониторинг состояния платформы."
      />

      {data && (
        <>
          <div className="hero-grid">
            <div className="info-tile highlight-panel">
              <p className="subtitle">Пользователи</p>
              <div className="stat-value">{data.total_users}</div>
              <span className="badge">Зарегистрировано в системе</span>
            </div>
            <div className="info-tile">
              <p className="subtitle">Объекты</p>
              <div className="stat-value">{data.total_properties}</div>
              <span className="badge">Недвижимость</span>
            </div>
            <div className="info-tile">
              <p className="subtitle">Приборы учёта</p>
              <div className="stat-value">{data.total_meters}</div>
              <span className="badge">Активных счётчиков</span>
            </div>
            <div className="info-tile">
              <p className="subtitle">Показания</p>
              <div className="stat-value">{data.total_readings}</div>
              <span className="badge">Всего записей</span>
            </div>
            <div className="info-tile">
              <p className="subtitle">Начисления</p>
              <div className="stat-value">{data.total_charges}</div>
              <span className="badge">Всего начислений</span>
            </div>
            <div className="info-tile">
              <p className="subtitle">Платежи</p>
              <div className="stat-value">{data.total_payments}</div>
              <span className="badge">Всего платежей</span>
            </div>
          </div>

          <Surface>
            <PageHeader
              variant="section"
              title="Последние зарегистрированные пользователи"
              description="Новые аккаунты в системе."
            />
            <div className="timeline">
              {data.recent_users.map((u) => (
                <div key={u.id} className="timeline-item">
                  <div>
                    <strong>{u.username}</strong>
                    <p className="subtitle">{u.email || "—"}</p>
                  </div>
                  <div>
                    <span className="badge">{u.is_staff ? "Администратор" : "Пользователь"}</span>
                    <p className="subtitle">{new Date(u.date_joined).toLocaleDateString("ru-RU")}</p>
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </>
      )}

      {!data && <p className="subtitle">Загрузка данных...</p>}
    </div>
  );
}
