import { useEffect, useState } from "react";
import api from "../api";
import { PropertiesPage } from "./PropertiesPage";
import { PageHeader, Surface } from "../components/ui";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
  properties_count: number;
  meters_count: number;
  readings_count: number;
}

interface UserProperty {
  id: number;
  name: string;
  address: string;
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [userProperties, setUserProperties] = useState<Record<number, UserProperty[]>>({});
  const [userMeters, setUserMeters] = useState<Record<number, any[]>>({});

  useEffect(() => {
    api.get<AdminUser[]>("admin/users/").then(({ data }) => setUsers(data));
  }, []);

  const toggleExpand = async (userId: number) => {
    if (expanded === userId) {
      setExpanded(null);
      return;
    }
    setExpanded(userId);

    if (!userProperties[userId]) {
      const { data: props } = await api.get<UserProperty[]>("properties/", {
        params: { owner: userId },
      });
      setUserProperties((prev) => ({ ...prev, [userId]: props }));
    }

    if (!userMeters[userId]) {
      const { data: meters } = await api.get("meters/", {
        params: { owner: userId },
      });
      setUserMeters((prev) => ({ ...prev, [userId]: meters }));
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Администрирование"
        title="Управление пользователями"
        description="Просмотр данных всех пользователей, их объектов и приборов."
      />

      <Surface>
        <PageHeader
          variant="section"
          title={`Все пользователи (${users.length})`}
          description="Нажмите на строку, чтобы раскрыть объекты и приборы."
        />

        <div className="timeline">
          {users.map((u) => (
            <div key={u.id}>
              <button
                className="timeline-item"
                style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "none", background: "none" }}
                onClick={() => toggleExpand(u.id)}
              >
                <div>
                  <strong>{u.username}</strong>
                  <p className="subtitle">{u.email || "—"}</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="badge">{u.properties_count} объект.</span>
                  <span className="badge">{u.meters_count} приб.</span>
                  <span className="badge">{u.readings_count} показ.</span>
                  {u.is_staff && <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>Админ</span>}
                </div>
              </button>

              {expanded === u.id && (
                <div style={{ padding: "8px 0 16px 24px", borderTop: "1px solid var(--border)" }}>
                  {userProperties[u.id]?.length > 0 ? (
                    userProperties[u.id].map((prop) => (
                      <div key={prop.id} style={{ marginBottom: 12 }}>
                        <div className="inline justify-between">
                          <strong>{prop.name}</strong>
                          <span className="badge">{userMeters[u.id]?.filter((m) => m.property === prop.id).length || 0} приборов</span>
                        </div>
                        <p className="subtitle">{prop.address}</p>
                        {userMeters[u.id]
                          ?.filter((m) => m.property === prop.id)
                          .map((m) => (
                            <div key={m.id} className="chip-row" style={{ marginTop: 4 }}>
                              <span className="chip">
                                {m.resource_type} · {m.serial_number || "б/н"} · {m.unit}
                              </span>
                            </div>
                          ))}
                      </div>
                    ))
                  ) : (
                    <p className="subtitle">Нет объектов</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}
