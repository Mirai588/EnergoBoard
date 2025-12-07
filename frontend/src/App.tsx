import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import api, { authApi } from "./api";
import {
  AnalyticsPage,
  AuthPage,
  Dashboard,
  MetersPage,
  PropertiesPage,
  ReadingsPage,
} from "./pages";
import "./App.css";

export type Property = { id: number; name: string; address: string };
export type Meter = {
  id: number;
  property: number;
  resource_type: string;
  unit: string;
  serial_number: string;
  installed_at?: string;
  is_active: boolean;
};

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [access, setAccess] = useState<string | null>(localStorage.getItem("access"));
  const [user, setUser] = useState<any>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<number | null>(() => {
    const stored = localStorage.getItem("activeProperty");
    return stored ? Number(stored) : null;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    if (access) {
      api.get("properties/").then(({ data }) => {
        setProperties(data);
        if (!selectedProperty && data.length > 0) {
          setSelectedProperty(data[0].id);
          localStorage.setItem("activeProperty", String(data[0].id));
        }
      });
    }
  }, [access]);

  const handleAuth = (tokens: any) => {
    setAccess(tokens.access);
    setUser(tokens.user || {});
    localStorage.setItem("access", tokens.access);
    if (tokens.refresh) localStorage.setItem("refresh", tokens.refresh);
    if (tokens.user) localStorage.setItem("user", JSON.stringify(tokens.user));
    navigate("/");
  };

  const logout = () => {
    setAccess(null);
    setUser(null);
    localStorage.clear();
    navigate("/auth");
  };

  const authed = useMemo(() => !!access, [access]);

  useEffect(() => {
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      setSidebarOpen((prev) => (isDesktop ? true : prev));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const navSections = [
    {
      label: "Рабочая среда",
      items: [
        { to: "/", label: "Дашборд" },
        { to: "/analytics", label: "Исследователь" },
      ],
    },
    {
      label: "Активы",
      items: [
        { to: "/properties", label: "Объекты" },
        { to: "/meters", label: "Приборы" },
      ],
    },
    {
      label: "Потоки данных",
      items: [
        { to: "/readings", label: "Лента показаний" },
      ],
    },
  ];

  const isAuthRoute = location.pathname.startsWith("/auth");
  const shellClass = `app-shell${isAuthRoute ? " auth-mode" : ""}`;

  return (
    <div className={shellClass}>
      {authed && !isAuthRoute && (
        <>
          <aside id="sidebar" className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Основная навигация">
            <div className="brand-block">
              <div className="brand-mark" aria-hidden>
                <img src="/logo.svg" alt="Эмблема EnergoBoard" />
              </div>
              <div>
                <div className="brand-name">EnergoBoard</div>
                <div className="brand-tagline">Энергия под контролем</div>
              </div>
            </div>

            <div className="sidebar-section">
              <p className="section-title">Профиль</p>
              <div className="active-context">
                <div>
                  <p className="subtitle">Активный пользователь</p>
                  <strong>{user?.username}</strong>
                </div>
                <button className="ghost" onClick={logout}>
                  Выйти
                </button>
              </div>
            </div>

            {navSections.map((section) => (
              <div key={section.label} className="sidebar-section">
                <p className="section-title">{section.label}</p>
                <nav className="nav-links">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => (isActive ? "active" : "")}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            ))}
            <div className="sidebar-note">
              Управляйте объектами, приборами и показаниями, анализируйте начисления и формируйте удобные панели.
            </div>
          </aside>
          {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        </>
      )}
      <div className="main-area">
        {!isAuthRoute && (
          <header className="app-header">
            <div className="header-left">
              {authed && (
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  aria-label="Переключить навигацию"
                  aria-expanded={sidebarOpen}
                  aria-controls="sidebar"
                >
                  <span />
                  <span />
                </button>
              )}
              <div className="logo-pill header-logo">
                <div className="logo-mini" aria-hidden>
                  <img src="/logo.svg" alt="Эмблема EnergoBoard" />
                </div>
                <div>
                  <div className="brand-name">EnergoBoard</div>
                  <div className="brand-tagline">Светлая аналитика</div>
                </div>
              </div>
              <div className="workspace-switcher" aria-hidden>
                <span className="dot" />Рабочая среда
              </div>
            </div>
            {authed && <div className="user-menu" aria-hidden />}
          </header>
        )}
        <main className={`content ${isAuthRoute ? "auth-content" : ""}`}>
          <div className={isAuthRoute ? "auth-wrapper" : "page-wrapper"}>
            <Routes>
              <Route
                path="/auth"
                element={<AuthPage onAuthenticated={handleAuth} onRegister={authApi.register} onLogin={authApi.login} />}
              />
              <Route
                path="/"
                element={
                  authed ? (
                    <Dashboard
                      selectedProperty={selectedProperty}
                      onSelectProperty={(id) => {
                        setSelectedProperty(id);
                        localStorage.setItem("activeProperty", String(id));
                      }}
                      properties={properties}
                    />
                  ) : (
                    <Navigate to="/auth" />
                  )
                }
              />
              <Route
                path="/properties"
                element={
                  authed ? (
                    <PropertiesPage
                      properties={properties}
                      onUpdated={setProperties}
                      selectedProperty={selectedProperty}
                      onSelect={(id) => {
                        setSelectedProperty(id);
                        localStorage.setItem("activeProperty", String(id));
                      }}
                    />
                  ) : (
                    <Navigate to="/auth" />
                  )
                }
              />
              <Route
                path="/meters"
                element={
                  authed ? (
                    <MetersPage
                      selectedProperty={selectedProperty}
                      properties={properties}
                      onSelectProperty={(id) => {
                        setSelectedProperty(id);
                        localStorage.setItem("activeProperty", String(id));
                      }}
                    />
                  ) : (
                    <Navigate to="/auth" />
                  )
                }
              />
              <Route
                path="/readings"
                element={
                  authed ? (
                    <ReadingsPage
                      selectedProperty={selectedProperty}
                      properties={properties}
                      onSelectProperty={(id) => {
                        setSelectedProperty(id);
                        localStorage.setItem("activeProperty", String(id));
                      }}
                    />
                  ) : (
                    <Navigate to="/auth" />
                  )
                }
              />
              <Route
                path="/analytics"
                element={
                  authed ? (
                    <AnalyticsPage selectedProperty={selectedProperty} properties={properties} />
                  ) : (
                    <Navigate to="/auth" />
                  )
                }
              />
              <Route path="*" element={<Navigate to={authed ? "/" : "/auth"} replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
