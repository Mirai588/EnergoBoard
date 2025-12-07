import { FormEvent, useState } from "react";

interface Props {
  onAuthenticated: (data: any) => void;
  onRegister: (username: string, password: string, email?: string) => Promise<any>;
  onLogin: (username: string, password: string) => Promise<any>;
}

export function AuthPage({ onAuthenticated, onRegister, onLogin }: Props) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = isRegister
        ? await onRegister(username, password, email)
        : await onLogin(username, password);
      onAuthenticated(payload);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Ошибка авторизации");
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="auth-hero__brand">
          <div className="logo-pill auth-hero__badge">
            <div className="logo-mini" aria-hidden>
              <img src="/logo.svg" alt="Эмблема EnergoBoard" />
            </div>
            <div>
              <div className="brand-name">EnergoBoard</div>
              <div className="brand-tagline">Светлая аналитика энергоресурсов</div>
            </div>
          </div>
          <div className="auth-hero__brand-copy">
            <p className="subtitle">Добро пожаловать в</p>
            <h1>EnergoBoard</h1>
            <p className="subtitle auth-hero__description">
              Единый кабинет для объектов, приборов, начислений и аналитики.
            </p>
          </div>
        </div>
        <div className="auth-hero__highlights">
          <div className="auth-hero__highlight-card">
            <strong>Мониторинг начислений</strong>
            <p className="subtitle">
              Собирайте данные и контролируйте начисления по каждому объекту в одной панели.
            </p>
          </div>
          <div className="auth-hero__highlight-card">
            <strong>Любимые панели</strong>
            <p className="subtitle">
              Сохраняйте подборки фильтров и наблюдайте ключевые тренды в удобных виджетах.
            </p>
          </div>
          <div className="auth-hero__highlight-card">
            <strong>Безопасный доступ</strong>
            <p className="subtitle">
              Двухстороннее шифрование и аккуратный интерфейс на любых устройствах.
            </p>
          </div>
        </div>
      </section>

      <div className="auth-card">
        <div className="auth-card-header">
          <p className="subtitle">{isRegister ? "Создайте доступ" : "Войдите, чтобы продолжить"}</p>
          <h3 className="auth-title">{isRegister ? "Регистрация" : "Авторизация"}</h3>
          <p className="subtitle muted-text">Данные передаются по защищённому соединению.</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Логин
            <input
              placeholder="Имя пользователя"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          {isRegister && (
            <label>
              Email
              <input
                type="email"
                placeholder="Для восстановления и уведомлений"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          <label>
            Пароль
            <input
              type="password"
              placeholder="Минимум 8 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="actions auth-actions">
            <button type="submit">{isRegister ? "Создать аккаунт" : "Войти"}</button>
            <button
              className="link"
              type="button"
              onClick={() => setIsRegister((v) => !v)}
            >
              {isRegister ? "У меня уже есть доступ" : "Создать новый доступ"}
            </button>
          </div>
          <p className="subtitle">Вход выполняется через проверенные учётные данные.</p>
        </form>
      </div>
    </div>
  );
}
