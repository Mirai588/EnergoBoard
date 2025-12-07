import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AuthPage } from "../pages/AuthPage";

describe("AuthPage", () => {
  it("submits login flow and calls onAuthenticated", async () => {
    const onAuthenticated = vi.fn();
    const onLogin = vi.fn().mockResolvedValue({ access: "token", user: { username: "demo" } });
    const onRegister = vi.fn();

    render(<AuthPage onAuthenticated={onAuthenticated} onLogin={onLogin} onRegister={onRegister} />);

    await userEvent.type(screen.getByPlaceholderText("Имя пользователя"), "demo");
    await userEvent.type(screen.getByPlaceholderText("Минимум 8 символов"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({ access: "token", user: { username: "demo" } }));
    expect(onLogin).toHaveBeenCalledWith("demo", "password123");
  });

  it("shows error when login fails", async () => {
    const onAuthenticated = vi.fn();
    const onLogin = vi
      .fn()
      .mockRejectedValue({ response: { data: { detail: "Ошибка авторизации" } } });

    render(<AuthPage onAuthenticated={onAuthenticated} onLogin={onLogin} onRegister={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Имя пользователя"), "demo");
    await userEvent.type(screen.getByPlaceholderText("Минимум 8 символов"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Ошибка авторизации")).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("switches to registration mode and calls onRegister", async () => {
    const onAuthenticated = vi.fn();
    const onRegister = vi.fn().mockResolvedValue({ access: "token", user: { username: "new" } });

    render(<AuthPage onAuthenticated={onAuthenticated} onLogin={vi.fn()} onRegister={onRegister} />);

    await userEvent.click(screen.getByRole("button", { name: "Создать новый доступ" }));
    await userEvent.type(screen.getByPlaceholderText("Имя пользователя"), "newuser");
    await userEvent.type(screen.getByPlaceholderText("Минимум 8 символов"), "password123");
    await userEvent.type(screen.getByPlaceholderText("Для восстановления и уведомлений"), "mail@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    await waitFor(() =>
      expect(onRegister).toHaveBeenCalledWith("newuser", "password123", "mail@example.com"),
    );
    expect(onAuthenticated).toHaveBeenCalledWith({ access: "token", user: { username: "new" } });
  });
});
