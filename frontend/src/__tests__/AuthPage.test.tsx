import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { vi } from "vitest";
import { AuthPage } from "../pages/AuthPage";

describe("AuthPage fuzz", () => {
  it("never throws for any username/password/email inputs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.string({ minLength: 0, maxLength: 300 }),
        async (username, password, email) => {
          cleanup();
          const onAuth = vi.fn();
          const onLogin = vi.fn().mockResolvedValue({ access: "t", user: {} });
          const onRegister = vi.fn().mockResolvedValue({ access: "t", user: {} });
          render(
            <AuthPage
              onAuthenticated={onAuth}
              onLogin={onLogin}
              onRegister={onRegister}
            />,
          );
          const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
          const usernameInput = inputs.find((i) => i.placeholder === "Имя пользователя");
          const emailInput = inputs.find((i) => i.placeholder.includes("восстановления"));
          if (usernameInput) {
            fireEvent.change(usernameInput, { target: { value: username } });
          }
          if (emailInput) {
            fireEvent.change(emailInput, { target: { value: email } });
          }
          const passwordInput = screen.getByPlaceholderText(/Минимум 8 символов/) as HTMLInputElement;
          fireEvent.change(passwordInput, { target: { value: password } });
          const btn = screen.queryByRole("button", { name: "Войти" });
          if (btn) fireEvent.click(btn);
          await new Promise((r) => setTimeout(r, 10));
          expect(document.body).toBeTruthy();
        },
      ),
      { numRuns: 20 },
    );
  });

  it("always shows error message when login fails", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.constantFrom("Ошибка", "Неверный пароль", "Пользователь не найден"),
        async (username, password, errorMsg) => {
          cleanup();
          const onLogin = vi.fn().mockRejectedValue({
            response: { data: { detail: errorMsg } },
          });
          render(
            <AuthPage
              onAuthenticated={vi.fn()}
              onLogin={onLogin}
              onRegister={vi.fn()}
            />,
          );
          const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
          const usernameInput = inputs.find((i) => i.placeholder === "Имя пользователя");
          if (usernameInput) {
            fireEvent.change(usernameInput, { target: { value: username } });
          }
          const passwordInput = screen.getByPlaceholderText(/Минимум 8 символов/) as HTMLInputElement;
          fireEvent.change(passwordInput, { target: { value: password } });
          fireEvent.click(screen.getByRole("button", { name: "Войти" }));
          await new Promise((r) => setTimeout(r, 10));
          expect(screen.queryByText(errorMsg) || screen.queryByText("Ошибка авторизации")).toBeTruthy();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("handles tab switching without crash", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.string({ minLength: 0, maxLength: 100 }),
        async (startRegister, username) => {
          cleanup();
          const onAuth = vi.fn();
          const onLogin = vi.fn().mockResolvedValue({ access: "t", user: {} });
          const onRegister = vi.fn().mockResolvedValue({ access: "t", user: {} });
          const { container } = render(
            <AuthPage
              onAuthenticated={onAuth}
              onLogin={onLogin}
              onRegister={onRegister}
            />,
          );
          if (startRegister) {
            const switchBtn = screen.queryByRole("button", { name: "Создать новый доступ" });
            if (switchBtn) fireEvent.click(switchBtn);
          }
          const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
          const usernameInput = inputs.find((i) => i.placeholder === "Имя пользователя");
          if (usernameInput) {
            fireEvent.change(usernameInput, { target: { value: username } });
          }
          expect(() => container.querySelector(".auth-page")).not.toThrow();
        },
      ),
      { numRuns: 10 },
    );
  });
});
