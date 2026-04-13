import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8100/api/",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  async login(username: string, password: string) {
    const { data } = await api.post("auth/login/", { username, password });
    return data;
  },
  async register(username: string, password: string, email?: string) {
    const { data } = await api.post("auth/register/", { username, password, email });
    return data;
  },
};

export default api;
